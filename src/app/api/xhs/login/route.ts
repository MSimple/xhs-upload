import { NextResponse } from "next/server";
import { startXhsLogin } from "@/lib/xhs";
import { fail } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const status = await startXhsLogin();
    return NextResponse.json({ status });
  } catch (error) {
    return fail(error, 502);
  }
}
