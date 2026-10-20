import { NextResponse } from "next/server";
import { insertEvent, listEvents } from "@/lib/db";
import { eventPhase } from "@/lib/event-rules";
import { parseEventPatch } from "@/lib/event-input";
import { fail, readJson } from "@/lib/api";
import { todayStr } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const today = todayStr();
    const events = listEvents().filter((event) => {
      if (status === "all") return true;
      const phase = eventPhase(event, today);
      if (status === "active") return phase === "active";
      if (status === "upcoming") return phase === "upcoming";
      if (status === "ended") return phase === "ended";
      return true;
    });
    return NextResponse.json({ events, today });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<Record<string, unknown>>(request);
    const { patch, errors } = parseEventPatch(body, { requireName: true });
    if (!patch.startDate || !patch.endDate) {
      errors.push("请填写活动开始和结束日期");
    }
    if (errors.length) return fail(Array.from(new Set(errors)).join("；"), 400);

    const event = insertEvent({
      name: patch.name!,
      startDate: patch.startDate!,
      endDate: patch.endDate!,
      requiredTopics: patch.requiredTopics || [],
      quota: patch.quota,
      countsWeekly: patch.countsWeekly,
      publishTime: patch.publishTime,
      minImages: patch.minImages,
      minBody: patch.minBody,
      collectionForm: patch.collectionForm,
      collectionUrl: patch.collectionUrl,
      internal: patch.internal,
      officialAssets: patch.officialAssets,
      brief: patch.brief,
      note: patch.note,
    });
    return NextResponse.json({ event });
  } catch (error) {
    return fail(error, 500);
  }
}
