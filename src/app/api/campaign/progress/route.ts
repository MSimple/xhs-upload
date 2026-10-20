import { NextResponse } from "next/server";
import { getCampaignProgress } from "@/lib/campaign";
import { fail } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ progress: getCampaignProgress() });
  } catch (error) {
    return fail(error, 500);
  }
}
