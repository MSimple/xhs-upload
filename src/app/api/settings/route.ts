import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { isHttpUrl } from "@/lib/content-rules";
import { fail, readJson } from "@/lib/api";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";

function mask(settings: Settings) {
  return {
    settings: { ...settings, ai_api_key: "" },
    hasApiKey: Boolean(settings.ai_api_key),
    configured: settings.ai_enabled === "1" && Boolean(settings.ai_api_key),
  };
}

export async function GET() {
  try {
    return NextResponse.json(mask(getSettings()));
  } catch (error) {
    return fail(error, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await readJson<Partial<Settings> & { clearApiKey?: boolean }>(
      request
    );
    const patch: Partial<Settings> = { ...body };
    delete (patch as Record<string, unknown>).clearApiKey;
    if (!body.ai_api_key || !body.ai_api_key.trim()) {
      delete patch.ai_api_key;
    } else {
      patch.ai_api_key = body.ai_api_key.trim();
    }
    if (body.ai_base_url !== undefined) {
      const baseUrl = String(body.ai_base_url).trim();
      if (!isHttpUrl(baseUrl)) {
        return fail("Base URL 必须是 http(s) 地址", 400);
      }
      patch.ai_base_url = baseUrl.replace(/\/+$/, "");
    }
    if (body.ai_text_model !== undefined && !String(body.ai_text_model).trim()) {
      return fail("文本模型不能为空", 400);
    }
    if (
      body.ai_vision_model !== undefined &&
      !String(body.ai_vision_model).trim()
    ) {
      return fail("视觉模型不能为空", 400);
    }
    if (body.clearApiKey) patch.ai_api_key = "";
    const saved = saveSettings(patch);
    return NextResponse.json(mask(saved));
  } catch (error) {
    return fail(error, 500);
  }
}
