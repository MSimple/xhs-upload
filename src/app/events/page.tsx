"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight,
  CalendarDays,
  ClipboardList,
  Megaphone,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { EmptyState, Tabs } from "@/components/ui";
import { EventEditorDialog } from "@/components/event-editor";
import { fetcher } from "@/lib/client";
import {
  eventDateRange,
  eventPhase,
  eventPhaseLabel,
  eventPhaseTone,
} from "@/lib/event-rules";
import { cn } from "@/lib/utils";
import type { Event } from "@/lib/types";

type Filter = "active" | "upcoming" | "ended" | "all";

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "active", label: "进行中" },
  { value: "upcoming", label: "即将开始" },
  { value: "ended", label: "已结束" },
  { value: "all", label: "全部" },
];

export default function EventsPage() {
  const { data, mutate } = useSWR<{ events: Event[]; today: string }>(
    "/api/events",
    fetcher
  );
  const [filter, setFilter] = useState<Filter>("active");
  const [editorOpen, setEditorOpen] = useState(false);

  const events = useMemo(() => data?.events || [], [data]);
  const today = data?.today || "";
  const counts = useMemo(() => {
    return {
      active: events.filter((event) => eventPhase(event, today) === "active")
        .length,
      upcoming: events.filter((event) => eventPhase(event, today) === "upcoming")
        .length,
      ended: events.filter((event) => eventPhase(event, today) === "ended")
        .length,
      all: events.length,
    };
  }, [events, today]);
  const filtered = events.filter(
    (event) => filter === "all" || eventPhase(event, today) === filter
  );

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
            Events
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-[34px]">
            临时活动
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
            Power Day、发布会、群里临时发的任务，都有独立的话题、截止时间和收集表，不影响常驻活动的周上限。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setEditorOpen(true)}
            className="btn-primary"
          >
            <Sparkles size={15} /> 粘贴群公告创建
          </button>
          <button
            onClick={() => setEditorOpen(true)}
            className="btn-secondary"
          >
            <Plus size={15} /> 手动新建
          </button>
        </div>
      </header>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onChange={(value) => setFilter(value as Filter)}
          items={FILTERS.map((item) => ({
            value: item.value,
            label: item.label,
            count: counts[item.value],
          }))}
        />
        <p className="text-[10px] leading-relaxed text-muted">
          活动作品不计入常驻活动周上限；周期内篇数由活动自己控制。
        </p>
      </div>

      {filtered.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filtered.map((event) => (
            <EventCard key={event.id} event={event} today={today} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={filter === "active" ? "当前没有进行中的活动" : "这里还没有活动"}
          description="群里有临时任务时，把公告整段粘贴进来，自动识别日期、话题、篇数和收集表。"
          action={
            <button
              onClick={() => setEditorOpen(true)}
              className="btn-primary btn-sm"
            >
              <Sparkles size={14} /> 粘贴群公告创建
            </button>
          }
          icon={<Megaphone size={20} />}
        />
      )}

      <EventEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={() => void mutate()}
      />
    </div>
  );
}

function EventCard({ event, today }: { event: Event; today: string }) {
  const phase = eventPhase(event, today);
  const tone = eventPhaseTone(event, today);
  const remaining = Math.max(0, event.quota - event.counts.total);
  const used = event.counts.total;

  return (
    <article className="card flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[10px] font-medium",
                tone === "emerald"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : tone === "amber"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-line bg-paper text-muted"
              )}
            >
              {eventPhaseLabel(event, today)}
            </span>
            {event.internal && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                内部活动
              </span>
            )}
            {!event.countsWeekly && (
              <span className="rounded-full border border-line bg-white px-2 py-0.5 text-[10px] text-muted">
                不计周上限
              </span>
            )}
          </div>
          <h2 className="mt-2.5 font-display text-xl font-semibold leading-snug tracking-tight">
            {event.name}
          </h2>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
          <Megaphone size={18} />
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <CalendarDays size={12} /> {eventDateRange(event)}
        </span>
        <span className="flex items-center gap-1">
          <Users size={12} /> 周期内 {event.quota} 篇
        </span>
        <span className="flex items-center gap-1">
          <ClipboardList size={12} /> {event.collectionForm || "未设置收集表"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {event.requiredTopics.map((topic) => (
          <span key={topic} className="chip py-0.5 text-[10px]">
            #{topic}
          </span>
        ))}
        {!event.requiredTopics.length && (
          <span className="text-[10px] text-amber-600">还没有设置活动话题</span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="text-[11px] text-muted">
          已用{" "}
          <span className="font-medium text-ink">
            {used}/{event.quota}
          </span>{" "}
          篇
          {phase === "active" && remaining > 0
            ? ` · 还可以发 ${remaining} 篇`
            : phase === "ended"
            ? " · 已结束"
            : ""}
        </div>
        <Link
          href={`/events/${event.id}`}
          className="btn-secondary btn-sm"
        >
          {phase === "active" && remaining > 0 ? "去创作" : "查看活动"}
          <ArrowRight size={12} />
        </Link>
      </div>
    </article>
  );
}
