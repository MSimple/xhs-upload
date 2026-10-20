import { NextResponse } from "next/server";

export function fail(message: unknown, status = 400) {
  const text =
    message instanceof Error
      ? message.message
      : typeof message === "string"
      ? message
      : "请求处理失败";
  return NextResponse.json({ error: text }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}
