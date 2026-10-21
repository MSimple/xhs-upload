import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { DATA_DIR, UPLOAD_DIR } from "@/lib/db";
import { getAiConfig } from "@/lib/ai";

export const runtime = "nodejs";

function dirSize(dir: string) {
  try {
    return fs
      .readdirSync(dir)
      .reduce((sum, name) => {
        try {
          const stat = fs.statSync(path.join(dir, name));
          return sum + (stat.isFile() ? stat.size : 0);
        } catch {
          return sum;
        }
      }, 0);
  } catch {
    return 0;
  }
}

function fileSize(file: string) {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
}

export async function GET() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const nodeOk = major > 22 || (major === 22 && minor >= 5);
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const ffmpeg = spawnSync(ffmpegPath, ["-version"], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });
  const ffmpegOk = ffmpeg.status === 0;
  const ffmpegVersion =
    (ffmpeg.stdout || "").split(/\r?\n/)[0]?.slice(0, 120) || "";
  const ai = getAiConfig();
  const dbFile = path.join(DATA_DIR, "studio.db");

  return NextResponse.json({
    node: {
      version: process.versions.node,
      ok: nodeOk,
      required: ">=22.5.0",
    },
    ffmpeg: {
      path: ffmpegPath,
      ok: ffmpegOk,
      version: ffmpegVersion,
      error: ffmpegOk
        ? ""
        : String(ffmpeg.error?.message || ffmpeg.stderr || "未找到 ffmpeg").slice(
            0,
            200
          ),
    },
    ai: {
      configured: ai.enabled,
      baseUrl: ai.baseUrl,
      visionModel: ai.visionModel,
      textModel: ai.textModel,
      hasKey: Boolean(ai.apiKey),
    },
    storage: {
      dataDir: DATA_DIR,
      dbBytes: fileSize(dbFile),
      walBytes: fileSize(`${dbFile}-wal`),
      uploadBytes: dirSize(UPLOAD_DIR),
    },
    auth: {
      required: Boolean((process.env.XHS_ACCESS_TOKEN || "").trim()),
    },
    uptimeSeconds: Math.round(process.uptime()),
  });
}
