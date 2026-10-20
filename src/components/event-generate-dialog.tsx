"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Check, Images, Sparkles } from "lucide-react";
import { Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, fetcher } from "@/lib/client";
import { cn, todayStr } from "@/lib/utils";
import type { Event, Photo, Post } from "@/lib/types";

export function EventGenerateDialog({
  open,
  onClose,
  event,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  event: Event | null;
  onGenerated?: (post: Post) => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [instruction, setInstruction] = useState("");
  const [date, setDate] = useState(todayStr());
  const [busy, setBusy] = useState(false);

  const { data: imageData } = useSWR<{ images: Photo[] }>(
    open ? "/api/images?status=unused&analyzed=1&excludeCampaign=1" : null,
    fetcher
  );
  const { data: settingsData } = useSWR<{ configured: boolean }>(
    "/api/settings",
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!open || !event) return;
    setSelected(new Set());
    setInstruction("");
    const today = todayStr();
    setDate(
      today >= event.startDate && today <= event.endDate
        ? today
        : event.startDate
    );
  }, [open, event]);

  const images = useMemo(() => {
    return (imageData?.images || []).filter((image) => {
      if (image.kind !== "image" || image.campaign) return false;
      if (settingsData?.configured && image.analysis?.mock) return false;
      return true;
    });
  }, [imageData, settingsData]);

  function toggle(id: string) {
    if (!event) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 9) {
          toast("一篇最多选择 9 张图片", "error");
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  }

  async function generate() {
    if (!event) return;
    if (selected.size < event.minImages) {
      toast(`至少选择 ${event.minImages} 张图片`, "error");
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ post: Post; warnings?: string[] }>(
        `/api/events/${event.id}/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            imageIds: [...selected],
            instruction,
            date,
          }),
        }
      );
      if (res.warnings?.length) {
        toast(res.warnings.slice(0, 2).join("；"), "info");
      } else {
        toast("活动稿已生成，打开作品继续完善", "success");
      }
      onGenerated?.(res.post);
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "生成失败", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!event) return null;

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="xl"
      title="AI 写活动稿"
      subtitle={`${event.name} · 至少 ${event.minImages} 张图 / ${event.minBody} 字`}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            已选{" "}
            <span className="font-semibold text-ink">{selected.size}</span> 张
            {selected.size < event.minImages
              ? `，还差 ${event.minImages - selected.size} 张`
              : "，可以生成"}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose} disabled={busy} className="btn-secondary btn-sm">
              取消
            </button>
            <button
              onClick={generate}
              disabled={busy || selected.size < event.minImages}
              className="btn-primary"
            >
              {busy ? <Spinner size={15} /> : <Sparkles size={15} />}
              {busy ? "正在写…" : "生成活动稿"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-5 sm:p-6">
        <div className="rounded-2xl border border-brand/20 bg-brand-soft/30 p-4 text-xs leading-relaxed text-ink/70">
          <p>
            必带话题：
            {event.requiredTopics.map((topic) => (
              <span key={topic} className="ml-1 chip py-0.5 text-brand">
                #{topic}
              </span>
            ))}
          </p>
          {event.internal && (
            <p className="mt-1 text-amber-700">
              内部活动：不要使用群聊、直播或内部资料截图。
            </p>
          )}
          {event.officialAssets && (
            <p className="mt-1 text-amber-700">
              官方素材需二创，生成后请检查配图。
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="label">计划发布日期</label>
            <input
              type="date"
              min={event.startDate}
              max={event.endDate}
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">额外要求（可选）</label>
            <input
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              className="field"
              placeholder="例如：重点写超充和家用体验"
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label mb-0">选择未使用、已识别的实拍素材</p>
            <span className="text-[10px] text-muted">
              最多 9 张，至少 {event.minImages} 张
            </span>
          </div>
          {images.length ? (
            <div className="grid max-h-[360px] grid-cols-3 gap-2 overflow-y-auto thin-scroll sm:grid-cols-5 md:grid-cols-6">
              {images.map((image) => {
                const active = selected.has(image.id);
                return (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => toggle(image.id)}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-xl border-2 transition",
                      active
                        ? "border-brand ring-2 ring-brand/20"
                        : "border-transparent hover:border-line"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.thumbUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <span
                      className={cn(
                        "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full border",
                        active
                          ? "border-brand bg-brand text-white"
                          : "border-white/70 bg-black/25 text-transparent"
                      )}
                    >
                      <Check size={11} strokeWidth={3} />
                    </span>
                    {image.analysis?.quality ? (
                      <span className="absolute bottom-1 right-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[9px] text-white">
                        潜力 {image.analysis.quality}/5
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center">
              <Images className="mx-auto mb-2 text-muted" size={20} />
              <p className="text-sm">没有可用的已识别素材</p>
              <p className="mt-1 text-xs text-muted">
                先去素材库上传并完成 AI 识别，再回来生成活动稿。
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
