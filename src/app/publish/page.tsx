"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Clock,
  ExternalLink,
  Images,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
} from "lucide-react";
import {
  EmptyState,
  SectionHeading,
  StatusBadge,
} from "@/components/ui";
import { PostDetailModal } from "@/components/post-detail";
import { fetcher, refreshAll } from "@/lib/client";
import { cn, addDays, formatCN, formatDateTime, todayStr } from "@/lib/utils";
import type { Post, Settings as StudioSettings } from "@/lib/types";

type XhsStatus = {
  loggedIn: boolean | null;
  loginInProgress: boolean;
  publishing: boolean;
  syncing: boolean;
  profileExists: boolean;
};

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
  const today = todayStr();
  const weekEnd = addDays(today, 7);
  const [postId, setPostId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const {
    data: postsData,
    isLoading,
    mutate: mutatePosts,
  } = useSWR<{ posts: Post[] }>("/api/posts", fetcher);
  const { data: settingsData } = useSWR<{ settings: StudioSettings }>(
    "/api/settings",
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: xhs } = useSWR<XhsStatus>("/api/xhs/status", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 5000,
  });

  const posts = useMemo(() => postsData?.posts || [], [postsData]);
  const ready = useMemo(
    () => posts.filter((post) => post.status === "ready"),
    [posts]
  );
  const failed = useMemo(
    () => sortQueue(ready.filter((post) => Boolean(post.publishError))),
    [ready]
  );
  const queue = useMemo(
    () => sortQueue(ready.filter((post) => !post.publishError)),
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

  const autoOn = settingsData?.settings?.xhs_scheduler === "1";
  const todayDue = todayQueue.length + overdue.length;
  const weekDue = weekQueue.length + todayDue;

  const xhsLabel = xhs?.publishing
    ? "正在发布"
    : xhs?.loginInProgress
    ? "等待登录"
    : xhs?.loggedIn === true
    ? "已连接"
    : xhs?.loggedIn === false
    ? "登录已失效"
    : xhs?.profileExists
    ? "登录待检测"
    : "未登录";
  const xhsOk = xhs?.loggedIn === true;
  const xhsUnknown = xhs?.loggedIn == null && xhs?.profileExists;
  const xhsNeedsLogin = xhs?.loggedIn === false || (Boolean(xhs) && !xhs?.profileExists);

  function openPost(id: string) {
    setPostId(id);
    setDetailOpen(true);
  }

  async function refresh() {
    await Promise.all([mutatePosts(), refreshAll()]);
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
            今天发什么、哪些失败了、账号和自动发布是否正常，都在这一页。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={refresh} className="btn-secondary">
            <RefreshCw size={15} /> 刷新
          </button>
          <Link href="/calendar" className="btn-secondary">
            <CalendarDays size={15} /> 发布日历
          </Link>
          <Link href="/settings" className="btn-primary">
            <Settings size={15} /> 发布设置
          </Link>
        </div>
      </header>

      {(xhsNeedsLogin || xhsUnknown) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 sm:flex-row sm:items-center">
          <AlertTriangle size={16} className="shrink-0 text-amber-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">
              {xhsUnknown
                ? "小红书登录状态待检测"
                : `小红书当前状态：${xhsLabel}`}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800/80">
              {xhsUnknown
                ? "本机已有登录记录。到设置页点「检测状态」确认是否仍然有效；自动发布前也会重新校验。"
                : "自动发布需要先登录小红书，并保持服务进程运行。登录后回到这里刷新即可。"}
            </p>
          </div>
          <Link
            href="/settings"
            className="shrink-0 rounded-full bg-amber-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-amber-950"
          >
            {xhsUnknown ? "去检测" : "去登录"}
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatusCard
          label="小红书"
          value={xhsLabel}
          hint={
            xhsOk
              ? "可以自动发布"
              : xhsUnknown
              ? "到设置里检测登录状态"
              : "需要到设置里登录"
          }
          tone={xhsOk ? "emerald" : "amber"}
          icon={<Send size={15} />}
          href="/settings"
        />
        <StatusCard
          label="到点自动发布"
          value={autoOn ? "已开启" : "已关闭"}
          hint={autoOn ? "调度器每分钟检查一次" : "只保留手动发布"}
          tone={autoOn ? "emerald" : "stone"}
          icon={<Clock size={15} />}
          href="/settings"
        />
        <StatusCard
          label="今日待发"
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
          label="发布失败"
          value={`${failed.length}`}
          hint={failed.length ? "需要人工核对或重试" : "没有失败记录"}
          tone={failed.length ? "red" : "emerald"}
          icon={<AlertTriangle size={15} />}
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

          {failed.length > 0 && (
            <section className="card border-red-200 p-5 sm:p-6">
              <SectionHeading
                title="发布失败"
                subtitle="先看错误和截图，确认没有重复发布后再重试"
                action={
                  <span className="chip border-red-200 text-red-600">
                    {failed.length} 篇
                  </span>
                }
              />
              <div className="space-y-2.5">
                {failed.map((post) => (
                  <div
                    key={post.id}
                    className="rounded-2xl border border-red-100 bg-red-50/40 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {post.title}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {post.scheduledDate
                            ? `${formatCN(post.scheduledDate)} ${
                                post.scheduledTime || ""
                              }`
                            : "未排期"}{" "}
                          · 已尝试 {post.publishAttemptCount || 0} 次
                        </p>
                        {post.eventName && (
                          <p className="mt-0.5 text-[10px] text-amber-700">
                            活动：{post.eventName}
                          </p>
                        )}
                      </div>
                      <StatusBadge status={post.status} />
                    </div>
                    <p className="mt-2 line-clamp-3 break-words text-[11px] leading-relaxed text-red-600">
                      {post.publishError}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => openPost(post.id)}
                        className="btn-secondary btn-sm"
                      >
                        打开作品处理
                      </button>
                      <a
                        href={`/api/posts/${post.id}/screenshot`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-ghost btn-sm"
                      >
                        查看失败截图 <ExternalLink size={11} />
                      </a>
                      {post.publishAttemptCount >= 3 && (
                        <span className="text-[10px] text-red-500">
                          自动重试已达上限，请人工确认后再发
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

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
                      {post.xhsUrl ? (
                        <a
                          href={post.xhsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-brand hover:underline"
                        >
                          打开 <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="text-[10px] text-muted">无链接</span>
                      )}
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
          发布中心只负责“今天发什么、失败了怎么处理”。写文案、挑封面请回作品库；排期请去发布日历；账号和模型配置在设置页。
        </p>
      </div>

      <PostDetailModal
        postId={postId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
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
}: {
  post: Post;
  today: string;
  onOpen: (id: string) => void;
}) {
  const overdue = Boolean(post.scheduledDate && post.scheduledDate < today);
  const isToday = post.scheduledDate === today;
  return (
    <button
      onClick={() => onOpen(post.id)}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition hover:border-brand/25 hover:bg-paper/40",
        overdue
          ? "border-red-100 bg-red-50/30"
          : isToday
          ? "border-brand/15 bg-brand-soft/25"
          : "border-line bg-white"
      )}
    >
      <Cover post={post} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{post.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted">
          <span>
            {post.scheduledDate
              ? `${formatCN(post.scheduledDate)} ${
                  post.scheduledTime || "时间待定"
                }`
              : "未排期"}
          </span>
          <span>· {post.images.length} 图</span>
          {post.eventName && <span>· {post.eventName}</span>}
          {post.campaign && <span>· {post.campaign}</span>}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px]",
          overdue
            ? "bg-red-100 text-red-600"
            : isToday
            ? "bg-brand-soft text-brand"
            : "bg-paper text-muted"
        )}
      >
        {overdue ? "已逾期" : isToday ? "今天" : "待发"}
      </span>
      <ArrowRight
        size={14}
        className="shrink-0 text-muted/40 transition group-hover:text-ink"
      />
    </button>
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
