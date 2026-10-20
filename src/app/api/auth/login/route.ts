import { NextResponse } from "next/server";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

const COOKIE = "xhs_access";

export async function POST(request: Request) {
  const configured = (process.env.XHS_ACCESS_TOKEN || "").trim();
  if (!configured) {
    return fail("当前没有启用访问令牌，直接打开工作台即可", 400);
  }
  const body = await readJson<{ token?: string }>(request);
  const token = String(body.token || "").trim();
  if (!token) return fail("请输入访问令牌", 400);
  if (token !== configured) return fail("访问令牌不正确", 401);

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
