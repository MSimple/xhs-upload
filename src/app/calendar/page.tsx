"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  Send,
  Sparkles,
  Undo2,
} from "lucide-react";
import { GenerateDialog } from "@/components/generate-dialog";
import { PostDetailModal } from "@/components/post-detail";
import { fetcher, refreshAll } from "@/lib/client";
import {
  cn,
  colorForStatus,
  monthLabel,
  monthMatrix,
  shiftMonth,
  todayStr,
  toDateStr,
  WEEKDAYS,
} from "@/lib/utils";
import type { Post } from "@/lib/types";

function postDay(post: Post) {
  if (post.status === "published") {
    return (
      post.publishedDate ||
      (post.publishedAt ? toDateStr(new Date(post.publishedAt)) : "")
    );
  }
  return post.scheduledDate || "";
}

export default function CalendarPage() {
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [postId, setPostId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateStart, setGenerateStart] = useState<string | undefined>();
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false);

  const { data } = useSWR<{ posts: Post[] }>(
    `/api/calendar?month=${month}`,
    fetcher
  );
  const { data: allData } = useSWR<{ posts: Post[] }>("/api/posts", fetcher);
  const posts = useMemo(() => data?.posts || [], [data]);
  const allPosts = useMemo(() => allData?.posts || [], [allData]);

  const dated = useMemo(
    () =>
      posts.filter((post) => Boolean(post.scheduledDate || post.publishedAt)),
    [posts]
  );

  const byDate = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const post of dated) {
      const day = postDay(post);
      if (!day) continue;
      const list = map.get(day) || [];
      list.push(post);
      map.set(day, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.scheduledTime || "").localeCompare(b.scheduledTime || ""));
    }
    return map;
  }, [dated]);

  const monthStats = useMemo(() => {
    const published = dated.filter((post) => post.status === "published").length;
    const planned = dated.filter((post) => post.status !== "published").length;
    return { published, planned };
  }, [dated]);

  const unscheduled = useMemo(
    () =>
      allPosts.filter(
        (post) => post.status !== "published" && !post.scheduledDate
      ),
    [allPosts]
  );

  const cells = useMemo(() => monthMatrix(month), [month]);
  const today = todayStr();

  function openPost(id: string) {
    setPostId(id);
    setDetailOpen(true);
  }

  function openGenerate(date?: string) {
    setGenerateStart(date);
    setGenerateOpen(true);
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
            Calendar
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-[34px]">
            发布日历
          </h1>
          <p className="mt-1 text-sm text-muted">
            哪一天发了、哪一天待发，一眼看清。
          </p>
        </div>
        <button onClick={() => openGenerate()} className="btn-primary">
          <Sparkles size={15} /> AI 策划并排期
        </button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonth((prev) => shiftMonth(prev, -1))}
            className="rounded-full border border-line bg-white p-2 text-muted transition hover:text-ink"
            aria-label="上个月"
          >
            <ChevronLeft size={16} />
          </button>
          <h2 className="min-w-[132px] text-center font-display text-lg font-semibold tracking-tight">
            {monthLabel(month)}
          </h2>
          <button
            onClick={() => setMonth((prev) => shiftMonth(prev, 1))}
            className="rounded-full border border-line bg-white p-2 text-muted transition hover:text-ink"
            aria-label="下个月"
          >
            <ChevronRight size={16} />
          </button>
          {month !== today.slice(0, 7) && (
            <button
              onClick={() => setMonth(today.slice(0, 7))}
              className="ml-1 flex items-center gap-1 rounded-full border border-line bg-white px-3 py-1.5 text-[11px] text-muted transition hover:text-ink"
            >
              <Undo2 size={11} /> 回到本月
            </button>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
            本月已发布 {monthStats.published}
          </span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
            计划待发 {monthStats.planned}
          </span>
          {unscheduled.length > 0 && (
            <span className="rounded-full border border-line bg-white px-2.5 py-1 text-muted">
              待排期 {unscheduled.length}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
      <div className="overflow-hidden rounded-3xl border border-line bg-white shadow-soft">
        <div className="grid grid-cols-7 border-b border-line bg-paper/60">
          {WEEKDAYS.map((day) => (
            <div
              key={day}
              className="py-2.5 text-center text-[10px] font-medium tracking-wider text-muted"
            >
              周{day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {cells.map(({ date, inMonth }) => {
            const dayPosts = byDate.get(date) || [];
            const isToday = date === today;
            const dayNumber = Number(date.slice(8));
            return (
              <div
                key={date}
                className={cn(
                  "relative min-h-[76px] min-w-0 border-b border-r border-line/70 p-1.5 sm:min-h-[116px] sm:p-2",
                  !inMonth && "bg-paper/35",
                  isToday && inMonth && "bg-brand-soft/25"
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium",
                      isToday && inMonth
                        ? "bg-brand text-white"
                        : inMonth
                        ? "text-ink"
                        : "text-muted/40"
                    )}
                  >
                    {dayNumber}
                  </span>
                  {inMonth && (
                    <button
                      onClick={() => openGenerate(date)}
                      title="从这天开始排期"
                      aria-label={`从 ${date} 开始排期`}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-muted/50 transition hover:bg-paper hover:text-brand"
                    >
                      <Plus size={12} />
                    </button>
                  )}
                </div>

                <div className="mt-1.5 space-y-1">
                  {dayPosts.slice(0, 2).map((post) => (
                    <button
                      key={post.id}
                      onClick={() => openPost(post.id)}
                      className={cn(
                        "hidden w-full items-center gap-1.5 rounded-lg border px-1.5 py-1 text-left transition hover:shadow-sm sm:flex",
                        post.status === "published"
                          ? "border-emerald-100 bg-emerald-50/70"
                          : post.status === "ready"
                          ? "border-amber-100 bg-amber-50/70"
                          : "border-line bg-white"
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          colorForStatus(post.status)
                        )}
                      />
                      <span className="truncate text-[10px] leading-tight text-ink/80">
                        {post.title}
                      </span>
                    </button>
                  ))}
                  {dayPosts.length > 2 && (
                    <p className="hidden pl-1 text-[9px] text-muted sm:block">
                      +{dayPosts.length - 2} 篇
                    </p>
                  )}

                  {dayPosts.length > 0 && (
                    <div className="flex flex-wrap gap-1 px-0.5 sm:hidden">
                      {dayPosts.slice(0, 5).map((post) => (
                        <button
                          key={post.id}
                          onClick={() => openPost(post.id)}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            colorForStatus(post.status)
                          )}
                          aria-label={post.title}
                        />
                      ))}
                      {dayPosts.length > 5 && (
                        <span className="text-[8px] leading-none text-muted">
                          +{dayPosts.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-stone-400" /> 草稿
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-500" /> 待发布
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> 已发布
        </span>
        <span className="ml-auto text-[10px]">
          点日期格右上角「+」可从该天开始排期
        </span>
      </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="section-title text-base">本月概览</h2>
              <span className="chip">{monthLabel(month)}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-paper/70 px-2 py-2">
                <p className="font-display text-lg font-semibold">
                  {monthStats.published}
                </p>
                <p className="text-[10px] text-muted">已发布</p>
              </div>
              <div className="rounded-xl bg-paper/70 px-2 py-2">
                <p className="font-display text-lg font-semibold">
                  {monthStats.planned}
                </p>
                <p className="text-[10px] text-muted">待发布</p>
              </div>
              <div className="rounded-xl bg-paper/70 px-2 py-2">
                <p className="font-display text-lg font-semibold">
                  {unscheduled.length}
                </p>
                <p className="text-[10px] text-muted">待排期</p>
              </div>
            </div>
            <Link href="/publish" className="btn-primary btn-sm mt-4 w-full">
              <Send size={13} /> 打开发布中心
            </Link>
          </section>

      {unscheduled.length > 0 && (
        <section className="mt-0">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="section-title text-base">待排期草稿</h2>
            <span className="text-[11px] text-muted">
              给它们安排一个日子吧
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            {unscheduled
              .slice(0, showAllUnscheduled ? unscheduled.length : 9)
              .map((post) => (
              <button
                key={post.id}
                onClick={() => openPost(post.id)}
                className="card flex items-center gap-3 p-3 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-paper">
                  {post.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.cover.thumbUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted">
                      <CalendarDays size={16} />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{post.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    {post.status === "ready" ? "待发布" : "草稿"} ·{" "}
                    {post.images.length} 张图
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-brand">去排期</span>
              </button>
            ))}
          </div>
          {unscheduled.length > 9 && (
            <button
              onClick={() => setShowAllUnscheduled((prev) => !prev)}
              className="btn-secondary btn-sm mt-3 w-full"
            >
              {showAllUnscheduled
                ? "收起"
                : `查看全部 ${unscheduled.length} 篇待排期`}
            </button>
          )}
        </section>
      )}
        </aside>
      </div>

      <section className="mt-7 sm:hidden">
        <h2 className="mb-3 section-title">本月作品</h2>
        {dated.length ? (
          <div className="space-y-2">
            {[...dated]
              .sort((a, b) => postDay(a).localeCompare(postDay(b)))
              .map((post) => (
                <button
                  key={post.id}
                  onClick={() => openPost(post.id)}
                  className="card flex w-full items-center gap-3 p-3 text-left"
                >
                  <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-paper text-[10px]">
                    <span className="text-sm font-semibold leading-none">
                      {postDay(post).slice(8)}
                    </span>
                    <span className="mt-0.5 text-[8px] text-muted">
                      {postDay(post).slice(5, 7)}月
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{post.title}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {post.status === "published" ? "已发布" : "计划发布"} ·{" "}
                      {post.scheduledTime || "时间待定"}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      colorForStatus(post.status)
                    )}
                  />
                </button>
              ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line py-8 text-center text-xs text-muted">
            本月还没有排期，点右上角「AI 策划并排期」开始吧
          </p>
        )}
      </section>

      <PostDetailModal
        postId={postId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <GenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        startDate={generateStart}
        onGenerated={async (created) => {
          await refreshAll();
          if (created[0]?.scheduledDate) {
            setMonth(created[0].scheduledDate.slice(0, 7));
          }
        }}
      />
    </div>
  );
}
