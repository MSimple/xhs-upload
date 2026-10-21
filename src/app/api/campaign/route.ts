import { NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai";
import {
  countCampaignPosts,
  countFutureCampaignPosts,
  countPublishedCampaignPosts,
  countPublishedCampaignPostsInRange,
  countPublishedForWeeklyCap,
  getSettings,
  listCampaignPosts,
  listImages,
  renameCampaign,
  saveSettings,
} from "@/lib/db";
import {
  CAMPAIGN_MIN_IMAGES,
  campaignBodyMin,
  campaignModel,
  campaignPostIssues,
  campaignPostWarnings,
  campaignWeeklyCap,
  currentDayRange,
  currentWeekRange,
} from "@/lib/campaign-rules";
import { isValidDateString, isValidTimeString } from "@/lib/content-rules";
import { fail, readJson } from "@/lib/api";
import { parseDateStr, toDateStr, todayStr } from "@/lib/utils";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";

function campaignSettings(settings: Settings) {
  return {
    campaign_enabled: settings.campaign_enabled,
    campaign_name: settings.campaign_name,
    campaign_city: settings.campaign_city,
    campaign_model: settings.campaign_model,
    campaign_tier: settings.campaign_tier,
    campaign_weekly_posts: settings.campaign_weekly_posts,
    campaign_buffer_weeks: settings.campaign_buffer_weeks,
    campaign_body_min: settings.campaign_body_min,
    campaign_time: settings.campaign_time,
    campaign_auto_plan: settings.campaign_auto_plan,
    campaign_start_date: settings.campaign_start_date,
    campaign_batch_images: settings.campaign_batch_images,
    campaign_points_per_post: settings.campaign_points_per_post,
    campaign_points_cap: settings.campaign_points_cap,
    campaign_last_plan_at: settings.campaign_last_plan_at,
  };
}

function weekKey(dateStr: string) {
  const date = parseDateStr(dateStr);
  const weekday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - weekday);
  return toDateStr(date);
}

