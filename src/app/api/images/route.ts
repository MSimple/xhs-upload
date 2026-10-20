import { NextResponse } from "next/server";
import { listImages } from "@/lib/db";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "all";
    const analyzedParam = searchParams.get("analyzed");
    const images = listImages({
      status,
      analyzed:
        analyzedParam === null ? undefined : analyzedParam === "1",
      campaign: searchParams.get("campaign") || undefined,
      excludeCampaign: searchParams.get("excludeCampaign") === "1",
    });
    return NextResponse.json({ images });
  } catch (error) {
    return fail(error, 500);
  }
}
