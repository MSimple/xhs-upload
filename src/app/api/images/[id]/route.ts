import { NextResponse } from "next/server";
import {
  deleteImage,
  getImage,
  setImageCampaign,
  setManualUsed,
} from "@/lib/db";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const image = getImage(id);
    if (!image) return fail("图片不存在", 404);
    const body = await readJson<{ manualUsed?: boolean; campaign?: string }>(
      request
    );
    if (typeof body.manualUsed === "boolean") {
      setManualUsed(id, body.manualUsed);
    }
    if (typeof body.campaign === "string") {
      setImageCampaign(id, body.campaign);
    }
    return NextResponse.json({ image: getImage(id) });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const image = getImage(id);
    if (!image) return fail("图片不存在", 404);
    deleteImage(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, 500);
  }
}
