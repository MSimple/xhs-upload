"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { CalendarRange, Sparkles, Wand2 } from "lucide-react";
import { Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, fetcher, refreshAll } from "@/lib/client";
import { addDays, todayStr, cn } from "@/lib/utils";
import type { Photo, Post } from "@/lib/types";

const STEPS = [
  "正在阅读每一张照片的内容…",
  "正在按主题给图片分组…",
  "正在挑选封面和配图顺序…",
  "正在撰写标题、正文和标签…",
  "正在安排发布日历…",
];

const QUICK = ["轻松日常口吻", "突出氛围感", "多写一点实用信息", "适合周末发"];

export function GenerateDialog({
  open,
  onClose,
  imageIds,
  startDate,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  imageIds?: string[];
  startDate?: string;
  onGenerated?: (posts: Post[]) => void;
}) {
  const toast = useToast();
  const [instruction, setInstruction] = useState("");
  const [date, setDate] = useState(startDate || addDays(todayStr(), 1));
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);

  const { data: imageData } = useSWR<{ images: Photo[] }>(
    open
      ? `/api/images?status=unused&analyzed=1${
          imageIds?.length ? "" : "&excludeCampaign=1"
        }`
      : null,
    fetcher
  );
  const { data: settingsData } = useSWR<{ configured: boolean }>(
    "/api/settings",
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (open) {
      setDate(startDate || addDays(todayStr(), 1));
      setStep(0);
    }
  }, [open, startDate]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(
      () => setStep((prev) => Math.min(prev + 1, STEPS.length - 1)),
      2600
    );
    return () => clearInterval(timer);
  }, [busy]);

  const eligible = useMemo(() => {
    const all = imageData?.images || [];
    if (imageIds && imageIds.length) {
      const selected = new Set(imageIds);
      return all.filter((img) => selected.has(img.id));
    }
    return all;
  }, [imageData, imageIds]);

  async function generate() {
    if (!eligible.length) {
      toast("还没有可用的已识别素材，请先上传并识别", "error");
      return;
    }
    setBusy(true);
    setStep(0);
    try {
      const res = await api<{ posts: Post[]; mock: boolean; skipped: number }>(
        "/api/generate",
        {
          method: "POST",
          body: JSON.stringify({
            imageIds: imageIds && imageIds.length ? imageIds : undefined,
            instruction,
            startDate: date,
          }),
        }
      );
      await refreshAll();
      toast(
        res.mock
          ? `演示模式：已生成 ${res.posts.length} 篇示例草稿`
          : `AI 已生成 ${res.posts.length} 篇草稿，去作品库看看`,
        "success"
      );
      onGenerated?.(res.posts);
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "生成失败", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="lg"
      title="AI 智能成稿"
      subtitle="挑素材、定主题、写文案、排日期，一次完成"
      footer={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted">
            将使用{" "}
            <span className="font-semibold text-ink">{eligible.length}</span>{" "}
            个已识别、未使用的素材
            {!settingsData?.configured && (
              <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                演示模式
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={busy}
              className="btn-secondary btn-sm"
            >
              取消
            </button>
            <button
              onClick={generate}
              disabled={busy || !eligible.length}
              className="btn-primary"
            >
              {busy ? <Spinner size={16} /> : <Wand2 size={16} />}
              {busy ? "正在策划…" : "开始 AI 策划"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-5 sm:p-6">
        {busy ? (
          <div className="flex flex-col items-center justify-center rounded-3xl bg-paper/70 px-6 py-12 text-center">
            <div className="relative mb-5 flex h-16 w-16 items-center justify-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/10" />
              <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white">
                <Sparkles size={24} />
              </span>
            </div>
            <p className="text-sm font-medium">{STEPS[step]}</p>
            <p className="mt-1 text-xs text-muted">
              素材较多时可能需要一分钟左右，请保持页面打开
            </p>
            <div className="mt-5 flex gap-1.5">
              {STEPS.map((_, index) => (
                <span
                  key={index}
                  className={cn(
                    "h-1.5 rounded-full transition-all",
                    index === step ? "w-6 bg-brand" : "w-1.5 bg-line"
                  )}
                />
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-line bg-paper/50 p-4">
              <div className="flex items-start gap-2.5">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-brand" />
                <p className="text-xs leading-relaxed text-muted">
                  会先读懂每个素材的场景、情绪和亮点，再把图片按主题分组。视频和动图会单独成篇，
                  自动挑选封面、安排发布顺序；主题差异大时会拆成多篇。
                </p>
              </div>
            </div>

            {eligible.length > 0 && (
              <div>
                <p className="label">本次可用素材</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {eligible.slice(0, 12).map((img) => (
                    <div
                      key={img.id}
                      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-paper"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.thumbUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </div>
                  ))}
                  {eligible.length > 12 && (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-paper text-xs text-muted">
                      +{eligible.length - 12}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div>
              <label className="label">额外要求（可选）</label>
              <textarea
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={3}
                placeholder="例如：这次想发一组周末咖啡馆的日常；语气轻松一点；每篇 4 张图左右…"
                className="field resize-none"
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setInstruction((prev) =>
                        prev.includes(item)
                          ? prev
                          : `${prev}${prev ? "；" : ""}${item}`
                      )
                    }
                    className="chip transition hover:border-brand/30 hover:text-brand"
                  >
                    + {item}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">从哪天开始排期</label>
                <div className="relative">
                  <CalendarRange
                    size={15}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    type="date"
                    value={date}
                    min={todayStr()}
                    onChange={(event) => setDate(event.target.value)}
                    className="field pl-9"
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-line bg-white px-4 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted">
                  排期规则
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  按设置里的「每天发布篇数」依次占位，遇到已有作品的日期自动顺延。
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
