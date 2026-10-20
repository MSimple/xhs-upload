import { NextResponse } from "next/server";
import { getAiConfig, planPosts } from "@/lib/ai";
import { getPost, getSettings, updatePost } from "@/lib/db";
import {
  CAMPAIGN_TRACKS,
  campaignBodyMin,
  campaignModel,
  pickCampaignTrack,
  sanitizeCampaignHashtags,
} from "@/lib/campaign-rules";
import { charLength, validatePostContent } from "@/lib/content-rules";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = getPost(id);
    if (!post) return fail("作品不存在", 404);
    if (post.status === "published") {
      return fail("已发布作品已锁定，请先撤回发布再改写文案", 400);
    }
    if (!post.images.length) return fail("这篇作品还没有配图，先添加图片再让 AI 重写");
    const missing = post.images.filter((img) => !img.analysis);
    if (missing.length === post.images.length) {
      return fail("配图还没有经过 AI 识别，请先分析图片");
    }

    const body = await readJson<{ instruction?: string }>(request);
    const settings = getSettings();
    const config = getAiConfig();
    if (
      config.enabled &&
      post.images.length > 0 &&
      post.images.every((image) => image.analysis?.mock)
    ) {
      return fail("这些配图还是演示分析结果，请先在素材库重新识别", 400);
    }

    const minBody = post.campaign ? campaignBodyMin(settings) : 0;
    const model = campaignModel(settings);
    const existingTrack = post.campaign
      ? CAMPAIGN_TRACKS.find((track) => post.hashtags.includes(track))
      : undefined;
    const instruction = `${body.instruction || ""}
这是对一篇已有笔记的文案重写：请只为这一组图片生成一篇笔记，尽可能使用全部 ${post.images.length} 张图片。保留原有的内容主题，但换一个角度和表达。${
      post.campaign
        ? `\n这是活动笔记：正文去掉空白后不少于 ${minBody} 字；必须保留官方话题 #${model} 和 ${
            existingTrack ? `#${existingTrack}` : "从三选一赛道里选一个"
          }，不要写 #有理想的生活。`
        : ""
    }`.trim();

    const planned = await planPosts(config, post.images, settings, instruction);
    const first = planned[0];
    if (!first) return fail("AI 没有生成可用文案，请稍后重试", 422);

    const errors = validatePostContent({
      title: first.title,
      body: first.body,
      hashtags: first.hashtags,
    });
    if (errors.length) return fail(errors.join("；"), 422);

    let hashtags = first.hashtags;
    let note = first.reason || post.note;
    if (post.campaign) {
      const track =
        existingTrack || pickCampaignTrack({ title: first.title, body: first.body });
      hashtags = sanitizeCampaignHashtags(model, track, first.hashtags);
      note = `${note}${note ? " · " : ""}活动话题已保留：${model} / ${track}`;
    }
    if (post.campaign && charLength(first.body.replace(/\s+/g, "")) < minBody) {
      return fail(
        `AI 重写后的正文只有 ${charLength(
          first.body.replace(/\s+/g, "")
        )} 字，未达到活动要求的 ${minBody} 字，请重试或补充要求`,
        422
      );
    }

    const cover = post.images.some((img) => img.id === first.coverImageId)
      ? first.coverImageId
      : post.coverImageId;

    const updated = updatePost(id, {
      theme: first.theme,
      title: first.title,
      body: first.body,
      hashtags,
      coverImageId: cover,
      scheduledTime: first.publishTime || post.scheduledTime,
      note,
    });
    return NextResponse.json({ post: updated, mock: !config.enabled });
  } catch (error) {
    return fail(error, 502);
  }
}
