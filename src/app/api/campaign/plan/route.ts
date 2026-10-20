import { NextResponse } from "next/server";
import { runCampaignPlan } from "@/lib/campaign";
import { isValidDateString } from "@/lib/content-rules";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      all?: boolean;
      startDate?: string;
      imageIds?: string[];
      instruction?: string;
      maxPosts?: number;
    }>(request);

    if (body.startDate !== undefined && body.startDate !== "") {
      if (!isValidDateString(body.startDate)) {
        return fail("开始日期不合法，应为 YYYY-MM-DD", 400);
      }
    }
    const result = await runCampaignPlan({
      all: Boolean(body.all),
      startDate: body.startDate,
      imageIds: Array.isArray(body.imageIds) ? body.imageIds : undefined,
      instruction: body.instruction,
      maxPosts: body.maxPosts,
      source: "manual",
    });

    return NextResponse.json(result);
  } catch (error) {
    return fail(error, 502);
  }
}
