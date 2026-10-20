import { NextResponse } from "next/server";
import { getPlatformSnapshot } from "@/lib/db";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(getPlatformSnapshot());
  } catch (error) {
    return fail(error, 500);
  }
}
