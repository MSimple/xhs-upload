"use client";

import { useState } from "react";
import {
  Check,
  Info,
  RotateCw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Modal, Spinner, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, refreshAll } from "@/lib/client";
import { formatBytes, formatDateTime, cn } from "@/lib/utils";
import type { Photo } from "@/lib/types";

export function ImageInspector({
  image,
  open,
  onClose,
  onChanged,
}: {
  image: Photo | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (!image) return null;
  const analysis = image.analysis;

  async function runAnalyze() {
    if (!image) return;
    setBusy("analyze");
    try {
      await api(`/api/images/${image.id}/analyze`, { method: "POST" });
      await refreshAll();
      onChanged?.();
      toast("AI 识别完成", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "识别失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function toggleUsed() {
    if (!image) return;
    setBusy("used");
    try {
      await api(`/api/images/${image.id}`, {
        method: "PATCH",
        body: JSON.stringify({ manualUsed: !image.manualUsed }),
      });
      await refreshAll();
      onChanged?.();
      toast(image.manualUsed ? "已取消使用标记" : "已标记为使用过", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!image) return;
    if (!window.confirm("删除这张图片？如果它已配在作品中，会同时从作品里移除。")) {
      return;
    }
    setBusy("delete");
    try {
      await api(`/api/images/${image.id}`, { method: "DELETE" });
      await refreshAll();
      onChanged?.();
      toast("图片已删除", "success");
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="素材详情"
      subtitle={`${image.originalName} · ${formatBytes(image.size)}`}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={remove}
            disabled={Boolean(busy)}
            className="btn-ghost text-red-500 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={15} /> 删除
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleUsed}
              disabled={
                Boolean(busy) || (image.status === "used" && !image.manualUsed)
              }
              title={
                image.status === "used" && !image.manualUsed
                  ? "这张图已被已发布的作品占用，撤回发布后可释放"
                  : undefined
              }
              className="btn-secondary btn-sm"
            >
              {busy === "used" ? (
                <Spinner size={14} />
              ) : image.manualUsed ? (
                <X size={14} />
              ) : (
                <Check size={14} />
              )}
              {image.manualUsed
                ? "取消使用标记"
                : image.status === "used"
                ? "已被作品使用"
                : "标记为已使用"}
            </button>
            <button
              onClick={runAnalyze}
              disabled={Boolean(busy)}
              className="btn-primary btn-sm"
            >
              {busy === "analyze" ? (
                <Spinner size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              {analysis ? "重新识别" : "AI 识别"}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-0 md:grid-cols-[1.05fr_1fr]">
        <div className="relative flex min-h-[280px] items-center justify-center bg-[#141210] p-4 md:min-h-[520px]">
          {image.kind === "video" ? (
            <video
              src={image.originalUrl}
              poster={image.previewUrl}
              controls
              playsInline
              className="max-h-[60vh] w-auto max-w-full rounded-xl"
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image.kind === "gif" ? image.originalUrl : image.previewUrl}
              alt={image.originalName}
              className="max-h-[60vh] w-auto max-w-full rounded-xl object-contain"
            />
          )}
          <div className="absolute left-4 top-4 flex items-center gap-2">
            <StatusBadge status={image.status} className="bg-white/95 backdrop-blur" />
            {image.kind !== "image" && (
              <span className="rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                {image.kind === "video"
                  ? `视频${image.duration ? ` · ${Math.round(image.duration)}s` : ""}`
                  : "动图"}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl bg-paper px-2 py-3">
              <p className="text-sm font-semibold">
                {image.width && image.height
                  ? `${image.width}×${image.height}`
                  : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-muted">尺寸</p>
            </div>
            <div className="rounded-2xl bg-paper px-2 py-3">
              <p className="text-sm font-semibold">
                {analysis?.orientation || "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-muted">构图</p>
            </div>
            <div className="rounded-2xl bg-paper px-2 py-3">
              <p className="text-sm font-semibold">
                {analysis ? `${analysis.quality}/5` : "—"}
              </p>
              <p className="mt-0.5 text-[10px] text-muted">封面潜力</p>
            </div>
          </div>

          {analysis ? (
            <>
              <div className="flex items-center gap-2">
                <SpanTitle>AI 识别结果</SpanTitle>
                {analysis.mock && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                    演示分析
                  </span>
                )}
              </div>
              <p className="text-sm leading-relaxed text-ink/80">
                {analysis.summary}
              </p>
              {image.kind !== "image" && (
                <p className="text-[10px] leading-relaxed text-muted">
                  AI 识别基于{image.kind === "video" ? "视频封面帧" : "动图首帧"}；
                  发布时会{image.kind === "video" ? "按视频上传" : "自动转成短视频"}。
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                <InfoItem label="主体" value={analysis.subject} />
                <InfoItem label="场景" value={analysis.scene} />
                <InfoItem label="氛围" value={analysis.mood} />
                <InfoItem
                  label="主色"
                  value={analysis.colors?.join("、") || "—"}
                />
              </div>

              <div>
                <SpanTitle>内容标签</SpanTitle>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(analysis.tags || []).map((tag) => (
                    <span key={tag} className="chip">
                      #{tag}
                    </span>
                  ))}
                  {!analysis.tags?.length && (
                    <span className="text-xs text-muted">暂无</span>
                  )}
                </div>
              </div>

              {Boolean(analysis.topics?.length) && (
                <div>
                  <SpanTitle>适合的选题</SpanTitle>
                  <ul className="mt-2 space-y-1.5 text-sm text-ink/75">
                    {analysis.topics.map((topic) => (
                      <li key={topic} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" />
                        {topic}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-start gap-2 rounded-2xl bg-paper/80 p-3 text-[11px] leading-relaxed text-muted">
                <Info size={13} className="mt-0.5 shrink-0" />
                已使用或已排期的图片不会再被 AI 策划选中。想重新使用：手动标记的图可取消标记；
                作品里的配图需要撤回发布或从作品中移除。
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-line p-5 text-center">
              <Sparkles className="mx-auto mb-2 text-brand" size={20} />
              <p className="text-sm font-medium">还没有识别这张图</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                点击下方「AI 识别」，让 AI 读懂画面内容、氛围和适合的选题。
              </p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-line pt-4 text-[10px] text-muted">
            <span>上传于 {formatDateTime(image.createdAt)}</span>
            <span className="inline-flex items-center gap-1">
              <RotateCw size={10} />
              {image.analyzedAt
                ? `识别于 ${formatDateTime(image.analyzedAt)}`
                : "未识别"}
            </span>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function SpanTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
      {children}
    </p>
  );
}

function InfoItem({ label, value }: { label: string; value?: string }) {
  return (
    <div className={cn("rounded-2xl border border-line px-3 py-2.5")}>
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-0.5 truncate text-[13px]">{value || "—"}</p>
    </div>
  );
}
