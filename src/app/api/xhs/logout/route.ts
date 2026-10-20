import { NextResponse } from "next/server";
import { logoutXhs } from "@/lib/xhs";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  try {
    await logoutXhs();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, 500);
  }
}
