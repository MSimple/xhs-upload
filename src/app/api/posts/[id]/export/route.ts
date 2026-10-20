import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { getImageFileNames, getPost, UPLOAD_DIR } from "@/lib/db";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

function extensionOf(name: string, mime: string) {
  const ext = path.extname(name);
  if (ext) return ext;
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  return ".jpg";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = getPost(id);
    if (!post) return fail("作品不存在", 404);

    const zip = new JSZip();
    const folder = zip.folder("小红书发布包")!;

    const text = [
      `标题：${post.title}`,
      "",
      "正文：",
      post.body,
      "",
      `标签：${post.hashtags.map((t) => `#${t}`).join(" ")}`,
      "",
      `计划发布时间：${post.scheduledDate || "未排期"} ${post.scheduledTime || ""}`,
      "",
      `作品主题：${post.theme || "未设置"}`,
    ].join("\r\n");
    folder.file("文案.txt", "\ufeff" + text);

    const ordered = [...post.images];
    if (post.cover) {
      const coverIndex = ordered.findIndex(
        (image) => image.id === post.cover!.id
      );
      if (coverIndex > 0) {
        const [cover] = ordered.splice(coverIndex, 1);
        ordered.unshift(cover);
      }
    }

    for (let index = 0; index < ordered.length; index++) {
      const image = ordered[index];
      const names = getImageFileNames(image.id);
      if (!names) continue;
      const filePath = path.join(UPLOAD_DIR, names.filename);
      if (!fs.existsSync(filePath)) continue;
      const ext = extensionOf(names.originalName, names.mime);
      const isCover = post.cover?.id === image.id;
      const safeName = `${String(index + 1).padStart(2, "0")}${
        isCover ? "-封面" : ""
      }${ext}`;
      folder.file(safeName, fs.readFileSync(filePath));
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    const filename = `${post.title.replace(/[\\/:*?"<>|]/g, "_") || "小红书作品"}.zip`;
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="xhs-post.zip"; filename*=UTF-8''${encodeURIComponent(
          filename
        )}`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    return fail(error, 500);
  }
}
