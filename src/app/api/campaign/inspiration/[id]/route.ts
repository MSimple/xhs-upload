import { NextResponse } from "next/server";
import {
  deleteShotIdea,
  getShotIdea,
  setShotIdeaDone,
} from "@/lib/db";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idea = getShotIdea(id);
    if (!idea) return fail("拍摄任务不存在", 404);
    const body = await readJson<{ done?: boolean }>(request);
    const updated =
      typeof body.done === "boolean"
        ? setShotIdeaDone(id, body.done)
        : idea;
    return NextResponse.json({ idea: updated });
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
    deleteShotIdea(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, 500);
  }
}
