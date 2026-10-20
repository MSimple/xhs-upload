import { NextResponse } from "next/server";
import { createPost, listPosts } from "@/lib/db";
import { fail, readJson } from "@/lib/api";
import { charLength, XHS_TITLE_MAX } from "@/lib/content-rules";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const posts = listPosts({ status: searchParams.get("status") || "all" });
    return NextResponse.json({ posts });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ title?: string }>(request);
    const title = String(body.title || "未命名笔记").trim() || "未命名笔记";
    if (charLength(title) > XHS_TITLE_MAX) {
      return fail(`标题最多 ${XHS_TITLE_MAX} 个字`, 400);
    }
    const post = createPost({
      title,
      body: "",
      hashtags: [],
      status: "draft",
      images: [],
    });
    return NextResponse.json({ post });
  } catch (error) {
    return fail(error, 500);
  }
}
