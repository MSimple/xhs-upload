import { NextResponse } from "next/server";
import { getSettings } from "@/lib/db";
import { parseEventAnnouncement } from "@/lib/event-parse";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<{ text?: string }>(request);
    const text = String(body.text || "").trim();
    if (!text) return fail("请先粘贴群公告内容", 400);
    const settings = getSettings();
    const event = parseEventAnnouncement(text, {
      model: settings.campaign_model,
    });
    return NextResponse.json({ event });
  } catch (error) {
    return fail(error, 500);
  }
}
