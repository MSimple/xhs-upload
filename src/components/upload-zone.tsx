"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { ImagePlus, Sparkles, Upload } from "lucide-react";
import {
  analyzeImages,
  api,
  fetcher,
  makeMediaPreview,
  refreshAll,
} from "@/lib/client";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Photo } from "@/lib/types";

export function UploadZone({
  onUploaded,
  compact = false,
  className,
  campaign,
  defaultTagged = false,
}: {
  onUploaded?: (images: Photo[]) => void;
  compact?: boolean;
  className?: string;
  campaign?: string;
  defaultTagged?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [tagCampaign, setTagCampaign] = useState(defaultTagged);
  const autoAnalyzeTouched = useRef(false);
  const { data: settingsData } = useSWR<{ configured: boolean }>(
    "/api/settings",
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (defaultTagged) setTagCampaign(true);
  }, [defaultTagged]);

  useEffect(() => {
    if (!settingsData || autoAnalyzeTouched.current) return;
    setAutoAnalyze(settingsData.configured);
  }, [settingsData]);

  async function handleFiles(list: FileList | File[]) {
    let files = Array.from(list).filter(
      (file) =>
        file.type.startsWith("image/") ||
        file.type.startsWith("video/") ||
        /\.(heic|heif|avif|gif|mp4|mov|m4v|webm)$/i.test(file.name)
    );
    if (campaign) {
      const before = files.length;
      files = files.filter(
        (file) =>
          file.type.startsWith("image/") &&
          file.type !== "image/gif" &&
          !/\.gif$/i.test(file.name)
      );
      if (before > files.length) {
        toast("创作营只支持静态图片，动图和视频请到素材库上传", "info");
      }
    }
    if (!files.length) {
      toast("请选择图片、动图或视频文件", "error");
      return;
    }

    setBusy(true);
    try {
      setStatus(`正在处理 ${files.length} 个素材…`);
      const form = new FormData();
      const meta: {
        width: number;
        height: number;
        kind: string;
        duration: number;
      }[] = [];
      for (const file of files) {
        setStatus(`正在读取封面 ${file.name.slice(0, 24)}…`);
        const preview = await makeMediaPreview(file);
        form.append("files", file);
        if (preview.blob && preview.blob.size > 0) {
          form.append("previews", preview.blob, "preview.jpg");
        } else {
          form.append("previews", new Blob([]), "empty");
        }
        if (preview.thumbBlob && preview.thumbBlob.size > 0) {
          form.append("thumbs", preview.thumbBlob, "thumb.jpg");
        } else {
          form.append("thumbs", new Blob([]), "empty");
        }
        meta.push({
          width: preview.width,
          height: preview.height,
          kind: preview.kind,
          duration: preview.duration,
        });
      }
      if (!meta.length) {
        throw new Error("没有可上传的素材");
      }
      form.append("meta", JSON.stringify(meta));
      if (campaign && tagCampaign) form.append("campaign", campaign);

      setStatus("正在上传…");
      const res = await api<{ images: Photo[]; warnings?: string[] }>(
        "/api/images/upload",
        {
          method: "POST",
          body: form,
        }
      );
      await refreshAll();
      toast(
        `已上传 ${res.images.length} 个素材${
          campaign && tagCampaign ? `，归入「${campaign}」` : ""
        }`,
        "success"
      );
      if (res.warnings?.length) {
        toast(res.warnings.slice(0, 2).join("；"), "error");
      }
      onUploaded?.(res.images);

      if (autoAnalyze && res.images.length) {
        setStatus(`AI 识别 0/${res.images.length}`);
        const result = await analyzeImages(
          res.images.map((img) => img.id),
          (done, total) => setStatus(`AI 识别 ${done}/${total}`)
        );
        await refreshAll();
        if (result.failed) {
          toast(
            `识别完成 ${result.ok} 个，${result.failed} 个失败，可稍后重试`,
            "error"
          );
        } else if (result.mock) {
          toast(
            `演示识别完成 ${result.mock} 个；配置 AI 后可在素材库重新识别`,
            "info"
          );
        } else {
          toast(`AI 识别完成 ${result.ok} 个`, "success");
        }
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "上传失败", "error");
    } finally {
      setBusy(false);
      setStatus("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!busy) handleFiles(event.dataTransfer.files);
        }}
        onClick={() => !busy && inputRef.current?.click()}
        className={cn(
          "group relative cursor-pointer overflow-hidden rounded-3xl border border-dashed transition-all",
          dragging
            ? "border-brand bg-brand-soft/50"
            : "border-line bg-white/70 hover:border-brand/40 hover:bg-white",
          compact ? "p-5" : "p-8 sm:p-10"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={campaign ? "image/*,.heic,.heif" : "image/*,video/mp4,video/quicktime,.heic,.heif,.gif,.mp4,.mov"}
          className="hidden"
          onChange={(event) => {
            if (event.target.files) handleFiles(event.target.files);
          }}
        />
        <div
          className={cn(
            "flex flex-col items-center text-center",
            compact && "flex-row gap-4 text-left"
          )}
        >
          <span
            className={cn(
              "flex shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand transition group-hover:scale-105",
              compact ? "h-11 w-11" : "mb-4 h-14 w-14"
            )}
          >
            {busy ? (
              <Spinner size={compact ? 20 : 24} />
            ) : dragging ? (
              <ImagePlus size={compact ? 20 : 26} />
            ) : (
              <Upload size={compact ? 20 : 26} />
            )}
          </span>
          <div>
            <p className={cn("font-medium", compact ? "text-sm" : "text-base")}>
              {busy ? status : dragging ? "松手即可上传" : "拖入照片、动图或视频，或点击选择"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {busy
                ? "请稍候，不要关闭页面"
                : "支持 JPG / PNG / WebP / HEIC / GIF / MP4 / MOV；视频单个最大 300MB，可一次选择很多个"}
            </p>
          </div>
        </div>
        {busy && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-brand-soft">
            <div className="h-full w-1/3 animate-[shimmer_1.2s_infinite_linear] bg-brand" />
          </div>
        )}
      </div>

      <label
        className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-muted"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={autoAnalyze}
          onChange={(event) => {
            autoAnalyzeTouched.current = true;
            setAutoAnalyze(event.target.checked);
          }}
          className="h-3.5 w-3.5 accent-[#ff2e4d]"
        />
        <Sparkles size={12} className="text-brand" />
        上传后自动 AI 识别每个素材（视频/动图按封面帧识别）
      </label>

      {campaign && (
        <label
          className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-muted"
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={tagCampaign}
            onChange={(event) => setTagCampaign(event.target.checked)}
            className="h-3.5 w-3.5 accent-[#ff2e4d]"
          />
          <Sparkles size={12} className="text-brand" />
          归入活动「{campaign}」，创作营只使用静态图片
        </label>
      )}
    </div>
  );
}
