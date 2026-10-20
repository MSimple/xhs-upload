import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { analyzeImage, getAiConfig } from "@/lib/ai";
import {
  getImage,
  getImageFileNames,
  getSettings,
  saveImageAnalysis,
  UPLOAD_DIR,
} from "@/lib/db";
import { fail } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const image = getImage(id);
    const names = getImageFileNames(id);
    if (!image || !names) return fail("素材不存在", 404);

    if (
      (names.kind === "video" || names.kind === "gif") &&
      !names.previewName
    ) {
      return fail("这个视频/动图缺少封面帧，请重新上传后再识别");
    }

    const filename = names.previewName || names.filename;
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) return fail("素材文件丢失", 404);
    const base64 = fs.readFileSync(filePath).toString("base64");
    const mime = names.previewName ? "image/jpeg" : names.mime;
    const displayName =
      names.kind === "video"
        ? `${names.originalName}（视频封面帧）`
        : names.kind === "gif"
        ? `${names.originalName}（动图首帧）`
        : names.originalName;

    const config = getAiConfig();
    const settings = getSettings();
    const analysis = await analyzeImage(
      config,
      { base64, mime, id, name: displayName },
      settings
    );
    saveImageAnalysis(id, analysis);
    return NextResponse.json({ image: getImage(id), mock: !config.enabled });
  } catch (error) {
    return fail(error, 502);
  }
}
