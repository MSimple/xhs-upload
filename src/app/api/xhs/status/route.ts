import { NextResponse } from "next/server";
import { getXhsStatus } from "@/lib/xhs";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(getXhsStatus());
  } catch (error) {
    return fail(error, 500);
  }
}
