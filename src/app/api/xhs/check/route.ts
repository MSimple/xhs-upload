import { NextResponse } from "next/server";
import { checkXhsLogin } from "@/lib/xhs";
import { fail } from "@/lib/api";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST() {
  try {
    const status = await checkXhsLogin();
    return NextResponse.json({ status });
  } catch (error) {
    return fail(error, 502);
  }
}
