import { NextResponse } from "next/server";
import { getAiConfig, planPosts } from "@/lib/ai";
import {
  assignScheduleDates,
  createPost,
  defaultStartDate,
  getImage,
  getSettings,
  listImages,
} from "@/lib/db";
import { isValidDateString } from "@/lib/content-rules";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      imageIds?: string[];
      instruction?: string;
      startDate?: string;
    }>(request);

    const explicit = Array.isArray(body.imageIds) && body.imageIds.length > 0;
    let candidates;
    if (explicit) {
      candidates = (body.imageIds || [])
        .map((id) => getImage(id))
        .filter((img): img is NonNullable<typeof img> => Boolean(img));
    } else {
      candidates = listImages({ status: "unused" });
    }

    const unused = candidates.filter(
      (img) => img.status === "unused" && (explicit || !img.campaign)
    );
    const analyzed = unused.filter((img) => img.analysis);
    const skipped = unused.length - analyzed.length;

    if (!unused.length) {
      return fail("没有可用的未使用素材，请先上传或释放一些素材");
    }
    if (!analyzed.length) {
      return fail("这些素材还没有经过 AI 识别，请先在素材库中点击「AI 识别」");
    }

    const settings = getSettings();
    const config = getAiConfig();
    const usable =
      config.enabled && analyzed.some((img) => img.analysis?.mock)
        ? analyzed.filter((img) => !img.analysis?.mock)
        : analyzed;
    if (config.enabled && analyzed.length && !usable.length) {
      return fail(
        "当前素材只有演示分析结果。请先到素材库重新识别这些素材，或关闭 AI 后使用演示策划。",
        400
      );
    }
    const sliced = usable.slice(0, 40);
    const instruction =
      (body.instruction || "") +
      (skipped > 0
        ? `\n（注意：有 ${skipped} 张未识别素材未纳入本次策划。）`
        : "");

    if (body.startDate && !isValidDateString(body.startDate)) {
      return fail("开始日期不合法，应为 YYYY-MM-DD", 400);
    }

    const planned = await planPosts(config, sliced, settings, instruction.trim());
    const startDate =
      body.startDate && isValidDateString(body.startDate)
        ? body.startDate
        : defaultStartDate();
    const perDay = Math.max(1, Number(settings.posts_per_day) || 1);
    const dates = assignScheduleDates(startDate, planned.length, perDay);

    const created = planned.map((plan, index) =>
      createPost({
        theme: plan.theme,
        title: plan.title,
        body: plan.body,
        hashtags: plan.hashtags,
        status: "draft",
        scheduledDate: dates[index] || startDate,
        scheduledTime: plan.publishTime || settings.default_time,
        coverImageId: plan.coverImageId,
        note: plan.reason,
        images: plan.imageIds,
      })
    );

    return NextResponse.json({
      posts: created,
      mock: !config.enabled,
      skipped,
    });
  } catch (error) {
    return fail(error, 502);
  }
}
