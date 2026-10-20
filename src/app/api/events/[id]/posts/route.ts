import { NextResponse } from "next/server";
import {
  countEventPosts,
  createPost,
  getEvent,
  listEventPosts,
} from "@/lib/db";
import { eventPhase } from "@/lib/event-rules";
import { fail } from "@/lib/api";
import { todayStr } from "@/lib/utils";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const event = getEvent(id);
    if (!event) return fail("活动不存在", 404);
    const today = todayStr();
    if (eventPhase(event, today) === "ended") {
      return fail("活动已经结束，不能新建活动作品", 400);
    }
    const existing = listEventPosts(id);
    if (countEventPosts(id) >= event.quota) {
      return NextResponse.json(
        {
          error: `这个活动周期内只能有 ${event.quota} 篇作品，请直接编辑已有作品或删除后重建`,
          existingPostId: existing[0]?.id || null,
        },
        { status: 409 }
      );
    }
    const scheduledDate =
      today >= event.startDate && today <= event.endDate
        ? today
        : event.startDate;
    const post = createPost({
      title: Array.from(event.name).slice(0, 20).join(""),
      body: "",
      hashtags: event.requiredTopics,
      eventId: event.id,
      eventName: event.name,
      status: "draft",
      scheduledDate,
      scheduledTime: event.publishTime || "21:30",
      note: `临时活动 · ${event.name}`,
    });
    return NextResponse.json({ post });
  } catch (error) {
    return fail(error, 500);
  }
}
