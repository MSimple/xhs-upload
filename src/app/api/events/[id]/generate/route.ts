import { NextResponse } from "next/server";
import { getAiConfig, planEventPost } from "@/lib/ai";
import {
  countEventPosts,
  createPost,
  getEvent,
  getImage,
  getSettings,
  listImages,
} from "@/lib/db";
import { eventPhase, eventPostWarnings } from "@/lib/event-rules";
import { isValidDateString } from "@/lib/content-rules";
import { fail, readJson } from "@/lib/api";
import { todayStr } from "@/lib/utils";
import type { Photo } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const event = getEvent(id);
    if (!event) return fail("活动不存在", 404);
    const today = todayStr();
    if (eventPhase(event, today) === "ended") {
      return fail("活动已经结束，不能生成活动稿", 400);
    }
    if (countEventPosts(id) >= event.quota) {
      return fail(
        `这个活动周期内只能有 ${event.quota} 篇作品，请直接编辑已有作品`,
        409
      );
    }

    const body = await readJson<{
      imageIds?: string[];
      instruction?: string;
      date?: string;
    }>(request);
    const config = getAiConfig();
    const settings = getSettings();
    let images: Photo[] = [];

    if (Array.isArray(body.imageIds) && body.imageIds.length) {
      images = body.imageIds
        .map((imageId) => getImage(imageId))
        .filter((image): image is Photo => Boolean(image))
        .filter(
          (image) =>
            image.kind === "image" &&
            image.status === "unused" &&
            !image.campaign
        );
    } else {
      images = listImages({
        status: "unused",
        excludeCampaign: true,
        analyzed: true,
      }).filter((image) => image.kind === "image");
    }

    if (config.enabled) {
      images = images.filter((image) => image.analysis && !image.analysis.mock);
    }
    images = images.slice(0, 9);

    if (images.length < event.minImages) {
      return fail(
        `活动至少需要 ${event.minImages} 张静态图片，当前可用 ${images.length} 张。请先在素材库上传并识别。`,
        400
      );
    }
    if (images.some((image) => !image.analysis)) {
      return fail("有素材还没有 AI 识别结果，请先到素材库识别", 400);
    }

    const requestedDate =
      body.date && isValidDateString(body.date) ? body.date : "";
    const scheduledDate =
      requestedDate &&
      requestedDate >= event.startDate &&
      requestedDate <= event.endDate
        ? requestedDate
        : today >= event.startDate && today <= event.endDate
        ? today
        : event.startDate;

    const result = await planEventPost(
      config,
      images,
      settings,
      event,
      String(body.instruction || "").trim().slice(0, 500)
    );

    const post = createPost({
      theme: result.post.theme,
      title: result.post.title,
      body: result.post.body,
      hashtags: result.post.hashtags,
      eventId: event.id,
      eventName: event.name,
      status: "draft",
      scheduledDate,
      scheduledTime: event.publishTime || "21:30",
      coverImageId: result.post.coverImageId,
      note: result.post.reason,
      images: result.post.imageIds,
    });

    return NextResponse.json({
      post,
      warnings: Array.from(
        new Set([...result.warnings, ...eventPostWarnings(post, event)])
      ),
    });
  } catch (error) {
    return fail(error, 502);
  }
}
