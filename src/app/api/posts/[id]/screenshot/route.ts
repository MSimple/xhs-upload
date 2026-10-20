import fs from "node:fs";
import path from "node:path";
import { getPost } from "@/lib/db";
import { SCREENSHOT_DIR } from "@/lib/xhs";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = getPost(id);
    if (!post) return fail("作品不存在", 404);
    if (!fs.existsSync(SCREENSHOT_DIR)) return fail("还没有失败截图", 404);
    const files = fs
      .readdirSync(SCREENSHOT_DIR)
      .filter((name) => name.startsWith(`${id}-`) && name.endsWith(".png"))
      .map((name) => ({
        name,
        time: fs.statSync(path.join(SCREENSHOT_DIR, name)).mtimeMs,
      }))
      .sort((a, b) => b.time - a.time);
    if (!files.length) return fail("还没有失败截图", 404);
    const filePath = path.join(SCREENSHOT_DIR, files[0].name);
    const buffer = fs.readFileSync(filePath);
    return new Response(buffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return fail(error, 500);
  }
}