function summary() {
  const settings = getSettings();
  const campaign = (settings.campaign_name || "").trim();
  const today = todayStr();
  const month = today.slice(0, 7);
  const unusedImages = listImages({ status: "unused", campaign }).filter(
    (image) => image.kind === "image"
  );
  const analyzed = unusedImages.filter((image) => image.analysis).length;
  const scheduled = countFutureCampaignPosts(campaign, today);
  const publishedThisMonth = countPublishedCampaignPosts(campaign, month);
  const points = Number(settings.campaign_points_per_post) || 0;
  const weeklyPointsCap = Number(settings.campaign_points_cap) || 0;
  const weeklyPostsCap = campaignWeeklyCap(settings);
  const week = currentWeekRange();
  const weeklyPublished = countPublishedForWeeklyCap(
    campaign,
    week.from,
    week.to
  );
  const weeklyPoints =
    weeklyPointsCap > 0
      ? Math.min(weeklyPublished * points, weeklyPointsCap)
      : weeklyPublished * points;

  const day = currentDayRange();
  const todayPublished = countPublishedCampaignPostsInRange(
    campaign,
    day.from,
    day.to
  );
  const campaignPosts = listCampaignPosts(campaign, { limit: 200 });
  const pendingPosts = campaignPosts.filter(
    (post) => post.status !== "published"
  );
  const upcoming = pendingPosts.filter((post) => post.scheduledDate);
  const dateCounts = new Map<string, number>();
  const weekCounts = new Map<string, number>();
  if (todayPublished > 0) {
    dateCounts.set(today, todayPublished);
  }
  if (weeklyPublished > 0) {
    weekCounts.set(weekKey(today), weeklyPublished);
  }
  for (const post of upcoming) {
    if (!post.scheduledDate) continue;
    dateCounts.set(
      post.scheduledDate,
      (dateCounts.get(post.scheduledDate) || 0) + 1
    );
    const key = weekKey(post.scheduledDate);
    weekCounts.set(key, (weekCounts.get(key) || 0) + 1);
  }
  const issues = pendingPosts
    .map((post) => {
      const list = campaignPostIssues(post, settings);
      const date = post.scheduledDate || "";
      if ((dateCounts.get(date) || 0) > 1) {
        list.push(
          `同一天排了 ${dateCounts.get(date)} 篇，规则每日最多 1 篇`
        );
      }
      const key = date ? weekKey(date) : "";
      if (key && (weekCounts.get(key) || 0) > weeklyPostsCap) {
        list.push(
          `本周排了 ${weekCounts.get(key)} 篇，规则每周最多 ${weeklyPostsCap} 篇`
        );
      }
      return {
        id: post.id,
        title: post.title,
        status: post.status,
        scheduledDate: post.scheduledDate,
        issues: list,
        warnings: campaignPostWarnings(post),
      };
    })
    .filter((item) => item.issues.length || item.warnings.length)
    .slice(0, 30);

  return {
    campaign,
    configured: getAiConfig().enabled,
    model: campaignModel(settings),
    announcement: {
      raw: settings.campaign_announcement_raw,
      links: (() => {
        try {
          const parsed = JSON.parse(settings.campaign_announcement_links || "[]");
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })(),
      month: settings.campaign_announcement_month,
      at: settings.campaign_announcement_at,
    },
    settings: campaignSettings(settings),
    rules: {
      minImages: CAMPAIGN_MIN_IMAGES,
      minBody: campaignBodyMin(settings),
      weeklyPostsCap,
    },
    counts: {
      tagged: listImages({ campaign }).filter((image) => image.kind === "image")
        .length,
      unused: unusedImages.length,
      analyzed,
      pendingAnalysis: Math.max(0, unusedImages.length - analyzed),
      scheduled,
      published: countCampaignPosts(campaign, "published"),
      publishedThisMonth,
      weeklyPublished,
      weeklyPostsCap,
      weeklyPoints,
      weeklyPointsCap,
      estimatedPoints: weeklyPoints,
    },
    issues,
    next: listCampaignPosts(campaign, {
      status: "ready",
      from: today,
      limit: 7,
    }),
  };
}

export async function GET() {
  try {
    return NextResponse.json(summary());
  } catch (error) {
    return fail(error, 500);
  }
}

function bit(value: unknown, fallback: string) {
  if (value === "0" || value === 0 || value === false) return "0";
  if (value === "1" || value === 1 || value === true) return "1";
  return fallback;
}

function int(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(fallback);
  return String(Math.min(max, Math.max(min, Math.round(n))));
}

export async function PUT(request: Request) {
  try {
    const body = await readJson<Partial<Settings>>(request);
    const current = getSettings();
    const previousCampaign = (current.campaign_name || "").trim();
    let nextCampaign = previousCampaign;
    const patch: Partial<Settings> = {};

    patch.campaign_enabled = bit(body.campaign_enabled, current.campaign_enabled);
    patch.campaign_auto_plan = bit(body.campaign_auto_plan, current.campaign_auto_plan);
    if (body.campaign_name !== undefined) {
      const name = String(body.campaign_name).trim().slice(0, 30);
      if (!name) return fail("活动名称不能为空");
      patch.campaign_name = name;
      nextCampaign = name;
    }
    if (body.campaign_city !== undefined) {
      patch.campaign_city = String(body.campaign_city).trim().slice(0, 20);
    }
    if (body.campaign_model !== undefined) {
      patch.campaign_model = String(body.campaign_model)
        .trim()
        .replace(/^#+/, "")
        .slice(0, 20);
    }
    if (body.campaign_tier !== undefined) {
      const tier = String(body.campaign_tier);
      if (tier !== "explorer" && tier !== "creator") {
        return fail("创作者等级只能是 explorer 或 creator");
      }
      patch.campaign_tier = tier;
      if (body.campaign_points_per_post === undefined) {
        patch.campaign_points_per_post = tier === "creator" ? "300" : "150";
      }
      if (body.campaign_points_cap === undefined) {
        patch.campaign_points_cap = tier === "creator" ? "1200" : "600";
      }
    }

    if (body.campaign_weekly_posts !== undefined) {
      patch.campaign_weekly_posts = int(
        body.campaign_weekly_posts,
        1,
        4,
        4
      );
    }
    if (body.campaign_body_min !== undefined) {
      patch.campaign_body_min = int(body.campaign_body_min, 50, 800, 220);
    }
    if (body.campaign_buffer_weeks !== undefined) {
      patch.campaign_buffer_weeks = int(
        body.campaign_buffer_weeks,
        1,
        12,
        2
      );
    }
    if (body.campaign_batch_images !== undefined) {
      patch.campaign_batch_images = int(body.campaign_batch_images, 6, 45, 30);
    }
    if (body.campaign_points_per_post !== undefined) {
      patch.campaign_points_per_post = int(
        body.campaign_points_per_post,
        0,
        10000,
        150
      );
    }
    if (body.campaign_points_cap !== undefined) {
      patch.campaign_points_cap = int(
        body.campaign_points_cap,
        0,
        10000,
        600
      );
    }
    if (body.campaign_start_date !== undefined) {
      const date = String(body.campaign_start_date).trim();
      if (date && !isValidDateString(date)) {
        return fail("开始日期不合法，应为 YYYY-MM-DD", 400);
      }
      patch.campaign_start_date = date;
    }
    if (body.campaign_time !== undefined) {
      const time = String(body.campaign_time).trim();
      if (!isValidTimeString(time)) {
        return fail("发布时间不合法，应为 HH:mm", 400);
      }
      patch.campaign_time = time;
    }

    saveSettings(patch);
    if (nextCampaign && nextCampaign !== previousCampaign) {
      renameCampaign(previousCampaign, nextCampaign);
    }
    return NextResponse.json(summary());
  } catch (error) {
    return fail(error, 500);
  }
}
