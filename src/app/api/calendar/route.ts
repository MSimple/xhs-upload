import { NextResponse } from "next/server";
import { calendarPosts } from "@/lib/db";
import { isValidMonthString } from "@/lib/content-rules";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month") || "";
    if (!isValidMonthString(month)) return fail("月份不合法，应为 YYYY-MM", 400);
    return NextResponse.json({ month, posts: calendarPosts(month) });
  } catch (error) {
    return fail(error, 500);
  }
}
