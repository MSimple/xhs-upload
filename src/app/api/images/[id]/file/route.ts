import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { getImageFileNames, UPLOAD_DIR } from "@/lib/db";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const names = getImageFileNames(id);
    if (!names) return fail("素材不存在", 404);
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind") || "preview";
    const useThumb = kind === "thumb";
    const usePreview = kind !== "original";
    const filename = useThumb
      ? names.thumbName || names.previewName || names.filename
      : usePreview
      ? names.previewName || names.filename
      : names.filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) return fail("素材文件丢失", 404);
    const usingDerived = useThumb
      ? Boolean(names.thumbName || names.previewName)
      : usePreview
      ? Boolean(names.previewName)
      : false;
    const type = usingDerived ? "image/jpeg" : names.mime;

    if (!usePreview && type.startsWith("video/")) {
      const stat = fs.statSync(filePath);
      const range = request.headers.get("range");
      const headers: Record<string, string> = {
        "Content-Type": type,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
      };
      if (range) {
        const match = /bytes=(\d*)-(\d*)/.exec(range);
        if (match) {
          let start = match[1] ? Number(match[1]) : 0;
          let end = match[2] ? Number(match[2]) : stat.size - 1;
          if (!match[1] && match[2]) {
            start = Math.max(0, stat.size - Number(match[2]));
            end = stat.size - 1;
          }
          if (
            Number.isFinite(start) &&
            Number.isFinite(end) &&
            start >= 0 &&
            end >= start &&
            start < stat.size
          ) {
            end = Math.min(end, stat.size - 1);
            const stream = fs.createReadStream(filePath, { start, end });
            return new Response(Readable.toWeb(stream) as ReadableStream, {
              status: 206,
              headers: {
                ...headers,
                "Content-Range": `bytes ${start}-${end}/${stat.size}`,
                "Content-Length": String(end - start + 1),
              },
            });
          }
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${stat.size}` },
          });
        }
      }
      const stream = fs.createReadStream(filePath);
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        headers: {
          ...headers,
          "Content-Length": String(stat.size),
        },
      });
    }

    const buffer = fs.readFileSync(filePath);
    return new Response(buffer, {
      headers: {
        "Content-Type": type,
        "Content-Length": String(buffer.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return fail(error, 500);
  }
}
