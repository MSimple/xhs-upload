"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Copy,
  Download,
  ExternalLink,
  ImagePlus,
  Megaphone,
  Play,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Modal, Spinner, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/toast";
import {
  api,
  downloadPostExport,
  fetcher,
  refreshAll,
} from "@/lib/client";
import {
  cn,
  fullCopy,
  formatDateTime,
  parseHashtags,
  todayStr,
} from "@/lib/utils";
import {
  charLength,
  hashtagLine,
  validatePostContent,
  XHS_BODY_MAX,
  XHS_HASHTAGS_MAX,
  XHS_TITLE_MAX,
} from "@/lib/content-rules";
import type { Photo, Post, PostStatus } from "@/lib/types";

type Draft = {
  title: string;
  body: string;
  theme: string;
  hashtagsText: string;
  scheduledDate: string;
  scheduledTime: string;
  coverImageId: string | null;
  images: string[];
  note: string;
};

function toDraft(post: Post): Draft {
  return {
    title: post.title,
    body: post.body,
    theme: post.theme,
    hashtagsText: post.hashtags.join(" "),
    scheduledDate: post.scheduledDate || "",
    scheduledTime: post.scheduledTime || "",
    coverImageId: post.coverImageId,
    images: post.images.map((image) => image.id),
    note: post.note,
  };
}

const PUBLISH_URL =
  "https://creator.xiaohongshu.com/publish/publish?source=official&target=image";
const PUBLISH_VIDEO_URL =
  "https://creator.xiaohongshu.com/publish/publish?source=official&target=video";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  }
}

