import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { deleteImage, insertImage, listImages, UPLOAD_DIR } from "@/lib/db";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "image/avif": ".avif",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/x-m4v": ".m4v",
  "video/webm": ".webm",
};

const ALLOWED_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
  ".avif",
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
]);

const MAX_FILES = 100;
const MAX_TOTAL_BYTES = 1.5 * 1024 * 1024 * 1024;

type MediaKind = "image" | "video" | "gif";

type UploadMeta = {
  width?: number;
  height?: number;
  kind?: string;
  duration?: number;
};

type UploadJob = {
  file: File;
  preview: File | null;
  thumb: File | null;
  kind: MediaKind;
  meta: UploadMeta;
  ext: string;
};

function mediaKindOf(file: File, metaKind: string | undefined): MediaKind {
  if (metaKind === "image" || metaKind === "video" || metaKind === "gif") {
    return metaKind;
  }
  if (file.type === "image/gif") return "gif";
  if (file.type.startsWith("video/")) return "video";
  const ext = path.extname(file.name).toLowerCase();
  if (/\.(mp4|mov|m4v|webm)$/.test(ext)) return "video";
  if (ext === ".gif") return "gif";
  return "image";
}

function isSupportedFile(file: File) {
  if (file.type && !(file.type in MIME_EXT)) return false;
  const ext = path.extname(file.name).toLowerCase();
  if (file.type) return true;
  return ALLOWED_EXT.has(ext);
}

async function runFfmpeg(args: string[], timeoutMs: number) {
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const done = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const ffmpegProcess = spawn(ffmpeg, args, { windowsHide: true });
    const timer = setTimeout(() => {
      ffmpegProcess.kill();
      done(false);
    }, timeoutMs);
    ffmpegProcess.on("error", () => done(false));
    ffmpegProcess.on("close", (code) => done(code === 0));
  });
}

async function generatePoster(
  videoPath: string,
  outputPath: string,
  kind: MediaKind
): Promise<boolean> {
  return runFfmpeg(
    [
      "-y",
      "-ss",
      kind === "video" ? "0.1" : "0",
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=1280:-2",
      "-q:v",
      "3",
      outputPath,
    ],
    60_000
  );
}

async function generateThumb(
  inputPath: string,
  outputPath: string
): Promise<boolean> {
  return runFfmpeg(
    [
      "-y",
      "-i",
      inputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-2",
      "-q:v",
      "4",
      outputPath,
    ],
    60_000
  );
}

function safeDelete(filePath: string) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // ignore missing file
  }
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((f): f is File => f instanceof File);
    const previews = form.getAll("previews");
    const thumbs = form.getAll("thumbs");
    const campaign = String(form.get("campaign") || "").trim();
    if (!files.length) return fail("没有收到素材文件");
    if (files.length > MAX_FILES) {
      return fail(`一次最多上传 ${MAX_FILES} 个文件，请分批上传`);
    }

    let meta: UploadMeta[] = [];
    try {
      const parsed = JSON.parse(String(form.get("meta") || "[]"));
      if (Array.isArray(parsed)) meta = parsed;
    } catch {
      meta = [];
    }

    const invalid = files.filter((file) => !isSupportedFile(file));
    if (invalid.length) {
      return fail(
        `不支持的文件格式：${invalid
          .slice(0, 5)
          .map((file) => file.name)
          .join("、")}。支持 JPG/PNG/WebP/HEIC/AVIF/GIF/MP4/MOV/M4V/WebM`
      );
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if (totalSize > MAX_TOTAL_BYTES) {
      return fail("本批文件总大小超过 1.5GB，请分批上传");
    }

    const jobs: UploadJob[] = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const info = meta[index] || {};
      const kind = mediaKindOf(file, info.kind);
      const maxSize = kind === "video" ? 300 * 1024 * 1024 : 40 * 1024 * 1024;
      if (file.size > maxSize) {
        return fail(
          `「${file.name}」超过 ${kind === "video" ? "300MB" : "40MB"}，请压缩后再上传`
        );
      }
      const fallbackExt =
        path.extname(file.name) || MIME_EXT[file.type] || ".bin";
      const ext = MIME_EXT[file.type] || fallbackExt;
      const preview = previews[index];
      const thumb = thumbs[index];
      jobs.push({
        file,
        preview: preview instanceof File && preview.size > 0 ? preview : null,
        thumb: thumb instanceof File && thumb.size > 0 ? thumb : null,
        kind,
        meta: info,
        ext,
      });
    }

    const created: ReturnType<typeof insertImage>[] = [];
    const warnings: string[] = [];

    try {
      for (const job of jobs) {
        const { file, kind, meta: info } = job;
        const id = crypto.randomUUID();
        const filename = `${id}${job.ext}`;
        const originalPath = path.join(UPLOAD_DIR, filename);
        const previewName = `${id}_preview.jpg`;
        const thumbName = `${id}_thumb.jpg`;
        const previewPath = path.join(UPLOAD_DIR, previewName);
        const thumbPath = path.join(UPLOAD_DIR, thumbName);
        const written: string[] = [originalPath];

        try {
          const buffer = Buffer.from(await file.arrayBuffer());
          fs.writeFileSync(originalPath, buffer);

          let hasPreview = false;
          if (job.preview) {
            fs.writeFileSync(previewPath, Buffer.from(await job.preview.arrayBuffer()));
            written.push(previewPath);
            hasPreview = true;
          } else if (kind === "video" || kind === "gif" || /\.(heic|heif|avif)$/i.test(job.ext)) {
            const generated = await generatePoster(originalPath, previewPath, kind);
            if (generated) {
              written.push(previewPath);
              hasPreview = true;
            } else {
              warnings.push(`「${file.name}」未能生成预览，请确认浏览器和 ffmpeg 支持该格式`);
            }
          }

          let hasThumb = false;
          if (job.thumb) {
            fs.writeFileSync(thumbPath, Buffer.from(await job.thumb.arrayBuffer()));
            written.push(thumbPath);
            hasThumb = true;
          } else {
            const source = hasPreview ? previewPath : originalPath;
            const generated = await generateThumb(source, thumbPath);
            if (generated) {
              written.push(thumbPath);
              hasThumb = true;
            }
          }

          created.push(
            insertImage({
              id,
              filename,
              previewName: hasPreview ? previewName : null,
              thumbName: hasThumb ? thumbName : null,
              originalName: file.name,
              mime:
                file.type ||
                (kind === "video"
                  ? "video/mp4"
                  : kind === "gif"
                  ? "image/gif"
                  : "image/jpeg"),
              size: file.size,
              width: Number(info.width) || 0,
              height: Number(info.height) || 0,
              kind,
              duration: Number(info.duration) || 0,
              campaign: kind === "image" ? campaign : "",
            })
          );
        } catch (error) {
          for (const filePath of written) safeDelete(filePath);
          throw error;
        }
      }
    } catch (error) {
      for (const image of created) {
        try {
          deleteImage(image.id);
        } catch {
          // best-effort rollback
        }
      }
      throw error;
    }

    if (!created.length) return fail("没有可用的素材文件");
    return NextResponse.json({
      images: created,
      total: listImages().length,
      warnings,
    });
  } catch (error) {
    return fail(error, 500);
  }
}
