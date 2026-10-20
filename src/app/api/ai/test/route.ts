import { NextResponse } from "next/server";
import {
  getAiConfig,
  testAiConnection,
  testAiVisionConnection,
  type AiConfig,
} from "@/lib/ai";
import { isHttpUrl } from "@/lib/content-rules";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    }>(request);
    const saved = getAiConfig();
    const baseUrl = (body.baseUrl || saved.baseUrl).replace(/\/+$/, "");
    if (!isHttpUrl(baseUrl)) {
      return fail("Base URL 必须是 http(s) 地址", 400);
    }
    const config: AiConfig = {
      baseUrl,
      apiKey: body.apiKey?.trim() || saved.apiKey,
      visionModel: saved.visionModel,
      textModel: body.model?.trim() || saved.textModel,
      enabled: true,
    };
    if (!config.apiKey) return fail("请先填写 API Key", 400);
    if (!config.textModel) return fail("请先填写文本模型", 400);
    if (!config.visionModel) return fail("请先填写视觉模型", 400);

    const reply = await testAiConnection(config);
    let visionReply = "";
    let visionError = "";
    try {
      visionReply = await testAiVisionConnection(config);
    } catch (error) {
      visionError = error instanceof Error ? error.message : String(error);
    }
    return NextResponse.json({
      ok: true,
      reply,
      model: config.textModel,
      visionModel: config.visionModel,
      visionReply,
      visionError,
    });
  } catch (error) {
    return fail(error, 502);
  }
}
