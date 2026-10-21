import { NextResponse } from "next/server";
import { deletePost, getImage, getPost, updatePost } from "@/lib/db";
import { fail, readJson } from "@/lib/api";
import {
  charLength,
  isHttpUrl,
  isPostStatus,
  isValidDateString,
  isValidTimeString,
  normalizeHashtags,
  validatePostContent,
  XHS_HASHTAGS_MAX,
  XHS_TITLE_MAX,
} from "@/lib/content-rules";

export const runtime = "nodejs";

const has = (body: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(body, key);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = getPost(id);
    if (!post) return fail("作品不存在", 404);
    return NextResponse.json({ post });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = getPost(id);
    if (!existing) return fail("作品不存在", 404);
    const body = await readJson<Record<string, unknown>>(request);
    const patch: Parameters<typeof updatePost>[1] = {};
    const errors: string[] = [];

    let title = existing.title;
    let postBody = existing.body;
    let hashtags = existing.hashtags;

    if (has(body, "title")) {
      if (typeof body.title !== "string") {
        errors.push("标题格式不正确");
      } else {
        title = body.title.trim();
        if (!title) errors.push("标题不能为空");
        if (charLength(title) > XHS_TITLE_MAX) {
          errors.push(`标题最多 ${XHS_TITLE_MAX} 个字`);
          title = existing.title;
        } else {
          patch.title = title;
        }
      }
    }

    if (has(body, "body")) {
      if (typeof body.body !== "string") {
        errors.push("正文格式不正确");
      } else {
        postBody = body.body;
        patch.body = body.body;
      }
    }

    if (has(body, "hashtags")) {
      if (!Array.isArray(body.hashtags)) {
        errors.push("标签格式不正确");
      } else {
        hashtags = normalizeHashtags(body.hashtags, 100);
        if (hashtags.length > XHS_HASHTAGS_MAX) {
          errors.push(`标签最多 ${XHS_HASHTAGS_MAX} 个`);
          hashtags = existing.hashtags;
        } else {
          patch.hashtags = hashtags;
        }
      }
    }

    if (has(body, "theme")) {
      if (typeof body.theme !== "string") {
        errors.push("主题格式不正确");
      } else if (charLength(body.theme.trim()) > 40) {
        errors.push("主题最多 40 个字");
      } else {
        patch.theme = body.theme.trim();
      }
    }

    if (has(body, "status")) {
      if (!isPostStatus(body.status)) {
        errors.push("作品状态不合法");
      } else if (body.status === "published") {
        errors.push("请使用发布接口更新发布状态");
      } else {
        patch.status = body.status;
      }
    }

    if (has(body, "scheduledDate")) {
      const value = body.scheduledDate;
      if (value === null || value === "" || value === undefined) {
        patch.scheduledDate = null;
      } else if (!isValidDateString(value)) {
        errors.push("计划发布日期不合法，应为 YYYY-MM-DD");
      } else {
        patch.scheduledDate = value;
      }
    }

    if (has(body, "scheduledTime")) {
      const value = body.scheduledTime;
      if (value === null || value === "" || value === undefined) {
        patch.scheduledTime = null;
      } else if (!isValidTimeString(value)) {
        errors.push("发布时间不合法，应为 HH:mm");
      } else {
        patch.scheduledTime = value;
      }
    }

    if (has(body, "note")) {
      if (typeof body.note !== "string") {
        errors.push("备注格式不正确");
      } else if (body.note.length > 2000) {
        errors.push("备注最多 2000 个字");
      } else {
        patch.note = body.note;
      }
    }

    if (has(body, "xhsUrl")) {
      const value = body.xhsUrl;
      if (value === null || value === "" || value === undefined) {
        patch.xhsUrl = null;
      } else if (typeof value !== "string" || !isHttpUrl(value)) {
        errors.push("小红书笔记链接格式不正确");
      } else {
        patch.xhsUrl = value.trim();
      }
    }

    let imageIds = existing.images.map((image) => image.id);
    if (has(body, "images")) {
      if (!Array.isArray(body.images)) {
        errors.push("配图格式不正确");
      } else {
        imageIds = Array.from(
          new Set(body.images.map((value) => String(value || "")).filter(Boolean))
        );
        const missing = imageIds.filter((imageId) => !getImage(imageId));
        if (missing.length) {
          errors.push(`有 ${missing.length} 个素材不存在，请刷新后重试`);
        } else {
          patch.images = imageIds;
        }
      }
    }

    if (has(body, "coverImageId")) {
      const value = body.coverImageId;
      if (value !== null && typeof value !== "string") {
        errors.push("封面格式不正确");
      } else if (value && !imageIds.includes(value)) {
        errors.push("封面必须是当前作品里的配图");
      } else if (value && !getImage(value)) {
        errors.push("封面素材不存在");
      } else {
        patch.coverImageId = value || null;
      }
    }

    const contentErrors = validatePostContent({
      title,
      body: postBody,
      hashtags,
    });
    errors.push(...contentErrors);

    if (errors.length) {
      return fail(Array.from(new Set(errors)).join("；"), 400);
    }

    const post = updatePost(id, patch);
    if (!post) return fail("作品不存在", 404);
    return NextResponse.json({ post });
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
    deletePost(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, 500);
  }
}
