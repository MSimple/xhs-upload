"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight,
  CalendarDays,
  ExternalLink,
  Images,
  RefreshCw,
  Rocket,
  Sparkles,
} from "lucide-react";
import {
  EmptyState,
  SectionHeading,
  Spinner,
} from "@/components/ui";
import { PostDetailModal } from "@/components/post-detail";
import { PublishAssistant } from "@/components/publish-assistant";
import { useToast } from "@/components/toast";
import { api, fetcher, refreshAll } from "@/lib/client";
import {
  cn,
  addDays,
  formatCN,
  formatDateTime,
  todayStr,
} from "@/lib/utils";
import type { Post } from "@/lib/types";

function sortQueue(posts: Post[]) {
  return [...posts].sort((a, b) =>
    `${a.scheduledDate || "9999-99-99"}${
      a.scheduledTime || "99:99"
    }`.localeCompare(
      `${b.scheduledDate || "9999-99-99"}${b.scheduledTime || "99:99"}`
    )
  );
}

export default function PublishPage() {
  const toast = useToast();
  const today = todayStr();
  const weekEnd = addDays(today, 7);
  const [postId, setPostId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<string | null>(null);
  const [assistantPost, setAssistantPost] = useState<Post | null>(null);

  const {
    data: postsData,
    isLoading,
    mutate: mutatePosts,
  } = useSWR<{ posts: Post[] }>("/api/posts", fetcher);

  const posts = useMemo(() => postsData?.posts || [], [postsData]);
  const ready = useMemo(
    () => posts.filter((post) => post.status === "ready"),
    [posts]
  );

  const queue = useMemo(
    () => sortQueue(ready),
    [ready]
  );
  const overdue = useMemo(
    () =>
      queue.filter(
        (post) => post.scheduledDate && post.scheduledDate < today
      ),
    [queue, today]
  );
  const todayQueue = useMemo(
    () => queue.filter((post) => post.scheduledDate === today),
    [queue, today]
  );
  const weekQueue = useMemo(
    () =>
      queue.filter(
        (post) =>
          post.scheduledDate &&
          post.scheduledDate > today &&
          post.scheduledDate <= weekEnd
      ),
    [queue, today, weekEnd]
  );
  const published = useMemo(
    () =>
      posts
        .filter((post) => post.status === "published")
        .sort((a, b) =>
          (b.publishedAt || "").localeCompare(a.publishedAt || "")
        ),
    [posts]
  );

  const todayDue = todayQueue.length + overdue.length;
  const weekDue = weekQueue.length + todayDue;



  function openPost(id: string) {
    setPostId(id);
    setDetailOpen(true);
  }

  async function refresh() {
    await Promise.all([mutatePosts(), refreshAll()]);
  }

  async function editLink(post: Post) {
    const url = window.prompt(
      "粘贴小红书笔记链接（留空可清除）",
      post.xhsUrl || ""
    );
    if (url === null) return;
    setEditingLink(post.id);
    try {
      await api(`/api/posts/${post.id}`, {
        method: "PATCH",
        body: JSON.stringify({ xhsUrl: url.trim() || null }),
      });
      await refresh();
      toast(url.trim() ? "笔记链接已更新" : "笔记链接已清除", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "更新链接失败", "error");
    } finally {
      setEditingLink(null);
    }
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
            Publish
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-[34px]">
            发布中心
          </h1>
          <p className="mt-1 text-sm text-muted">
            今天发什么、什么时候发、哪些已经手动发布，都在这一页。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={refresh} className="btn-secondary">
            <RefreshCw size={15} /> 刷新
          </button>
          <Link href="/calendar" className="btn-secondary">
            <CalendarDays size={15} /> 发布日历
          </Link>
        </div>
      </header>


      <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
        <StatusCard
          label="待处理"
          value={`${todayDue}`}
          hint={
            overdue.length
              ? `其中 ${overdue.length} 篇已逾期`
              : `${weekDue} 篇在本周队列`
          }
          tone={todayDue ? "brand" : "stone"}
          icon={<CalendarDays size={15} />}
          href="/calendar"
        />
        <StatusCard
          label="本周待发"
          value={`${weekDue}`}
          hint="按排期手动发布"
          tone={weekDue ? "amber" : "stone"}
          icon={<CalendarDays size={15} />}
          href="/calendar"
        />
        <StatusCard
          label="已发布"
          value={`${published.length}`}
          hint="最近发布的作品"
          tone={published.length ? "emerald" : "stone"}
          icon={<ExternalLink size={15} />}
          href="/posts?status=published"
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="skeleton h-48 rounded-3xl" />
          <div className="skeleton h-48 rounded-3xl" />
        </div>
      ) : (
        <>
          <section className="card p-5 sm:p-6">
            <SectionHeading
              title="今日与逾期"
              subtitle={
                todayDue
                  ? "按计划时间排序，点开作品可以预览、发布或改期"
                  : "今天没有排期，享受一下空档"
              }
              action={
                <Link href="/calendar" className="btn-ghost btn-sm">
                  看日历 <ArrowRight size={13} />
                </Link>
              }
            />
            {todayDue ? (
              <div className="space-y-2">
                {[...overdue, ...todayQueue].map((post) => (
                  <QueueRow
                    key={post.id}
                    post={post}
                    today={today}
                    onOpen={openPost}
                    onStart={setAssistantPost}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="今天没有待发布"
                description="去发布日历给草稿安排一个日期，或者让 AI 策划一批新笔记。"
                action={
                  <Link href="/calendar" className="btn-secondary btn-sm">
                    <CalendarDays size={14} /> 去排期
                  </Link>
                }
                icon={<CalendarDays size={20} />}
              />
            )}
          </section>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <section className="card p-5 sm:p-6">
              <SectionHeading
                title="本周排期"
                subtitle="未来 7 天的待发布队列"
                action={
                  <Link href="/calendar" className="btn-ghost btn-sm">
                    全部 <ArrowRight size={13} />
                  </Link>
                }
              />
              {weekQueue.length ? (
                <div className="space-y-2">
                  {weekQueue.map((post) => (
                    <QueueRow
                      key={post.id}
                      post={post}
                      today={today}
                      onOpen={openPost}
                      onStart={setAssistantPost}
                    />
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
                  未来 7 天还没有排期
                </p>
              )}
            </section>

            <section className="card p-5 sm:p-6">
              <SectionHeading
                title="最近发布"
                subtitle="已发布作品与小红书链接"
                action={
                  <Link href="/posts?status=published" className="btn-ghost btn-sm">
                    作品库 <ArrowRight size={13} />
                  </Link>
                }
              />
              {published.length ? (
                <div className="space-y-2">
                  {published.slice(0, 6).map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center gap-3 rounded-2xl border border-line bg-white p-2.5"
                    >
                      <Cover post={post} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {post.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {post.publishedAt
                            ? formatDateTime(post.publishedAt)
                            : post.publishedDate || "已发布"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {post.xhsUrl ? (
                          <a
                            href={post.xhsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-[10px] font-medium text-brand hover:underline"
                          >
                            打开 <ExternalLink size={11} />
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted">无链接</span>
                        )}
                        <button
                          type="button"
                          onClick={() => editLink(post)}
                          disabled={editingLink === post.id}
                          title="编辑小红书笔记链接"
                          className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted transition hover:border-brand/30 hover:text-brand disabled:opacity-40"
                        >
                          {editingLink === post.id ? (
                            <Spinner size={10} />
                          ) : post.xhsUrl ? (
                            "改链接"
                          ) : (
                            "填链接"
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
                  还没有已发布作品
                </p>
              )}
            </section>
          </div>
        </>
      )}

      <div className="flex items-start gap-2 rounded-2xl border border-line bg-white/60 px-4 py-3 text-[10px] leading-relaxed text-muted">
        <Sparkles size={13} className="mt-0.5 shrink-0 text-brand" />
        <p>
          发布中心只负责排期和手动发布进度。写文案、挑封面请回作品库；发布完成后在作品里标记「已手动发布」。
        </p>
      </div>

      <PostDetailModal
        postId={postId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <PublishAssistant
        post={assistantPost}
        open={Boolean(assistantPost)}
        onClose={() => setAssistantPost(null)}
        onMarked={refresh}
      />
    </div>
  );
}

function StatusCard({
  label,
  value,
  hint,
  tone,
  icon,
  href,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "brand" | "emerald" | "amber" | "red" | "stone";
  icon: React.ReactNode;
  href?: string;
}) {
  const toneClass = {
    brand: "border-brand/15 bg-brand-soft/45 text-brand",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
    amber: "border-amber-200 bg-amber-50/60 text-amber-700",
    red: "border-red-200 bg-red-50/60 text-red-600",
    stone: "border-line bg-white text-muted",
  }[tone];
  const body = (
    <div className={cn("h-full rounded-3xl border p-4 shadow-soft", toneClass)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs">{label}</p>
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/70">
          {icon}
        </span>
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
        {value}
      </p>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed opacity-80">
        {hint}
      </p>
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

function QueueRow({
  post,
  today,
  onOpen,
  onStart,
}: {
  post: Post;
  today: string;
  onOpen: (id: string) => void;
  onStart: (post: Post) => void;
}) {
  const overdue = Boolean(post.scheduledDate && post.scheduledDate < today);
  const isToday = post.scheduledDate === today;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(post.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen(post.id);
      }}
      className={cn(
        "group flex w-full flex-col gap-2 rounded-2xl border p-2.5 text-left transition hover:border-brand/25 hover:bg-paper/40 sm:flex-row sm:items-center",
        overdue
          ? "border-red-100 bg-red-50/30"
          : isToday
          ? "border-brand/15 bg-brand-soft/25"
          : "border-line bg-white"
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Cover post={post} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{post.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted">
            <span>
              {post.scheduledDate
                ? `${formatCN(post.scheduledDate)} ${post.scheduledTime || "时间待定"}`
                : "未排期"}
            </span>
            <span>· {post.images.length} 图</span>
            {post.eventName && <span>· {post.eventName}</span>}
            {post.campaign && <span>· {post.campaign}</span>}
          </p>
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-2 sm:justify-end"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px]",
            overdue
              ? "bg-red-100 text-red-600"
              : isToday
              ? "bg-brand-soft text-brand"
              : "bg-paper text-muted"
          )}
        >
          {overdue ? "已逾期" : isToday ? "今天" : "待发"}
        </span>
        <button
          type="button"
          onClick={() => onStart(post)}
          className="flex h-8 items-center gap-1.5 rounded-full bg-brand px-3.5 text-[11px] font-medium text-white transition hover:bg-brand/90"
        >
          <Rocket size={12} />
          开始发布
        </button>
      </div>
    </div>
  );
}

function Cover({ post }: { post: Post }) {
  return (
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
          <Images size={16} />
        </span>
      )}
    </div>
  );
}
