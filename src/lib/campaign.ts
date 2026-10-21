import fs from "node:fs";
import path from "node:path";
import {
  analyzeImage,
  getAiConfig,
  planCampaignPosts,
  type AiConfig,
} from "./ai";
import {
  assignCampaignDates,
  countFutureCampaignPosts,
  countUnusedCampaignImages,
  createPost,
  defaultStartDate,
  getImage,
  getImageFileNames,
  getSettings,
  listCampaignPosts,
  listImages,
  recentCampaignPostTitles,
  saveImageAnalysis,
  saveSettings,
  setImageCampaign,
  UPLOAD_DIR,
} from "./db";
import {
  CAMPAIGN_TRACKS,
  campaignModel,
  campaignWeeklyCap,
  pickCampaignTrack,
  sanitizeCampaignHashtags,
} from "./campaign-rules";
import { todayStr } from "./utils";
import type {
  CampaignProgress,
  Photo,
  Post,
  Settings,
} from "./types";

const globalForCampaign = globalThis as unknown as {
  __campaignPlanning?: boolean;
  __campaignProgress?: CampaignProgress;
};

const EMPTY_CAMPAIGN_PROGRESS: CampaignProgress = {
  running: false,
  source: null,
  phase: "idle",
  message: "",
  batch: 0,
  totalBatches: 0,
  analyzed: 0,
  created: 0,
  remaining: 0,
  startedAt: null,
  updatedAt: null,
  error: null,
};

