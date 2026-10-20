import { NextResponse } from "next/server";
import {
  deleteEvent,
  getEvent,
  listEventPosts,
  updateEvent,
} from "@/lib/db";
import { parseEventPatch } from "@/lib/event-input";
import { fail, readJson } from "@/lib/api";
import { todayStr } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const event = getEvent(id);
    if (!event) return fail("活动不存在", 404);
    return NextResponse.json({
      event,
      posts: listEventPosts(id),
      today: todayStr(),
    });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const current = getEvent(id);
    if (!current) return fail("活动不存在", 404);
    const body = await readJson<Record<string, unknown>>(request);
    const { patch, errors } = parseEventPatch(body);
    if (patch.startDate || patch.endDate) {
      const start = patch.startDate ?? current.startDate;
      const end = patch.endDate ?? current.endDate;
      if (end < start) errors.push("活动结束日期不能早于开始日期");
    }
    if (errors.length) return fail(Array.from(new Set(errors)).join("；"), 400);
    const event = updateEvent(id, patch);
    return NextResponse.json({ event, posts: listEventPosts(id) });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const event = getEvent(id);
    if (!event) return fail("活动不存在", 404);
    deleteEvent(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, 500);
  }
}