export function PostDetailModal({
  postId,
  open,
  onClose,
  onDeleted,
}: {
  postId: string | null;
  open: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const toast = useToast();
  const key = open && postId ? `/api/posts/${postId}` : null;
  const { data, isLoading, error, mutate } = useSWR<{ post: Post }>(
    key,
    fetcher,
    {
      revalidateOnFocus: false,
    }
  );
  const post = data?.post;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);
  const [addedKinds, setAddedKinds] = useState<Record<string, Photo["kind"]>>(
    {}
  );

  const { data: unusedData } = useSWR<{ images: Photo[] }>(
    open && picking ? "/api/images?status=unused" : null,
    fetcher
  );

  useEffect(() => {
    if (!post) return;
    setDraft(toDraft(post));
    setActiveImageId((prev) =>
      prev && post.images.some((image) => image.id === prev)
        ? prev
        : post.coverImageId || post.images[0]?.id || null
    );
    setAddedKinds((prev) => {
      const next = { ...prev };
      for (const image of post.images) next[image.id] = image.kind;
      return next;
    });
    // Reset only when a different post is opened or the server version changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post?.id, post?.updatedAt]);

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setPicking(false);
      setBusy(null);
      setActiveImageId(null);
      setAddedKinds({});
    }
  }, [open]);

  const availableImages = useMemo(() => {
    const list = unusedData?.images || [];
    const selected = new Set(draft?.images || []);
    return list.filter((image) => !selected.has(image.id));
  }, [unusedData, draft?.images]);

  const isDirty = useMemo(() => {
    if (!draft || !post) return false;
    return JSON.stringify(draft) !== JSON.stringify(toDraft(post));
  }, [draft, post]);

  if (!open) return null;

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function saveDraft(status?: PostStatus) {
    if (!draft || !postId) return false;
    if (post?.status === "published") {
      throw new Error("已发布作品已锁定，请先撤回发布再修改");
    }
    const title = draft.title.trim() || "未命名笔记";
    const hashtags = parseHashtags(draft.hashtagsText, 100);
    const contentErrors = validatePostContent({
      title,
      body: draft.body,
      hashtags,
    });
    if (contentErrors.length) throw new Error(contentErrors.join("；"));
    const nextStatus = status;
    await api(`/api/posts/${postId}`, {
      method: "PATCH",
      body: JSON.stringify({
        title,
        body: draft.body,
        theme: draft.theme,
        hashtags,
        scheduledDate: draft.scheduledDate || null,
        scheduledTime: draft.scheduledTime || null,
        coverImageId: draft.coverImageId,
        note: draft.note,
        images: draft.images,
        ...(nextStatus ? { status: nextStatus } : {}),
      }),
    });
    await refreshAll();
    await mutate();
    return true;
  }

  async function handleSave() {
    setBusy("save");
    try {
      await saveDraft();
      toast("已保存", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleStatus(status: PostStatus) {
    setBusy(status);
    try {
      await saveDraft(status);
      toast(status === "ready" ? "已标记为待发布" : "已退回草稿", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handlePublish() {
    if (!draft || !postId) return;
    if (
      !window.confirm(
        "确认已经在小红书发布这篇笔记吗？\n\n确认后，作品状态会变为「已发布」，其中的配图会标记为「已使用」，下次 AI 策划不会再使用它们。"
      )
    ) {
      return;
    }
    setBusy("publish");
    try {
      await saveDraft();
      const url = window.prompt(
        "如果你已经在小红书发布，可以粘贴笔记链接（可留空）",
        post?.xhsUrl || ""
      );
      await api(`/api/posts/${postId}/publish`, {
        method: "POST",
        body: JSON.stringify({ published: true, url: url?.trim() || undefined }),
      });
      await refreshAll();
      toast("已标记为手动发布，配图已锁定", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleUnpublish() {
    if (!postId) return;
    if (
      !window.confirm(
        "仅把本地状态改回「待发布」，不会删除小红书上已经发布的笔记。\n\n配图会重新变为可用。继续？"
      )
    ) {
      return;
    }
    setBusy("unpublish");
    try {
      await api(`/api/posts/${postId}/publish`, {
        method: "POST",
        body: JSON.stringify({ published: false }),
      });
      await refreshAll();
      toast("已撤回本地状态，小红书笔记仍然保留", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    if (!draft) return;
    const ok = await copyText(
      fullCopy({
        title: draft.title,
        body: draft.body,
        hashtags: parseHashtags(draft.hashtagsText),
      })
    );
    toast(ok ? "标题、正文和标签已复制" : "复制失败，请手动选择", ok ? "success" : "error");
  }

  async function handleExport() {
    if (!postId) return;
    setBusy("export");
    try {
      if (post?.status !== "published") await saveDraft();
      await downloadPostExport(postId);
      toast("发布包已生成，包含文案和原图", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "导出失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleRewrite() {
    if (!postId) return;
    if (post?.status === "published") {
      toast("已发布作品已锁定，请先撤回发布", "error");
      return;
    }
    if (
      !window.confirm(
        "让 AI 根据当前配图重新写一套标题、正文和标签？现有的文案会被覆盖，建议先复制备份。"
      )
    ) {
      return;
    }
    setBusy("rewrite");
    try {
      await saveDraft();
      await api(`/api/posts/${postId}/regenerate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshAll();
      toast("AI 已换了一套文案", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "重写失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!postId) return;
    if (!window.confirm("删除这篇作品？配图会从作品中移除，图片文件不会被删除。")) {
      return;
    }
    setBusy("delete");
    try {
      await api(`/api/posts/${postId}`, { method: "DELETE" });
      await refreshAll();
      toast("作品已删除", "success");
      onDeleted?.();
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败", "error");
    } finally {
      setBusy(null);
    }
  }

  function moveImage(index: number, direction: -1 | 1) {
    if (!draft || post?.status === "published") return;
    const target = index + direction;
    if (target < 0 || target >= draft.images.length) return;
    const images = [...draft.images];
    [images[index], images[target]] = [images[target], images[index]];
    update("images", images);
  }

  function setCover(id: string) {
    if (!draft || isPublished) return;
    const images = [id, ...draft.images.filter((imageId) => imageId !== id)];
    setDraft({ ...draft, images, coverImageId: id });
    setActiveImageId(id);
  }

  function removeImage(id: string) {
    if (!draft || post?.status === "published") return;
    const index = draft.images.indexOf(id);
    const images = draft.images.filter((imageId) => imageId !== id);
    const current =
      activeImageId && draft.images.includes(activeImageId)
        ? activeImageId
        : draft.coverImageId && draft.images.includes(draft.coverImageId)
        ? draft.coverImageId
        : draft.images[0];
    setDraft({
      ...draft,
      images,
      coverImageId:
        draft.coverImageId === id ? images[0] || null : draft.coverImageId,
    });
    if (id === current) {
      setActiveImageId(images[Math.min(index, images.length - 1)] || null);
    }
  }

  function addImage(image: Photo) {
    if (!draft || post?.status === "published") return;
    const hasVideo = draft.images.some(
      (id) =>
        (post?.images.find((item) => item.id === id)?.kind ||
          unusedData?.images.find((item) => item.id === id)?.kind ||
          addedKinds[id] ||
          "image") !== "image"
    );
    if (hasVideo) {
      toast("视频/动图笔记只能有 1 个素材", "error");
      return;
    }
    if (draft.images.length > 0 && image.kind !== "image") {
      toast("视频/动图不能和静态图片放在同一篇笔记里", "error");
      return;
    }
    if (draft.images.length >= 18) {
      toast("小红书一篇最多 18 张图", "error");
      return;
    }
    setAddedKinds((prev) => ({ ...prev, [image.id]: image.kind }));
    setDraft({
      ...draft,
      images: [...draft.images, image.id],
      coverImageId: draft.coverImageId || image.id,
    });
    setActiveImageId(image.id);
  }

  const hashtags = draft ? parseHashtags(draft.hashtagsText, 100) : [];
  const isPublished = post?.status === "published";
  const working = Boolean(busy);
  function requestClose() {
    if (working) return;
    if (isDirty && !window.confirm("有未保存的修改，确定关闭吗？")) return;
    onClose();
  }
  const currentImageId = draft
    ? activeImageId && draft.images.includes(activeImageId)
      ? activeImageId
      : draft.coverImageId && draft.images.includes(draft.coverImageId)
      ? draft.coverImageId
      : draft.images[0] || null
    : null;
  const currentIndex =
    draft && currentImageId ? draft.images.indexOf(currentImageId) : -1;
  const currentIsCover = Boolean(
    currentImageId && draft?.coverImageId === currentImageId
  );
  const kindOf = (id: string): Photo["kind"] =>
    post?.images.find((image) => image.id === id)?.kind ||
    unusedData?.images.find((image) => image.id === id)?.kind ||
    addedKinds[id] ||
    "image";
  const currentKind = currentImageId ? kindOf(currentImageId) : "image";
  const isVideoAsset = currentKind === "video";
  const isGifAsset = currentKind === "gif";
  const isVideoPost = Boolean(
    draft?.images.some((id) => kindOf(id) !== "image")
  );
  const currentDuration = currentImageId
    ? post?.images.find((image) => image.id === currentImageId)?.duration ||
      unusedData?.images.find((image) => image.id === currentImageId)?.duration ||
      0
    : 0;
  const pickableImages = availableImages.filter((image) =>
    draft && draft.images.length > 0 ? image.kind === "image" : true
  );

  return (
    <Modal
      open={open}
      onClose={requestClose}
      size="full"
      title={
        <span className="flex items-center gap-2">
          {post?.theme || "作品详情"}
          {post && <StatusBadge status={post.status} />}
        </span>
      }
      subtitle={
        post
          ? `${
              isVideoPost
                ? isGifAsset
                  ? "动图笔记"
                  : "视频笔记"
                : `${draft?.images.length || 0} 个素材`
            } · ${
              post.scheduledDate
                ? `计划 ${post.scheduledDate} ${post.scheduledTime || ""}`
                : "未排期"
            }${isPublished ? ` · 发布于 ${formatDateTime(post.publishedAt)}` : ""}`
          : undefined
      }
      footer={
        draft ? (
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-1.5">
              <button onClick={handleCopy} className="btn-ghost btn-sm">
                <Copy size={14} /> 复制文案
              </button>
              <button
                onClick={handleExport}
                disabled={working}
                className="btn-ghost btn-sm"
              >
                {busy === "export" ? <Spinner size={14} /> : <Download size={14} />}
                导出发布包
              </button>
              <a
                href={isVideoPost ? PUBLISH_VIDEO_URL : PUBLISH_URL}
                target="_blank"
                rel="noreferrer"
                className="btn-ghost btn-sm"
              >
                <ExternalLink size={14} /> 打开发布页
              </a>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button onClick={handleDelete} disabled={working} className="btn-ghost btn-sm text-red-500 hover:bg-red-50 hover:text-red-600">
                <Trash2 size={14} /> 删除
              </button>
              {!isPublished && (
                <button
                  onClick={handleSave}
                  disabled={working}
                  className="btn-secondary btn-sm"
                >
                  {busy === "save" ? <Spinner size={14} /> : <Check size={14} />}
                  保存
                </button>
              )}
              {isPublished ? (
                <button
                  onClick={handleUnpublish}
                  disabled={working}
                  className="btn-secondary btn-sm"
                >
                  {busy === "unpublish" ? <Spinner size={14} /> : <Undo2 size={14} />}
                  撤回标记
                </button>
              ) : (
                <>
                  <button
                    onClick={() =>
                      handleStatus(post?.status === "ready" ? "draft" : "ready")
                    }
                    disabled={working}
                    className="btn-secondary btn-sm"
                  >
                    {busy === "ready" || busy === "draft" ? (
                      <Spinner size={14} />
                    ) : (
                      <Check size={14} />
                    )}
                    {post?.status === "ready" ? "退回草稿" : "标记待发布"}
                  </button>
                  <button
                    onClick={handlePublish}
                    disabled={working}
                    title="已经在小红书手动发布过了，只更新作品状态"
                    className="btn-primary btn-sm"
                  >
                    {busy === "publish" ? <Spinner size={14} /> : <Check size={14} />}
                    标记已手动发布
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null
      }
    >
      {error ? (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-24 text-center">
          <p className="text-sm font-medium text-red-600">作品加载失败</p>
          <p className="max-w-md break-words text-xs text-muted">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <button onClick={() => mutate()} className="btn-secondary btn-sm">
            重试
          </button>
        </div>
      ) : isLoading || !post || !draft ? (
        <div className="flex items-center justify-center py-24">
          <Spinner size={24} className="text-brand" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-0 lg:grid-cols-[1.08fr_1fr]">
          <div className="border-b border-line bg-paper/40 p-5 sm:p-6 lg:border-b-0 lg:border-r">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
                {isVideoPost
                  ? isGifAsset
                    ? "动图预览"
                    : "视频预览"
                  : "配图预览"}
              </p>
              {!isVideoPost && !isPublished && (
                <button
                  onClick={() => setPicking((prev) => !prev)}
                  className="btn-ghost btn-sm"
                >
                  <ImagePlus size={14} /> 添加素材
                </button>
              )}
            </div>

            {isVideoPost && currentImageId ? (
              <>
                <div className="relative flex h-[280px] items-center justify-center overflow-hidden rounded-2xl bg-[#161311] sm:h-[420px]">
                  {isVideoAsset ? (
                    <video
                      src={`/api/images/${currentImageId}/file?kind=original`}
                      poster={`/api/images/${currentImageId}/file?kind=preview`}
                      controls
                      playsInline
                      className="max-h-full max-w-full rounded-xl"
                    />
                  ) : (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={`/api/images/${currentImageId}/file?kind=original`}
                      alt="动图预览"
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                  <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium text-white">
                      {isVideoAsset
                        ? `视频${currentDuration ? ` · ${Math.round(currentDuration)}s` : ""}`
                        : "动图"}
                    </span>
                    <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                      1 / 1
                    </span>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] leading-relaxed text-muted">
                    {isGifAsset
                      ? "动图会转成短视频发布，笔记只使用这一个素材。"
                      : "视频笔记只使用这一个视频，发布时会按视频上传。"}
                  </p>
                  <button
                    onClick={() => removeImage(currentImageId)}
                    disabled={isPublished}
                    className="flex h-8 items-center gap-1.5 rounded-full border border-line bg-white px-3 text-[11px] text-muted transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                  >
                    <X size={13} /> 移除
                  </button>
                </div>
              </>
            ) : draft.images.length && currentImageId ? (
              <>
                <div className="relative flex h-[280px] items-center justify-center overflow-hidden rounded-2xl bg-[#161311] sm:h-[420px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/images/${currentImageId}/file?kind=preview`}
                    alt="配图预览"
                    className="max-h-full max-w-full object-contain"
                  />
                  <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                      {currentIndex + 1} / {draft.images.length}
                    </span>
                    {currentIsCover && (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium text-white">
                        封面
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] leading-relaxed text-muted">
                    点击缩略图切换大图，星标为封面；封面会作为第一张发布
                  </p>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setCover(currentImageId)}
                      disabled={currentIsCover || isPublished}
                      className="btn-secondary btn-sm"
                    >
                      <Star
                        size={12}
                        className={currentIsCover ? "fill-brand text-brand" : ""}
                      />
                      {currentIsCover ? "当前封面" : "设为封面（置顶）"}
                    </button>
                    <button
                      onClick={() => moveImage(currentIndex, -1)}
                      disabled={currentIndex <= 0 || isPublished}
                      title="前移"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-muted transition hover:text-ink disabled:opacity-35"
                    >
                      <ArrowLeft size={13} />
                    </button>
                    <button
                      onClick={() => moveImage(currentIndex, 1)}
                      disabled={
                        currentIndex >= draft.images.length - 1 || isPublished
                      }
                      title="后移"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-muted transition hover:text-ink disabled:opacity-35"
                    >
                      <ArrowRight size={13} />
                    </button>
                    <button
                      onClick={() => removeImage(currentImageId)}
                      title="移除"
                      disabled={isPublished}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-white text-muted transition hover:border-red-200 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                <div className="thin-scroll mt-3 flex items-center gap-2 overflow-x-auto pb-1">
                  {draft.images.map((id, index) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setActiveImageId(id)}
                      className={cn(
                        "relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition",
                        id === currentImageId
                          ? "border-brand ring-2 ring-brand/15"
                          : "border-transparent hover:border-line"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/images/${id}/file?kind=preview`}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute left-1 top-1 rounded-full bg-black/55 px-1 py-0.5 text-[9px] leading-none text-white backdrop-blur">
                        {index + 1}
                      </span>
                      {draft.coverImageId === id && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-white">
                          <Star size={9} className="fill-white" />
                        </span>
                      )}
                    </button>
                  ))}
                  {!isPublished && (
                    <button
                      type="button"
                      onClick={() => setPicking(true)}
                      className="flex h-16 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-muted transition hover:border-brand/40 hover:text-brand"
                    >
                      <ImagePlus size={16} />
                      <span className="text-[9px]">添加</span>
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/60 px-4 py-16 text-center">
                <ImagePlus size={24} className="mb-2 text-muted" />
                <p className="text-sm">还没有素材</p>
                <p className="mt-1 text-xs text-muted">
                  点击右上角「添加素材」从素材库挑选图片、动图或视频
                </p>
              </div>
            )}

            {picking && !isVideoPost && (
              <div className="mt-4 rounded-2xl border border-line bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium">从未使用素材中添加</p>
                  <button
                    onClick={() => setPicking(false)}
                    className="rounded-full p-1 text-muted hover:bg-paper"
                  >
                    <X size={14} />
                  </button>
                </div>
                {pickableImages.length ? (
                  <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto thin-scroll sm:grid-cols-5">
                    {pickableImages.map((image) => (
                      <button
                        key={image.id}
                        onClick={() => addImage(image)}
                        className="group relative aspect-square overflow-hidden rounded-xl border border-line"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.thumbUrl}
                          alt=""
                          className="h-full w-full object-cover transition group-hover:scale-105"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100">
                          {image.kind === "video" ? (
                            <Play size={16} fill="currentColor" />
                          ) : (
                            <ImagePlus size={16} />
                          )}
                        </span>
                        {image.kind !== "image" && (
                          <span className="absolute bottom-1 left-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] font-medium text-white backdrop-blur">
                            {image.kind === "video"
                              ? `视频${image.duration ? ` ${Math.round(image.duration)}s` : ""}`
                              : "动图"}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-xs text-muted">
                    暂无可添加的同类素材，去素材库上传或释放一些吧
                  </p>
                )}
              </div>
            )}

            {draft.note && (
              <div className="mt-4 rounded-2xl bg-brand-soft/50 p-3.5">
                <p className="flex items-center gap-1.5 text-[10px] font-medium text-brand">
                  <Sparkles size={11} /> AI 策划思路
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink/70">
                  {draft.note}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <div className="mr-auto flex flex-wrap items-center gap-1.5">
                <StatusBadge status={post.status} />
                {post.eventId && post.eventName && (
                  <Link
                    href={`/events/${post.eventId}`}
                    className="inline-flex items-center gap-1 rounded-full border border-brand/20 bg-brand-soft/50 px-2 py-0.5 text-[10px] font-medium text-brand hover:underline"
                  >
                    <Megaphone size={10} /> {post.eventName}
                  </Link>
                )}
                <span className="text-[11px] text-muted">
                  {isPublished ? "素材已锁定" : "素材已为此作品预留"}
                </span>
                {isPublished && post.xhsUrl && (
                  <a
                    href={post.xhsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-brand hover:underline"
                  >
                    查看小红书笔记 <ExternalLink size={10} />
                  </a>
                )}
              </div>
              <button
                onClick={handleRewrite}
                disabled={working || !draft.images.length || isPublished}
                title={isPublished ? "已发布作品已锁定" : "让 AI 重写文案"}
                className="btn-ghost btn-sm text-brand hover:bg-brand-soft"
              >
                {busy === "rewrite" ? (
                  <Spinner size={13} />
                ) : (
                  <Sparkles size={13} />
                )}
                AI 重写文案
              </button>
            </div>

            {isPublished && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-[11px] leading-relaxed text-emerald-700">
                这篇作品已经发布，文案和配图已锁定。如需修改，请先点右下角「撤回发布」。
              </div>
            )}


            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0">标题</label>
                <span
                  className={cn(
                    "text-[10px]",
                    charLength(draft.title) > XHS_TITLE_MAX
                      ? "text-red-500"
                      : "text-muted"
                  )}
                >
                  {charLength(draft.title)}/{XHS_TITLE_MAX}
                </span>
              </div>
              <input
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
                maxLength={XHS_TITLE_MAX}
                aria-label="标题"
                disabled={isPublished}
                placeholder="写一个有点击欲但不夸张的标题"
                className="field"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0">正文</label>
                <span
                  className={cn(
                    "text-[10px]",
                    charLength(draft.body) +
                      (hashtags.length
                        ? charLength(hashtagLine(hashtags)) + 2
                        : 0) >
                    XHS_BODY_MAX
                      ? "text-red-500"
                      : "text-muted"
                  )}
                >
                  {charLength(draft.body) +
                    (hashtags.length
                      ? charLength(hashtagLine(hashtags)) + 2
                      : 0)}
                  /{XHS_BODY_MAX}（含标签）
                </span>
              </div>
              <textarea
                value={draft.body}
                onChange={(event) => update("body", event.target.value)}
                rows={9}
                maxLength={XHS_BODY_MAX}
                aria-label="正文"
                disabled={isPublished}
                placeholder="正文内容…"
                className="field resize-none leading-relaxed"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0">标签（空格或逗号分隔）</label>
                <span
                  className={cn(
                    "text-[10px]",
                    hashtags.length > XHS_HASHTAGS_MAX
                      ? "text-red-500"
                      : "text-muted"
                  )}
                >
                  {hashtags.length}/{XHS_HASHTAGS_MAX}
                </span>
              </div>
              <input
                value={draft.hashtagsText}
                onChange={(event) => update("hashtagsText", event.target.value)}
                aria-label="标签"
                disabled={isPublished}
                placeholder="生活记录 氛围感 咖啡馆"
                className="field"
              />
              {hashtags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {hashtags.slice(0, XHS_HASHTAGS_MAX).map((tag) => (
                    <span key={tag} className="chip text-brand">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">计划发布日期</label>
                <div className="relative">
                  <CalendarDays
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    type="date"
                    aria-label="计划发布日期"
                    value={draft.scheduledDate}
                    disabled={isPublished}
                    onChange={(event) =>
                      update("scheduledDate", event.target.value)
                    }
                    className="field pl-8"
                  />
                </div>
              </div>
              <div>
                <label className="label">发布时间</label>
                <input
                  type="time"
                  aria-label="发布时间"
                  value={draft.scheduledTime}
                  disabled={isPublished}
                  onChange={(event) =>
                    update("scheduledTime", event.target.value)
                  }
                  className="field"
                />
              </div>
            </div>


            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">主题</label>
                <input
                  value={draft.theme}
                  onChange={(event) => update("theme", event.target.value)}
                  aria-label="主题"
                  maxLength={40}
                  disabled={isPublished}
                  placeholder="例如：周末咖啡馆"
                  className="field"
                />
              </div>
              <div>
                <label className="label">快速排期</label>
                <button
                  onClick={() => update("scheduledDate", todayStr())}
                  disabled={isPublished}
                  className="field flex items-center gap-2 text-left text-muted disabled:opacity-50"
                >
                  <CalendarDays size={14} /> 改为今天发布
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-line bg-paper/50 p-3.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                发布流程
              </p>
              <ol className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
                <li>1. 复制文案，或导出包含原图的发布包。</li>
                <li>2. 到小红书发布页手动上传、粘贴并发布。</li>
                <li>3. 回到这里点「标记已手动发布」，可顺手粘贴笔记链接。</li>
              </ol>
              <p className="mt-2 text-[10px] leading-relaxed text-muted/80">
                标记后作品会锁定配图，并计入已发布数据。
              </p>
            </div>

            <p className="text-[10px] text-muted">
              最后编辑于 {formatDateTime(post.updatedAt)}
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
