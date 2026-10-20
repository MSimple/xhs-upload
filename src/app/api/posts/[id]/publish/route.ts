import { NextResponse } from "next/server";
import { setPostPublished, updatePost } from "@/lib/db";
import { isHttpUrl } from "@/lib/content-rules";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readJson<{ published?: boolean; url?: string }>(request);
    if (body.url !== undefined && body.url !== "" && !isHttpUrl(body.url)) {
      return fail("小红书笔记链接格式不正确", 400);
    }
    const post = setPostPublished(id, body.published !== false);
    if (!post) return fail("作品不存在", 404);
    if (body.published !== false && body.url) {
      const updated = updatePost(id, { xhsUrl: body.url });
      return NextResponse.json({ post: updated });
    }
    return NextResponse.json({ post });
  } catch (error) {
    return fail(error, 500);
  }
}
