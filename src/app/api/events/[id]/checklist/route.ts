import { NextResponse } from "next/server";
import { getEvent, setEventChecklist } from "@/lib/db";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!getEvent(id)) return fail("活动不存在", 404);
    const body = await readJson<{
      formSubmitted?: boolean;
      xiaoyanjingRegistered?: boolean;
    }>(request);
    const event = setEventChecklist(id, {
      formSubmitted:
        typeof body.formSubmitted === "boolean"
          ? body.formSubmitted
          : undefined,
      xiaoyanjingRegistered:
        typeof body.xiaoyanjingRegistered === "boolean"
          ? body.xiaoyanjingRegistered
          : undefined,
    });
    return NextResponse.json({ event });
  } catch (error) {
    return fail(error, 500);
  }
}