function setCampaignProgress(patch: Partial<CampaignProgress>) {
  const previous =
    globalForCampaign.__campaignProgress || EMPTY_CAMPAIGN_PROGRESS;
  globalForCampaign.__campaignProgress = {
    ...previous,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
}

export function getCampaignProgress(): CampaignProgress {
  return (
    globalForCampaign.__campaignProgress || {
      ...EMPTY_CAMPAIGN_PROGRESS,
    }
  );
}

export interface CampaignPlanOptions {
  campaign?: string;
  all?: boolean;
  maxPosts?: number;
  maxBatches?: number;
  imageIds?: string[];
  startDate?: string;
  instruction?: string;
  source?: "manual" | "auto";
}

export interface CampaignPlanRun {
  campaign: string;
  created: Post[];
  warnings: string[];
  analyzed: number;
  remaining: number;
  mock: boolean;
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function resolveStartDate(input: string | undefined, settings: Settings) {
  const valid = (value: string | undefined) =>
    Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const today = todayStr();
  for (const candidate of [input, settings.campaign_start_date]) {
    if (valid(candidate) && candidate && candidate >= today) return candidate;
  }
  return defaultStartDate();
}

async function analyzeMissing(
  config: AiConfig,
  settings: Settings,
  images: Photo[],
  limit: number,
  onProgress?: (processed: number, total: number) => void
): Promise<number> {
  let count = 0;
  let processed = 0;
  const needsAnalysis = (image: Photo) =>
    !image.analysis || (config.enabled && Boolean(image.analysis.mock));
  const total = Math.min(
    images.filter((image) => needsAnalysis(image)).length,
    limit
  );
  for (const image of images) {
    if (!needsAnalysis(image)) continue;
    if (count >= limit) break;
    try {
      const names = getImageFileNames(image.id);
      if (!names) continue;
      const filename = names.previewName || names.filename;
      const filePath = path.join(UPLOAD_DIR, filename);
      if (!fs.existsSync(filePath)) continue;
      const base64 = fs.readFileSync(filePath).toString("base64");
      const mime = names.previewName ? "image/jpeg" : names.mime;
      const analysis = await analyzeImage(
        config,
        { base64, mime, id: image.id, name: names.originalName },
        settings
      );
      saveImageAnalysis(image.id, analysis);
      image.analysis = analysis;
      image.summary = analysis.summary;
      count++;
    } catch {
      // 单张识别失败不影响整批排期，下次会重试
    } finally {
      processed++;
      onProgress?.(processed, total);
    }
  }
  return count;
}

function campaignCandidates(
  campaign: string,
  imageIds?: string[]
): Photo[] {
  if (imageIds?.length) {
    const images: Photo[] = [];
    for (const id of imageIds) {
      const image = getImage(id);
      if (!image || image.status !== "unused" || image.manualUsed) continue;
      if (image.kind !== "image") continue;
      if (image.campaign && image.campaign !== campaign) continue;
      if (!image.campaign) setImageCampaign(image.id, campaign);
      images.push({ ...image, campaign });
    }
    return images;
  }
  return listImages({ status: "unused", campaign, order: "asc" }).filter(
    (image) => image.kind === "image"
  );
}

export async function runCampaignPlan(
  options: CampaignPlanOptions = {}
): Promise<CampaignPlanRun> {
  if (globalForCampaign.__campaignPlanning) {
    throw new Error("活动排期正在生成中，请稍候再试");
  }
  globalForCampaign.__campaignPlanning = true;
  const warnings: string[] = [];
  try {
    const settings = getSettings();
    const campaign = (options.campaign || settings.campaign_name || "").trim();
    if (!campaign) throw new Error("请先在创作营里填写活动名称");

    const config = getAiConfig();
    if (options.source === "auto" && !config.enabled) {
      return {
        campaign,
        created: [],
        warnings: ["AI 未配置，自动排期已暂停"],
        analyzed: 0,
        remaining: countUnusedCampaignImages(campaign),
        mock: true,
      };
    }

    const weeklyCap = campaignWeeklyCap(settings);
    const bodyMin = clamp(Number(settings.campaign_body_min), 50, 800, 220);
    const model = campaignModel(settings);
    if (!model) {
      throw new Error("请先在创作营设置车型词，再生成活动文案");
    }
    const batchImages = clamp(
      Number(settings.campaign_batch_images),
      6,
      45,
      30
    );
    const startDate = resolveStartDate(options.startDate, settings);
    const maxBatches = Math.max(1, options.maxBatches ?? (options.all ? 3 : 1));
    const maxPosts = Math.max(
      1,
      options.maxPosts ?? (options.all ? 40 : Math.max(weeklyCap, 10))
    );

    setCampaignProgress({
      running: true,
      source: options.source || "manual",
      phase: "starting",
      message: "正在准备活动排期…",
      batch: 0,
      totalBatches: maxBatches,
      analyzed: 0,
      created: 0,
      remaining: countUnusedCampaignImages(campaign),
      startedAt: new Date().toISOString(),
      error: null,
    });

    if (options.source === "auto") {
      saveSettings({ campaign_last_plan_at: new Date().toISOString() });
    }

    const created: Post[] = [];
    let analyzed = 0;
    let batchesDone = 0;
    let batchImageIds = options.imageIds;

    for (let batch = 0; batch < maxBatches; batch++) {
      let candidates = campaignCandidates(campaign, batchImageIds);
      batchImageIds = undefined;

      if (!candidates.length) break;

      setCampaignProgress({
        phase: "analyzing",
        batch: batch + 1,
        totalBatches: maxBatches,
        message: `第 ${batch + 1}/${maxBatches} 批：正在识别素材…`,
      });

      analyzed += await analyzeMissing(
        config,
        settings,
        candidates.slice(0, batchImages * 2),
        12,
        (processed, total) => {
          setCampaignProgress({
            phase: "analyzing",
            analyzed: analyzed + processed,
            message: `正在识别素材 ${processed}/${total}…`,
          });
        }
      );

      setCampaignProgress({
        phase: "planning",
        analyzed,
        message: `第 ${batch + 1}/${maxBatches} 批：AI 正在分组、写标题和正文…`,
      });

      candidates = candidates.filter(
        (image) =>
          Boolean(image.analysis) &&
          !(config.enabled && image.analysis?.mock)
      );
      if (!candidates.length) {
        warnings.push("本批素材还没有识别结果，稍后会自动重试");
        break;
      }

      const slice = candidates.slice(0, batchImages);
      const recentTitles = recentCampaignPostTitles(campaign, 40);
      const trackUsage: Record<string, number> = {};
      for (const post of listCampaignPosts(campaign, { limit: 30 })) {
        for (const track of CAMPAIGN_TRACKS) {
          if (post.hashtags.includes(track)) {
            trackUsage[track] = (trackUsage[track] || 0) + 1;
          }
        }
      }
      const result = await planCampaignPosts(config, slice, settings, {
        campaign,
        bodyMin,
        recentTitles,
        model,
        trackUsage,
        instruction: options.instruction,
      });
      warnings.push(...result.warnings);

      if (!result.posts.length) break;

      setCampaignProgress({
        phase: "creating",
        created: created.length,
        message: `正在创建 ${result.posts.length} 篇笔记并排期…`,
      });

      const dates = assignCampaignDates(
        campaign,
        startDate,
        result.posts.length,
        weeklyCap
      );
      for (let index = 0; index < result.posts.length; index++) {
        const plan = result.posts[index];
        const track =
          plan.track &&
          (CAMPAIGN_TRACKS as readonly string[]).includes(plan.track)
            ? plan.track
            : pickCampaignTrack(plan);
        created.push(
          createPost({
            theme: plan.theme,
            title: plan.title,
            body: plan.body,
            hashtags: sanitizeCampaignHashtags(
              model,
              track,
              plan.hashtags
            ),
            campaign,
            status: "draft",
            scheduledDate: dates[index] || startDate,
            scheduledTime: settings.campaign_time || plan.publishTime,
            coverImageId: plan.coverImageId,
            note: `活动「${campaign}」· ${plan.reason}`,
            images: plan.imageIds,
          })
        );
        setCampaignProgress({ created: created.length });
        if (created.length >= maxPosts) break;
      }

      batchesDone = batch + 1;
      setCampaignProgress({
        phase: "creating",
        created: created.length,
        remaining: countUnusedCampaignImages(campaign),
        batch: batchesDone,
        message: `第 ${batch + 1}/${maxBatches} 批完成，已生成 ${created.length} 篇…`,
      });

      if (created.length >= maxPosts) break;
      if (!options.all) break;
    }

    saveSettings({ campaign_last_plan_at: new Date().toISOString() });

    const remaining = countUnusedCampaignImages(campaign);
    setCampaignProgress({
      running: false,
      phase: "done",
      batch: batchesDone,
      totalBatches: maxBatches,
      analyzed,
      created: created.length,
      remaining,
      message: created.length
        ? `排期完成：新生成 ${created.length} 篇，剩余 ${remaining} 张素材`
        : "排期完成：本轮没有生成新作品",
      error: null,
    });

    return {
      campaign,
      created,
      warnings: warnings.slice(0, 20),
      analyzed,
      remaining,
      mock: !config.enabled,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setCampaignProgress({
      running: false,
      phase: "error",
      message: "排期生成失败",
      error: message,
    });
    throw error;
  } finally {
    globalForCampaign.__campaignPlanning = false;
  }
}

export async function ensureCampaignQueue(): Promise<void> {
  const settings = getSettings();
  if (settings.campaign_enabled !== "1") return;
  if (settings.campaign_auto_plan !== "1") return;
  if (globalForCampaign.__campaignPlanning) return;

  const config = getAiConfig();
  if (!config.enabled) return;

  const campaign = (settings.campaign_name || "").trim();
  if (!campaign) return;

  const weeklyCap = campaignWeeklyCap(settings);
  const bufferWeeks = clamp(Number(settings.campaign_buffer_weeks), 1, 12, 2);
  const target = bufferWeeks * weeklyCap;
  const future = countFutureCampaignPosts(campaign, todayStr());
  if (future >= target) return;

  if (countUnusedCampaignImages(campaign) <= 0) return;

  const last = Date.parse(settings.campaign_last_plan_at || "");
  if (Number.isFinite(last) && Date.now() - last < 20 * 60 * 1000) return;

  await runCampaignPlan({
    source: "auto",
    maxBatches: 1,
    maxPosts: Math.max(weeklyCap, target - future),
  });
}
