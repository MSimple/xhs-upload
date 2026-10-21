"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Rocket,
  Sparkles,
} from "lucide-react";
import { Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, downloadPostExport } from "@/lib/client";
import { formatCN, fullCopy, parseHashtags } from "@/lib/utils";
import type { Post } from "@/lib/types";

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

export function PublishAssistant({
  post,
  open,
  onClose,
  onMarked,
}: {
  post: Post | null;
  open: boolean;
  onClose: () => void;
  onMarked: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState({ copy: false, export: false, open: false });
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setBusy(null);
    setDone({ copy: false, export: false, open: false });
    setUrl(post?.xhsUrl || "");
  }, [open, post?.id, post?.xhsUrl]);

  if (!post) return null;

  const publishUrl = post.mediaType === "video" ? PUBLISH_VIDEO_URL : PUBLISH_URL;

  async function copyCaption() {
    setBusy("copy");
    try {
      const ok = await copyText(
        fullCopy({
          title: post!.title,
          body: post!.body,
          hashtags: parseHashtags(post!.hashtags.join(" ")),
        })
      );
      if (ok) setDone((prev) => ({ ...prev, copy: true }));
      toast(ok ? "标题、正文和标签已复制" : "复制失败，请打开作品手动复制", ok ? "success" : "error");
    } finally {
      setBusy(null);
    }
  }

  async function exportPack() {
    setBusy("export");
    try {
      await downloadPostExport(post!.id);
      setDone((prev) => ({ ...prev, export: true }));
      toast("发布包已下载，包含文案和原图", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "导出失败", "error");
    } finally {
      setBusy(null);
    }
  }

  function openPublishPage() {
    window.open(publishUrl, "_blank", "noopener,noreferrer");
    setDone((prev) => ({ ...prev, open: true }));
  }

  async function prepareAll() {
    setBusy("all");
    window.open(publishUrl, "_blank", "noopener,noreferrer");
    setDone((prev) => ({ ...prev, open: true }));
    try {
      const ok = await copyText(
        fullCopy({
          title: post!.title,
          body: post!.body,
          hashtags: parseHashtags(post!.hashtags.join(" ")),
        })
      );
      await downloadPostExport(post!.id);
      setDone({ copy: ok, export: true, open: true });
      toast("文案已复制，发布包已下载，发布页已打开", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "准备发布失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function markPublished() {
    setBusy("mark");
    try {
      await api(`/api/posts/${post!.id}/publish`, {
        method: "POST",
        body: JSON.stringify({
          published: true,
          url: url.trim() || undefined,
        }),
      });
      await onMarked();
      toast("已标记为手动发布，配图已锁定", "success");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "标记失败", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <Rocket size={18} className="text-brand" /> 发布助手
        </span>
      }
      subtitle="按顺序做完，再回来点「标记完成」"
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button onClick={onClose} className="btn-ghost btn-sm" disabled={Boolean(busy)}>
            稍后再说
          </button>
          <button
            onClick={markPublished}
            disabled={Boolean(busy)}
            className="btn-primary btn-sm"
          >
            {busy === "mark" ? <Spinner size={14} /> : <Check size={14} />}
            我已发布，标记完成
          </button>
        </div>
      }
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="flex items-center gap-4 rounded-2xl border border-line bg-paper/40 p-3.5">
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-paper">
            {post.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.cover.thumbUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted">
                <Sparkles size={18} />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{post.title}</p>
            <p className="mt-0.5 text-[11px] text-muted">
              {post.scheduledDate
                ? `计划 ${formatCN(post.scheduledDate)} ${post.scheduledTime || ""}`
                : "未排期"}{" "}
              · {post.images.length} 个素材
            </p>
          </div>
          <button
            onClick={prepareAll}
            disabled={Boolean(busy)}
            className="btn-secondary btn-sm hidden shrink-0 sm:flex"
          >
            {busy === "all" ? <Spinner size={14} /> : <Rocket size={14} />}
            一键准备
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <StepCard
            number="1"
            title="复制文案"
            description="标题、正文、标签一次复制"
            done={done.copy}
            busy={busy === "copy"}
            icon={<Copy size={15} />}
            onClick={copyCaption}
          />
          <StepCard
            number="2"
            title="下载发布包"
            description="原图 + 文案，手机也能用"
            done={done.export}
            busy={busy === "export"}
            icon={<Download size={15} />}
            onClick={exportPack}
          />
          <StepCard
            number="3"
            title="打开发布页"
            description="到小红书粘贴并发布"
            done={done.open}
            busy={false}
            icon={<ExternalLink size={15} />}
            onClick={openPublishPage}
          />
        </div>

        <button
          onClick={prepareAll}
          disabled={Boolean(busy)}
          className="btn-primary flex w-full items-center justify-center gap-2 sm:hidden"
        >
          {busy === "all" ? <Spinner size={15} /> : <Rocket size={15} />}
          一键准备：复制 + 下载 + 打开
        </button>

        <div>
          <label htmlFor="publish-note-url" className="label flex items-center gap-1.5">
            <Link2 size={13} className="text-muted" />
            发布后的笔记链接（可留空）
          </label>
          <input
            id="publish-note-url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://www.xiaohongshu.com/explore/…"
            className="field"
          />
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
            链接只保存在本机，方便以后回来查看；不填也不影响标记发布。
          </p>
        </div>
      </div>
    </Modal>
  );
}

function StepCard({
  number,
  title,
  description,
  done,
  busy,
  icon,
  onClick,
}: {
  number: string;
  title: string;
  description: string;
  done: boolean;
  busy: boolean;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-line bg-white p-3.5 text-left transition hover:border-brand/30 hover:bg-brand-soft/20"
    >
      <span className="flex items-center justify-between">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-paper text-[10px] font-medium text-muted">
          {done ? <Check size={12} className="text-emerald-600" /> : number}
        </span>
        <span className="text-muted">{busy ? <Spinner size={14} /> : icon}</span>
      </span>
      <span className="mt-3 block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">
        {description}
      </span>
      {done && (
        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
          <Check size={10} /> 已完成
        </span>
      )}
    </button>
  );
}
