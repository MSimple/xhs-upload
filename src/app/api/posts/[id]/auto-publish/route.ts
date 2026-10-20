import { NextResponse } from "next/server";
import {
  countEventPosts,
  countPublishedCampaignPostsInRange,
  countPublishedForWeeklyCap,
  getEvent,
  getPost,
  getSettings,
  recordPublishFailure,
  recordPublishSuccess,
} from "@/lib/db";
import {
  campaignPublishBlockers,
  campaignWeeklyCap,
  currentDayRange,
  currentWeekRange,
} from "@/lib/campaign-rules";
import {
  isPostPublishing,
  isXhsPublishing,
  publishPostToXhs,
} from "@/lib/xhs";
import { eventPublishBlockers } from "@/lib/event-rules";
import { fail } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const post = getPost(id);
  if (!post) return fail("作品不存在", 404);
  if (post.status === "published") return fail("这篇作品已经发布过了", 400);
  if (!post.images.length) return fail("这篇作品还没有配图，无法发布", 400);
  if (isPostPublishing(id)) {
    return fail("这篇作品正在发布中，请不要重复提交", 409);
  }

  const settings = getSettings();
  const blockers = campaignPublishBlockers(post, settings);
  if (blockers.length) {
    return fail(`活动作品暂不能发布：${blockers.join("；")}`, 400);
  }

  if (post.eventId) {
    const event = getEvent(post.eventId);
    if (!event) return fail("作品关联的活动不存在，请重新选择活动", 400);
    const active = countEventPosts(event.id, ["ready", "published"]);
    const other = Math.max(
      0,
      active - (post.status === "ready" ? 1 : 0)
    );
    const result = eventPublishBlockers(post, event, other);
    if (event.countsWeekly) {
      const week = currentWeekRange();
      const weekly = countPublishedForWeeklyCap(
        settings.campaign_name,
        week.from,
        week.to
      );
      if (weekly >= campaignWeeklyCap(settings)) {
        result.errors.push(
          `本周已发布 ${weekly} 篇，活动要求计入周上限，不能再发`
        );
      }
    }
    if (result.errors.length) {
      return fail(`活动规则未通过：${result.errors.join("；")}`, 400);
    }
  }

  if (post.campaign) {
    const day = currentDayRange();
    const week = currentWeekRange();
    const todayPublished = countPublishedCampaignPostsInRange(
      post.campaign,
      day.from,
      day.to
    );
    const weeklyPublished = countPublishedForWeeklyCap(
      settings.campaign_name,
      week.from,
      week.to
    );
    const weeklyCap = campaignWeeklyCap(settings);
    if (todayPublished >= 1) {
      return fail("今天已经发布过活动笔记了，活动规则每天最多 1 篇", 409);
    }
    if (weeklyPublished >= weeklyCap) {
      return fail(
        `本周已发布 ${weeklyPublished} 篇，活动上限是 ${weeklyCap} 篇，继续发布会超过上限`,
        409
      );
    }
  }

  if (isXhsPublishing()) {
    return fail("正在发布另一篇作品，请等它完成后再试", 409);
  }

  try {
    const url = await publishPostToXhs(post);
    const updated = recordPublishSuccess(id, url);
    return NextResponse.json({ post: updated, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    recordPublishFailure(id, message);
    return fail(message, 502);
  }
}
