"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Check,
  CheckSquare,
  Images,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { GenerateDialog } from "@/components/generate-dialog";
import { ImageInspector } from "@/components/image-inspector";
import { EmptyState, Spinner, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { analyzeImages, api, fetcher, refreshAll } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { Photo } from "@/lib/types";

type Filter = "all" | "unused" | "reserved" | "used" | "pending";

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "unused", label: "未使用" },
  { key: "reserved", label: "已排期" },
  { key: "used", label: "已使用" },
  { key: "pending", label: "待识别" },
];

export default function LibraryPage() {
  const toast = useToast();
  const { data, isLoading, error, mutate } = useSWR<{ images: Photo[] }>(
    "/api/images",
    fetcher
  );
  const { data: settingsData } = useSWR<{
    settings: { campaign_name: string; campaign_enabled: string };
    configured: boolean;
  }>("/api/settings", fetcher, { revalidateOnFocus: false });
  const images = useMemo(() => data?.images || [], [data]);
  const campaignName = settingsData?.settings?.campaign_name || "";
  const campaignEnabled = settingsData?.settings?.campaign_enabled === "1";
  const aiConfigured = Boolean(settingsData?.configured);

  const [tab, setTab] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [campaignOnly, setCampaignOnly] = useState(false);
  const [kindFilter, setKindFilter] = useState<"all" | Photo["kind"]>("all");
  const [sort, setSort] = useState<"new" | "old" | "quality">("new");
  const [defaultTagged, setDefaultTagged] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [reanalyzingMock, setReanalyzingMock] = useState(false);
  const [analyzing, setAnalyzing] = useState<{ done: number; total: number } | null>(
    null
  );

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("campaign") === "1") {
      setUploadOpen(true);
      setDefaultTagged(true);
    }
  }, []);

  const active = useMemo(
    () => images.find((image) => image.id === activeId) || null,
    [images, activeId]
  );

  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(images.map((image) => image.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [images]);

  const counts = useMemo(() => {
    const byStatus = { unused: 0, reserved: 0, used: 0, pending: 0 };
    for (const image of images) {
      if (!image.analysis) byStatus.pending++;
      if (image.status === "unused") byStatus.unused++;
      else if (image.status === "reserved") byStatus.reserved++;
      else if (image.status === "used") byStatus.used++;
    }
    return {
      all: images.length,
      campaign: images.filter(
        (image) => image.campaign && image.kind === "image"
      ).length,
      ...byStatus,
    };
  }, [images]);

  const mockCount = useMemo(
    () => images.filter((image) => image.analysis?.mock).length,
    [images]
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = images.filter((image) => {
      if (tab === "pending" && image.analysis) return false;
      if (tab !== "all" && tab !== "pending" && image.status !== tab) return false;
      if (campaignOnly && !image.campaign) return false;
      if (kindFilter !== "all" && image.kind !== kindFilter) return false;
      if (!query) return true;
      const haystack = [
        image.originalName,
        image.campaign,
        image.summary || "",
        image.scene || "",
        image.mood || "",
        ...(image.tags || []),
        ...(image.analysis?.topics || []),
        ...(image.analysis?.objects || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    return list.sort((a, b) => {
      if (sort === "quality") {
        return (
          (b.analysis?.quality || 0) - (a.analysis?.quality || 0) ||
          b.createdAt.localeCompare(a.createdAt)
        );
      }
      return sort === "old"
        ? a.createdAt.localeCompare(b.createdAt)
        : b.createdAt.localeCompare(a.createdAt);
    });
  }, [images, tab, search, campaignOnly, kindFilter, sort]);

  const selectedIds = useMemo(() => [...selected], [selected]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function analyzeSelected() {
    if (!selectedIds.length) {
      toast("请先选择图片", "error");
      return;
    }
    setAnalyzing({ done: 0, total: selectedIds.length });
    try {
      const result = await analyzeImages(selectedIds, (done, total) =>
        setAnalyzing({ done, total })
      );
      await refreshAll();
      setSelected(new Set());
      toast(
        result.failed
          ? `识别完成 ${result.ok} 张，失败 ${result.failed} 张`
          : result.mock
          ? `演示识别完成 ${result.ok} 张；配置 AI 后可重新识别`
          : `AI 识别完成 ${result.ok} 张`,
        result.failed ? "error" : "success"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "识别失败", "error");
    } finally {
      setAnalyzing(null);
    }
  }

  async function reanalyzeMock() {
    const ids = images
      .filter((image) => image.analysis?.mock)
      .map((image) => image.id);
    if (!ids.length) return;
    setReanalyzingMock(true);
    try {
      const result = await analyzeImages(ids);
      await refreshAll();
      toast(
        result.mock
          ? "仍然是演示识别，请先在设置里配置 AI"
          : `已重新识别 ${result.ok} 张${
              result.failed ? `，${result.failed} 张失败` : ""
            }`,
        result.failed || result.mock ? "error" : "success"
      );
    } finally {
      setReanalyzingMock(false);
    }
  }

  async function bulk(
    action: "used" | "unused" | "delete" | "campaign" | "clearCampaign"
  ) {
    if (!selectedIds.length) return;
    if (action === "delete") {
      const usedCount = selectedIds.filter(
        (id) => images.find((image) => image.id === id)?.status === "used"
      ).length;
      const message = usedCount
        ? `选中的素材里有 ${usedCount} 张已用于作品（含已发布作品）。删除后会同时从这些作品中移除，可能影响已排期内容。确定删除 ${selectedIds.length} 个素材？`
        : `删除选中的 ${selectedIds.length} 个素材？此操作不可恢复。`;
      if (!window.confirm(message)) return;
    }
    try {
      const res = await api<{ images?: Photo[]; skipped?: number }>(
        "/api/images/bulk",
        {
        method: "POST",
        body: JSON.stringify({ ids: selectedIds, action }),
      });
      await refreshAll();
      setSelected(new Set());
      const stillReserved =
        action === "unused"
          ? (res.images || []).filter((image) => image.status === "reserved").length
          : 0;
      toast(
        action === "delete"
          ? "图片已删除"
          : action === "used"
          ? "已标记为使用过"
          : action === "unused"
          ? stillReserved
            ? `已取消手动标记，但其中 ${stillReserved} 张仍在作品中，状态保持已排期`
            : "已恢复为未使用"
          : action === "campaign"
          ? `已归入「${campaignName}」${
              res.skipped ? `，${res.skipped} 个视频/动图已跳过` : ""
            }`
          : "已移出活动",
        "success"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    }
  }

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((image) => selected.has(image.id));

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
            Library
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-[34px]">
            素材库
          </h1>
          <p className="mt-1 text-sm text-muted">
            {counts.all} 个素材 · {counts.unused} 个未使用 · {counts.pending} 个待识别
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setUploadOpen((prev) => !prev)}
            className="btn-secondary"
          >
            <Upload size={15} /> 上传照片
          </button>
          <button
            onClick={() => setGenerateOpen(true)}
            className="btn-primary"
          >
            <Wand2 size={15} />
            {selected.size ? `用所选 ${selected.size} 张策划` : "AI 智能策划"}
          </button>
        </div>
      </header>

      {(uploadOpen || images.length === 0) && (
        <div className="mb-6">
          <UploadZone
            campaign={campaignEnabled ? campaignName : undefined}
            defaultTagged={defaultTagged}
            onUploaded={() => {
              if (images.length > 0) setUploadOpen(false);
            }}
          />
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          {TABS.map((item) => (
            <button
              key={item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition",
                tab === item.key
                  ? "bg-ink font-medium text-white"
                  : "text-muted hover:bg-white hover:text-ink"
              )}
            >
              {item.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  tab === item.key ? "bg-white/15 text-white" : "bg-white text-muted"
                )}
              >
                {counts[item.key]}
              </span>
            </button>
          ))}
          {campaignEnabled && (
            <button
              onClick={() => setCampaignOnly((prev) => !prev)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs transition",
                campaignOnly
                  ? "bg-brand font-medium text-white"
                  : "text-muted hover:bg-white hover:text-ink"
              )}
            >
              <Tag size={12} />
              活动素材
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px]",
                  campaignOnly
                    ? "bg-white/15 text-white"
                    : "bg-white text-muted"
                )}
              >
                {counts.campaign}
              </span>
            </button>
          )}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索内容、场景、标签…"
            aria-label="搜索素材"
            className="field rounded-full py-2 pl-9 pr-8 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={kindFilter}
          onChange={(event) =>
            setKindFilter(event.target.value as "all" | Photo["kind"])
          }
          aria-label="按素材类型筛选"
          className="field w-auto rounded-full py-1.5 text-xs"
        >
          <option value="all">全部类型</option>
          <option value="image">图片</option>
          <option value="video">视频</option>
          <option value="gif">动图</option>
        </select>
        <select
          value={sort}
          onChange={(event) =>
            setSort(event.target.value as "new" | "old" | "quality")
          }
          aria-label="素材排序"
          className="field w-auto rounded-full py-1.5 text-xs"
        >
          <option value="new">最新上传</option>
          <option value="old">最早上传</option>
          <option value="quality">封面潜力</option>
        </select>
        {aiConfigured && mockCount > 0 && (
          <button
            onClick={reanalyzeMock}
            disabled={reanalyzingMock}
            className="btn-secondary btn-sm"
          >
            {reanalyzingMock ? (
              <Spinner size={13} />
            ) : (
              <RefreshCw size={13} />
            )}
            重新识别演示分析 {mockCount} 张
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
          <span className="flex-1">素材加载失败：{error.message}</span>
          <button onClick={() => mutate()} className="btn-secondary btn-sm">
            重试
          </button>
        </div>
      )}

      {analyzing && (
        <div className="mb-4 flex items-center gap-2.5 rounded-2xl border border-brand/20 bg-brand-soft/40 px-4 py-2.5 text-xs text-brand">
          <Spinner size={14} />
          正在逐张识别画面 {analyzing.done}/{analyzing.total}，请稍候…
        </div>
      )}

      <div className="mb-3 flex items-center justify-between text-[11px] text-muted">
        <span>
          {filtered.length} 张
          {search ? ` · 搜索「${search}」` : ""}
        </span>
        {filtered.length > 0 && (
          <button
            onClick={() => {
              if (allVisibleSelected) {
                setSelected((prev) => {
                  const next = new Set(prev);
                  filtered.forEach((image) => next.delete(image.id));
                  return next;
                });
              } else {
                setSelected((prev) => {
                  const next = new Set(prev);
                  filtered.forEach((image) => next.add(image.id));
                  return next;
                });
              }
            }}
            className="flex items-center gap-1 hover:text-ink"
          >
            <CheckSquare size={12} />
            {allVisibleSelected ? "取消全选" : "全选当前"}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="skeleton aspect-square" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {filtered.map((image) => {
            const isSelected = selected.has(image.id);
            return (
              <div
                key={image.id}
                role="button"
                tabIndex={0}
                onClick={() => setActiveId(image.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") setActiveId(image.id);
                }}
                className={cn(
                  "group relative aspect-square cursor-pointer overflow-hidden rounded-2xl border bg-white transition-all",
                  isSelected
                    ? "border-brand ring-2 ring-brand/25"
                    : "border-line hover:-translate-y-0.5 hover:shadow-soft"
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.thumbUrl}
                  alt={image.originalName}
                  loading="lazy"
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/10 opacity-70" />

                {image.kind === "video" && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white shadow-sm backdrop-blur">
                      <Play size={15} fill="currentColor" />
                    </span>
                  </span>
                )}

                <button
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSelect(image.id);
                  }}
                  aria-label={isSelected ? "取消选择" : "选择"}
                  className={cn(
                    "absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border transition",
                    isSelected
                      ? "border-brand bg-brand text-white"
                      : "border-white/70 bg-black/20 text-transparent backdrop-blur hover:bg-black/40"
                  )}
                >
                  <Check size={14} strokeWidth={3} />
                </button>

                <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
                  <StatusBadge status={image.status} variant="overlay" />
                  {image.kind !== "image" && (
                    <span className="rounded-full bg-brand/90 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                      {image.kind === "video"
                        ? `视频${image.duration ? ` · ${Math.round(image.duration)}s` : ""}`
                        : "动图"}
                    </span>
                  )}
                  {!image.analysis && (
                    <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                      待识别
                    </span>
                  )}
                  {image.analysis?.mock && (
                    <span className="rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                      演示分析
                    </span>
                  )}
                  {image.campaign && (
                    <span
                      title={image.campaign}
                      className="max-w-[6rem] truncate rounded-full bg-brand/90 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur"
                    >
                      {image.campaign}
                    </span>
                  )}
                </div>

                <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5">
                  {image.summary ? (
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-white/85">
                      {image.summary}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1 text-[10px] text-white/80">
                      <Sparkles size={10} /> 点击查看详情
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={search ? "没有匹配的图片" : "这里还没有图片"}
          description={
            search
              ? "换个关键词试试，或者清空搜索条件。"
              : "把手机里的照片拖进来，AI 会逐张读懂它们，再帮你变成笔记。"
          }
          action={
            !search && (
              <button
                onClick={() => setUploadOpen(true)}
                className="btn-primary btn-sm"
              >
                <Upload size={14} /> 上传照片
              </button>
            )
          }
          icon={<Images size={20} />}
        />
      )}

      {selected.size > 0 && (
        <div className="fixed bottom-20 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-3xl -translate-x-1/2 lg:bottom-6">
          <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-white/95 p-2.5 shadow-lift backdrop-blur-xl">
            <span className="px-2 text-xs font-medium">
              已选 {selected.size} 张
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <button onClick={analyzeSelected} className="btn-primary btn-sm">
                <Sparkles size={13} /> AI 识别
              </button>
              <button
                onClick={() => bulk("used")}
                className="btn-secondary btn-sm"
              >
                <Check size={13} /> 标记已用
              </button>
              <button
                onClick={() => bulk("unused")}
                className="btn-secondary btn-sm"
              >
                标记未用
              </button>
              {campaignEnabled && (
                <>
                  <button
                    onClick={() => bulk("campaign")}
                    className="btn-secondary btn-sm"
                  >
                    <Tag size={13} /> 加入活动
                  </button>
                  <button
                    onClick={() => bulk("clearCampaign")}
                    className="btn-ghost btn-sm"
                  >
                    移出活动
                  </button>
                </>
              )}
              <button
                onClick={() => bulk("delete")}
                className="btn-ghost btn-sm text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 size={13} /> 删除
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="btn-ghost btn-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <ImageInspector
        image={active}
        open={Boolean(active)}
        onClose={() => setActiveId(null)}
      />

      <GenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        imageIds={selectedIds.length ? selectedIds : undefined}
        onGenerated={() => {
          setSelected(new Set());
        }}
      />
    </div>
  );
}
