import { NextResponse } from "next/server";
import {
  deleteImages,
  getImage,
  getSettings,
  setImagesCampaign,
  setManualUsed,
} from "@/lib/db";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      ids?: string[];
      action?: "delete" | "used" | "unused" | "campaign" | "clearCampaign";
      campaign?: string;
    }>(request);
    const ids = Array.isArray(body.ids)
      ? Array.from(new Set(body.ids.filter(Boolean))).slice(0, 200)
      : [];
    if (!ids.length) return fail("请先选择图片");

    let skipped = 0;
    if (body.action === "delete") {
      deleteImages(ids);
    } else if (body.action === "used" || body.action === "unused") {
      ids.forEach((id) => setManualUsed(id, body.action === "used"));
    } else if (body.action === "campaign") {
      const campaign = (body.campaign || getSettings().campaign_name || "").trim();
      if (!campaign) return fail("请先在设置里填写活动名称");
      const imageIds = ids.filter((id) => getImage(id)?.kind === "image");
      skipped = ids.length - imageIds.length;
      setImagesCampaign(imageIds, campaign);
    } else if (body.action === "clearCampaign") {
      setImagesCampaign(ids, "");
    } else {
      return fail("未知操作");
    }
    return NextResponse.json({
      ok: true,
      count: ids.length,
      skipped,
      images: ids.map((id) => getImage(id)).filter(Boolean),
    });
  } catch (error) {
    return fail(error, 500);
  }
}
