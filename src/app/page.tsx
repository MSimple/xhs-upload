"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Images,
  Send,
  Sparkles,
  Megaphone,
  Clock,
  Wand2,
} from "lucide-react";
import { UploadZone } from "@/components/upload-zone";
import { GenerateDialog } from "@/components/generate-dialog";
import { PostDetailModal } from "@/components/post-detail";
import { EmptyState, SectionHeading, StatusBadge } from "@/components/ui";
import { fetcher } from "@/lib/client";
import { cn, formatCN, greeting } from "@/lib/utils";
import type { Event, Photo, Post } from "@/lib/types";
import { eventDateRange } from "@/lib/event-rules";

type Stats = {
  images: {
    total: number;
    unused: number;
    reserved: number;
    used: number;
    analyzed: number;
    unanalyzed: number;
  };
  posts: {
    total: number;
    draft: number;
    ready: number;
    published: number;
    publishedThisMonth: number;
    dueToday: number;
    overdue: number;
    unscheduled: number;
  };
  upcoming: Post[];
  recent: Post[];
};

export default function DashboardPage() {
  const router = useRouter();
  const { data: stats } = useSWR<Stats>("/api/stats", fetcher);
  const { data: settings } = useSWR<{ configured: boolean }>(
    "/api/settings",
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: pending } = useSWR<{ images: Photo[] }>(
    "/api/images?status=pending",
    fetcher
  );
  const { data: eventsData } = useSWR<{ events: Event[] }>(
    "/api/events?status=active",
    fetcher,
    { revalidateOnFocus: false }
  );

  const [hello, setHello] = useState("你好");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => setHello(greeting()), []);

  function openPost(id: string) {
    setPostId(id);
    setDetailOpen(true);
  }

  const unused = stats?.images.unused ?? 0;
  const activeEvents = eventsData?.events || [];

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-line bg-white p-6 shadow-soft sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand-soft/80 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-28 right-32 h-56 w-56 rounded-full bg-amber-100/60 blur-3xl" />
        <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              灵感工作台
            </p>
            <h1 className="mt-3 font-display text-[30px] leading-[1.15] tracking-tight sm:text-[40px]">
              {hello}，
              <br className="hidden sm:block" />
              把相册里的生活变成一篇篇笔记。
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
              上传照片，AI 读懂每一张画面，自动分组、写文案、挑封面、排日期。
              用过的图片会被温柔收好，下次不再重复。
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <button
                onClick={() =>
                  document
                    .getElementById("quick-upload")
                    ?.scrollIntoView({ behavior: "smooth", block: "center" })
                }
                className="btn-primary"
              >
                <Images size={16} /> 上传照片
              </button>
              <button
                onClick={() => setGenerateOpen(true)}
                className="btn-secondary"
              >
                <Wand2 size={16} /> AI 智能策划
              </button>
              <Link
                href="/calendar"
                className="btn-ghost hidden text-xs sm:inline-flex"
              >
                去发布中心 <Send size={13} />
              </Link>
            </div>
          </div>

          {!!stats?.recent.length && (
            <div className="hidden shrink-0 items-end gap-3 xl:flex">
              {stats.recent.slice(0, 3).map((post, index) => (
                <button
                  key={post.id}
                  onClick={() => openPost(post.id)}
                  className={cn(
                    "group relative h-36 w-28 overflow-hidden rounded-2xl border-2 border-white shadow-soft transition hover:-translate-y-1.5",
                    index === 0 && "h-44 w-32 -rotate-3",
                    index === 1 && "rotate-1",
                    index === 2 && "h-36 rotate-3"
                  )}
                >
                  {post.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post.cover.thumbUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center bg-paper text-muted">
                      <Images size={20} />
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-left text-[10px] leading-tight text-white">
                    {post.title}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {settings && !settings.configured && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 sm:flex-row sm:items-center">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Sparkles size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">当前是演示模式</p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-800/80">
              还没有配置图片理解模型，识别和文案会使用示例数据。配置后 AI
              才能真正读懂你的照片。
            </p>
          </div>
          <Link
            href="/settings"
            className="shrink-0 rounded-full bg-amber-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-amber-950"
          >
            去配置模型
          </Link>
        </div>
      )}


      <section className="card p-5 sm:p-6">
        <SectionHeading
          title="今日待办"
          subtitle="从素材到发布，先处理会卡住流程的事情"
          action={
            <Link href="/publish" className="btn-ghost btn-sm">
              发布中心 <ArrowUpRight size={13} />
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          <TaskCard
            label="待识别素材"
            value={stats?.images.unanalyzed ?? 0}
            hint="上传后还没经过 AI 识别"
            tone={(stats?.images.unanalyzed ?? 0) > 0 ? "brand" : "stone"}
            icon={<Sparkles size={15} />}
            href="/library"
          />
          <TaskCard
            label="待排期草稿"
            value={stats?.posts.unscheduled ?? 0}
            hint="有内容但还没安排日期"
            tone={(stats?.posts.unscheduled ?? 0) > 0 ? "amber" : "stone"}
            icon={<CalendarDays size={15} />}
            href="/calendar"
          />
          <TaskCard
            label="待处理"
            value={(stats?.posts.dueToday ?? 0) + (stats?.posts.overdue ?? 0)}
            hint={
              stats?.posts.overdue
                ? `今天 ${stats.posts.dueToday} 篇 · 逾期 ${stats.posts.overdue} 篇`
                : "按排期手动发布"
            }
            tone={
              (stats?.posts.dueToday ?? 0) + (stats?.posts.overdue ?? 0) > 0
                ? "brand"
                : "stone"
            }
            icon={<Clock size={15} />}
            href="/publish"
          />
        </div>

        <div className="mt-5 rounded-2xl border border-line bg-paper/40 p-3.5 sm:p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              创作流水线
            </p>
            <span className="text-[10px] text-muted">
              素材 → 识别 → 作品 → 发布
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PipelineStep label="素材" value={stats?.images.total ?? 0} hint="张" />
            <PipelineStep label="已识别" value={stats?.images.analyzed ?? 0} hint="张" />
            <PipelineStep label="作品" value={stats?.posts.total ?? 0} hint="篇" />
            <PipelineStep label="已发布" value={stats?.posts.published ?? 0} hint="篇" />
          </div>
        </div>
      </section>

      {activeEvents.length > 0 && (
        <section className="card p-5 sm:p-6">
          <SectionHeading
            title="进行中的活动"
            subtitle="临时活动有独立话题、截止时间和收集表，不占常驻活动周上限"
            action={
              <Link href="/events" className="btn-ghost btn-sm">
                全部活动 <ArrowUpRight size={13} />
              </Link>
            }
          />
          <div
            className={cn(
              "grid grid-cols-1 gap-3",
              activeEvents.length > 1 && "sm:grid-cols-2"
            )}
          >
            {activeEvents.slice(0, 4).map((event) => {
              const remaining = Math.max(0, event.quota - event.counts.total);
              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className="group rounded-2xl border border-line bg-white p-4 transition hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-soft"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-soft text-brand">
                          <Megaphone size={12} />
                        </span>
                        {event.internal && (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] text-amber-700">
                            内部活动
                          </span>
                        )}
                      </div>
                      <p className="mt-2 truncate text-sm font-medium">
                        {event.name}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted">
                      {remaining > 0 ? `还可发 ${remaining} 篇` : "篇数已用完"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted">
                    <span className="flex items-center gap-1">
                      <CalendarDays size={11} /> {eventDateRange(event)}
                    </span>
                    {event.collectionForm && (
                      <span>· {event.collectionForm}</span>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {event.requiredTopics.slice(0, 4).map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full bg-paper px-2 py-0.5 text-[9px] text-muted"
                      >
                        #{topic}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.18fr_1fr]">
        <section
          id="quick-upload"
          className="card p-5 sm:p-6"
        >
          <SectionHeading
            title="快速上传"
            subtitle="可以一次拖入很多张，AI 会逐张阅读"
            action={
              <Link href="/library" className="btn-ghost btn-sm">
                前往素材库 <ArrowUpRight size={13} />
              </Link>
            }
          />
          <UploadZone />

          {!!pending?.images.length && (
            <div className="mt-5 rounded-2xl border border-line bg-paper/50 p-3.5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  还有{" "}
                  <span className="font-semibold text-ink">
                    {pending.images.length}
                  </span>{" "}
                  张图片等待 AI 识别
                </p>
                <Link
                  href="/library"
                  className="text-xs font-medium text-brand hover:underline"
                >
                  去识别
                </Link>
              </div>
              <div className="mt-2.5 flex gap-2">
                {pending.images.slice(0, 7).map((image) => (
                  <div
                    key={image.id}
                    className="h-12 w-12 overflow-hidden rounded-xl border border-line bg-white"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.thumbUrl}
                      alt=""
                      className="h-full w-full object-cover opacity-80"
                    />
                  </div>
                ))}
                {pending.images.length > 7 && (
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-dashed border-line text-[10px] text-muted">
                    +{pending.images.length - 7}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="relative overflow-hidden rounded-3xl bg-ink p-6 text-white shadow-soft sm:p-7">
          <div className="pointer-events-none absolute -right-14 -top-16 h-52 w-52 rounded-full bg-brand/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="relative flex h-full flex-col">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-white/50">
              <Sparkles size={12} className="text-brand-soft" />
              AI Planner
            </div>
            <h2 className="mt-3 font-display text-2xl leading-snug tracking-tight sm:text-[28px]">
              {unused > 0 ? `让 ${unused} 张好图，` : "让相册里的好图，"}
              <br />
              自动长成一期笔记。
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-white/55">
              AI 会按场景和情绪分组，挑选封面、安排图片顺序，写出标题、正文和标签，
              并按你的节奏排进日历。
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3">
                <p className="text-xl font-semibold">{unused}</p>
                <p className="mt-0.5 text-[10px] text-white/50">
                  可用未使用素材
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-3">
                <p className="text-xl font-semibold">
                  {stats?.posts.draft ?? 0}
                </p>
                <p className="mt-0.5 text-[10px] text-white/50">待完善草稿</p>
              </div>
            </div>

            <button
              onClick={() => setGenerateOpen(true)}
              className="mt-5 flex w-full items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-sm font-medium text-ink transition hover:bg-brand-soft"
            >
              <span className="flex items-center gap-2">
                <Wand2 size={16} className="text-brand" /> 开始智能策划
              </span>
              <ArrowUpRight size={16} />
            </button>

            <div className="mt-auto flex items-center gap-3 pt-5 text-[10px] text-white/40">
              <span className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-white/40" /> 自动分组
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-white/40" /> 智能选封面
              </span>
              <span className="flex items-center gap-1">
                <span className="h-1 w-1 rounded-full bg-white/40" /> 排期去重
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <SectionHeading
            title="最近作品"
            subtitle="从草稿到发布，都在这里"
            action={
              <Link href="/posts" className="btn-ghost btn-sm">
                全部作品 <ArrowRight size={13} />
              </Link>
            }
          />
          {stats?.recent.length ? (
            <div className="space-y-1">
              {stats.recent.map((post) => (
                <button
                  key={post.id}
                  onClick={() => openPost(post.id)}
                  className="group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-paper"
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
                        <Images size={16} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{post.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {post.images.length} 张图 ·{" "}
                      {post.scheduledDate
                        ? formatCN(post.scheduledDate)
                        : "未排期"}
                    </p>
                  </div>
                  <StatusBadge status={post.status} dot={false} />
                  <ArrowUpRight
                    size={14}
                    className="shrink-0 text-muted/40 transition group-hover:text-ink"
                  />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              title="还没有作品"
              description="上传照片后让 AI 策划第一批笔记，草稿会出现在这里。"
              action={
                <button
                  onClick={() => setGenerateOpen(true)}
                  className="btn-primary btn-sm"
                >
                  <Sparkles size={14} /> AI 策划第一篇
                </button>
              }
            />
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <SectionHeading
            title="即将发布"
            subtitle="已排期但还没标记发布的作品"
            action={
              <div className="flex items-center gap-1">
                <Link href="/calendar" className="btn-ghost btn-sm">
                  日历 <ArrowRight size={13} />
                </Link>
                <Link href="/publish" className="btn-ghost btn-sm">
                  发布中心 <ArrowRight size={13} />
                </Link>
              </div>
            }
          />
          {stats?.upcoming.length ? (
            <div className="relative space-y-1">
              {stats.upcoming.map((post) => (
                <button
                  key={post.id}
                  onClick={() => openPost(post.id)}
                  className="group flex w-full items-center gap-3 rounded-2xl p-2 text-left transition hover:bg-paper"
                >
                  <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-paper/60">
                    <span className="text-[14px] font-semibold leading-none">
                      {post.scheduledDate?.slice(8)}
                    </span>
                    <span className="mt-1 text-[9px] leading-none text-muted">
                      {post.scheduledDate?.slice(5, 7)} 月
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{post.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {post.scheduledTime || "时间待定"} ·{" "}
                      {post.images.length} 张图
                    </p>
                  </div>
                  <StatusBadge status={post.status} dot={false} />
                </button>
              ))}
              <div className="flex items-center gap-1.5 px-2 pt-2 text-[10px] text-muted">
                <Send size={11} /> 按排期手动发布，或去发布中心查看队列
              </div>
            </div>
          ) : (
            <EmptyState
              title="日历还空着"
              description="AI 策划时会按每天一篇的节奏自动排期，也可以手动改日期。"
              action={
                <Link href="/calendar" className="btn-secondary btn-sm">
                  查看日历
                </Link>
              }
              icon={<CalendarDays size={20} />}
            />
          )}
        </section>
      </div>

      <GenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={(posts) => {
          if (posts[0]) router.push("/posts");
        }}
      />
      <PostDetailModal
        postId={postId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}

function TaskCard({
  label,
  value,
  hint,
  icon,
  href,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
  href: string;
  tone: "brand" | "amber" | "red" | "emerald" | "stone";
}) {
  const styles = {
    brand: "border-brand/20 bg-brand-soft/45 text-brand",
    amber: "border-amber-200 bg-amber-50/70 text-amber-700",
    red: "border-red-200 bg-red-50/70 text-red-600",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-700",
    stone: "border-line bg-white text-muted",
  }[tone];
  return (
    <Link
      href={href}
      className={cn(
        "group rounded-2xl border p-3.5 transition hover:-translate-y-0.5 hover:shadow-soft",
        styles
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px]">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-white/70">
          {icon}
        </span>
      </div>
      <p className="mt-2 font-display text-2xl font-semibold tracking-tight">
        {value}
      </p>
      <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed opacity-80">
        {hint}
      </p>
    </Link>
  );
}

function PipelineStep({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-0.5 font-display text-lg font-semibold tracking-tight">
        {value}
        <span className="ml-0.5 text-[10px] font-normal text-muted">{hint}</span>
      </p>
    </div>
  );
}
