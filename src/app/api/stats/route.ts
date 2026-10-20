import { NextResponse } from "next/server";
import { stats } from "@/lib/db";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(stats());
  } catch (error) {
    return fail(error, 500);
  }
}
