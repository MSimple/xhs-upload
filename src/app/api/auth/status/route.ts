import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = (process.env.XHS_ACCESS_TOKEN || "").trim();
  const rawCookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("xhs_access="))
    ?.slice("xhs_access=".length);
  let cookie = rawCookie || "";
  try {
    cookie = decodeURIComponent(cookie);
  } catch {
    // keep raw value
  }
  return NextResponse.json({
    required: Boolean(token),
    authenticated: !token || cookie === token,
  });
}
