import { NextResponse } from "next/server";
import { savePlatformSnapshot } from "@/lib/db";
import { isXhsSyncing, syncCreatorData } from "@/lib/xhs";
import { fail } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  try {
    if (isXhsSyncing()) {
      return fail("正在同步数据，请稍候", 409);
    }
    const snapshot = await syncCreatorData();
    savePlatformSnapshot(snapshot);
    return NextResponse.json({ snapshot, syncedAt: snapshot.syncedAt });
  } catch (error) {
    return fail(error, 502);
  }
}
