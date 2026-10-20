"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  FileText,
  Images,
  Megaphone,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  EmptyState,
  SectionHeading,
  Spinner,
  StatusBadge,
} from "@/components/ui";
import { EventEditorDialog } from "@/components/event-editor";
import { EventGenerateDialog } from "@/components/event-generate-dialog";
import { PostDetailModal } from "@/components/post-detail";
import { useToast } from "@/components/toast";
import { api, fetcher } from "@/lib/client";
import {
  eventDateRange,
  eventPhase,
  eventPhaseLabel,
  eventPostIssues,
} from "@/lib/event-rules";
import { cn, formatCN } from "@/lib/utils";
import type { Event, Post } from "@/lib/types";

type EventDetail = { event: Event; posts: Post[]; today: string };

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const router = useRouter();
  const toast = useToast();
  const { data, isLoading, error, mutate } = useSWR<EventDetail>(
    id ? `/api/events/${id}` : null,
    fetcher
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [postId, setPostId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checklistBusy, setChecklistBusy] = useState(false);

  const event = data?.event;
  const posts = data?.posts || [];
  const today = data?.today || "";
  const phase = event ? eventPhase(event, today) : "active";
  const remaining = event ? Math.max(0, event.quota - event.counts.total) : 0;
  const canCreate = Boolean(
    event && phase !== "ended" && event.counts.total < event.quota
  );
  const firstDraft = posts.find((post) => post.status !== "published");

  function openPost(postId: string) {
    setPostId(postId);
    setDetailOpen(true);
  }

  async function createPost() {
    if (!event) return;
    if (!canCreate && firstDraft) {
      openPost(firstDraft.id);
      return;
    }
    setCreating(true);
    try {
      const res = await api<{ post: Post }>(`/api/events/${event.id}/posts`, {
        method: "POST",
      });
      await mutate();
      openPost(res.post.id);
      toast("已新建活动作品，继续挑素材和写文案", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "新建失败", "error");
    } finally {
      setCreating(false);
    }
  }

  async function toggleChecklist(
    field: "formSubmitted" | "xiaoyanjingRegistered"
  ) {
    if (!event) return;
    setChecklistBusy(true);
    try {
      const res = await api<{ event: Event }>(
        `/api/events/${event.id}/checklist`,
        {
          method: "PATCH",
          body: JSON.stringify({ [field]: !event[field] }),
        }
      );
      await mutate({ ...data!, event: res.event }, { revalidate: false });
      toast(
        field === "formSubmitted"
          ? res.event.formSubmitted
            ? "已标记收集表提交"
            : "已取消收集表提交"
          : res.event.xiaoyanjingRegistered
          ? "已标记小眼睛登记"
          : "已取消小眼睛登记",
        "success"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setChecklistBusy(false);
    }
  }

  async function remove() {
    if (!event) return;
    if (
      !window.confirm(
        `删除活动「${event.name}」？已关联的作品会保留，但会解除活动关联。`
      )
    ) {
      return;
    }
    try {
      await api(`/api/events/${event.id}`, { method: "DELETE" });
      toast("活动已删除", "success");
      router.push("/events");
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败", "error");
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-28 rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-3xl" />
          ))}
        </div>
        <div className="skeleton h-72 rounded-3xl" />
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="space-y-4">
        <Link href="/events" className="btn-ghost btn-sm">
          <ArrowLeft size={13} /> 返回活动
        </Link>
        <EmptyState
          title="活动不存在或已删除"
          description="回到活动列表看看其他临时任务。"
          action={
            <Link href="/events" className="btn-primary btn-sm">
              查看活动
            </Link>
          }
          icon={<Megaphone size={20} />}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Link
          href="/events"
          className="mb-3 inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
        >
          <ArrowLeft size={12} /> 返回活动
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
              Event
            </p>
            <h1 className="mt-1.5 font-display text-3xl leading-tight tracking-tight sm:text-[34px]">
              {event.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
              <span className="rounded-full border border-line bg-white px-2.5 py-0.5">
                {eventPhaseLabel(event, today)}
              </span>
              <span className="flex items-center gap-1">
                <CalendarDays size={12} /> {eventDateRange(event)}
              </span>
              <span className="flex items-center gap-1">
                <ClipboardList size={12} /> {event.collectionForm || "未设置收集表"}
              </span>
              {event.internal && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                  内部活动
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setEditorOpen(true)} className="btn-secondary">
              <Pencil size={14} /> 编辑
            </button>
            <button
              onClick={() => setGenerateOpen(true)}
              disabled={phase === "ended" || event.counts.total >= event.quota}
              className="btn-primary"
            >
              <Sparkles size={14} /> AI 写活动稿
            </button>
            <button
              onClick={createPost}
              disabled={creating || phase === "ended" || (!canCreate && !firstDraft)}
              className="btn-secondary"
            >
              {creating ? <Spinner size={14} /> : <Plus size={14} />}
              {!canCreate && firstDraft ? "继续编辑" : "新建作品"}
            </button>
          </div>
        </header>
      </div>

      {(event.internal || event.officialAssets) && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-800">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            {event.internal && <p>内部活动：请勿把群聊、直播或内部资料截图外传。</p>}
            {event.officialAssets && (
              <p>官方素材需要二创，不要直接搬运官方海报或原片。</p>
            )}
            <p>发布前确认收集表选择「{event.collectionForm || "对应活动"}」，并按要求登记小眼睛。</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="周期内篇数" value={`${event.quota}`} hint="活动规则" />
        <Metric
          label="已建作品"
          value={`${event.counts.total}/${event.quota}`}
          hint={`${event.counts.published} 篇已发布`}
          accent={event.counts.total >= event.quota}
        />
        <Metric
          label="还可以发"
          value={`${remaining}`}
          hint={phase === "ended" ? "活动已结束" : "篇"}
          accent={remaining > 0 && phase !== "ended"}
        />
        <Metric
          label="收集表 / 小眼睛"
          value={`${event.formSubmitted ? "已提交" : "未提交"} / ${
            event.xiaoyanjingRegistered ? "已登记" : "未登记"
          }`}
          hint="手工清单"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_1fr]">
        <section className="card p-5 sm:p-6">
          <SectionHeading
            title="活动规则"
            subtitle="发布前会自动校验话题、配图、字数和截止时间"
          />
          <div className="space-y-3">
            <div>
              <p className="label mb-1">必带话题</p>
              <div className="flex flex-wrap gap-1.5">
                {event.requiredTopics.length ? (
                  event.requiredTopics.map((topic) => (
                    <span key={topic} className="chip text-brand">
                      #{topic}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-amber-600">
                    还没有设置必带话题，建议尽快补充
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <RuleItem label="配图" value={`至少 ${event.minImages} 张`} />
              <RuleItem label="正文" value={`至少 ${event.minBody} 字`} />
              <RuleItem label="建议发布" value={event.publishTime} />
              <RuleItem
                label="周上限"
                value={event.countsWeekly ? "计入" : "不占常驻周上限"}
              />
              <RuleItem
                label="官方素材"
                value={event.officialAssets ? "需二创" : "无特别要求"}
              />
            </div>
            <div className="rounded-2xl border border-line bg-paper/40 p-3.5">
              <p className="text-[10px] font-medium text-muted">收集表</p>
              {event.collectionUrl ? (
                <a
                  href={event.collectionUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  {event.collectionForm || "打开收集表"} <ExternalLink size={11} />
                </a>
              ) : (
                <p className="mt-1 text-xs text-muted">
                  {event.collectionForm || "还没有填写收集表名称/链接"}
                </p>
              )}
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                飞书/问卷星等表单不会自动提交，提交后回到这里勾选“已提交收集表”。
              </p>
            </div>
            {event.brief && (
              <details className="rounded-2xl border border-line bg-white p-3.5">
                <summary className="cursor-pointer text-xs font-medium text-ink">
                  查看活动公告原文
                </summary>
                <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted">
                  {event.brief}
                </pre>
              </details>
            )}
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <SectionHeading
            title="参与清单"
            subtitle="发布后记得做这两件事"
            action={
              <span className="chip text-[10px]">
                <ClipboardCheck size={12} /> 手工
              </span>
            }
          />
          <div className="space-y-2.5">
            <CheckRow
              checked={event.formSubmitted}
              disabled={checklistBusy}
              label="已提交活动收集表"
              hint={event.collectionForm || "按群公告选择对应收集表"}
              onClick={() => toggleChecklist("formSubmitted")}
            />
            <CheckRow
              checked={event.xiaoyanjingRegistered}
              disabled={checklistBusy}
              label="已登记小眼睛系统"
              hint="按活动要求同步登记"
              onClick={() => toggleChecklist("xiaoyanjingRegistered")}
            />
          </div>
          <div className="mt-4 rounded-2xl bg-brand-soft/40 p-3.5 text-[11px] leading-relaxed text-brand">
            活动作品不计入常驻活动周上限；周期内篇数由活动自己控制。发布中心会在队列里显示活动名称。
          </div>
          <button
            onClick={remove}
            className="btn-ghost btn-sm mt-3 text-red-500 hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 size={13} /> 删除活动
          </button>
        </section>
      </div>

      <section className="card p-5 sm:p-6">
        <SectionHeading
          title="活动作品"
          subtitle={
            posts.length
              ? `${posts.length} 篇，已发布 ${event.counts.published} 篇`
              : "还没有作品，先新建或让 AI 写一篇"
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              {event.counts.total < event.quota && phase !== "ended" && (
                <button onClick={createPost} disabled={creating} className="btn-secondary btn-sm">
                  {creating ? <Spinner size={13} /> : <Plus size={13} />} 新建
                </button>
              )}
              <button
                onClick={() => setGenerateOpen(true)}
                disabled={phase === "ended" || event.counts.total >= event.quota}
                className="btn-primary btn-sm"
              >
                <Sparkles size={13} /> AI 写稿
              </button>
            </div>
          }
        />
        {posts.length ? (
          <div className="space-y-2.5">
            {posts.map((post) => {
              const issues = eventPostIssues(post, event);
              return (
                <button
                  key={post.id}
                  onClick={() => openPost(post.id)}
                  className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-white p-3 text-left transition hover:border-brand/25 hover:bg-paper/40"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-paper">
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{post.title}</p>
                      <StatusBadge status={post.status} dot={false} />
                    </div>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {post.scheduledDate
                        ? `${formatCN(post.scheduledDate)} ${
                            post.scheduledTime || ""
                          }`
                        : "未排期"}{" "}
                      · {post.images.length} 图 ·{" "}
                      {post.body.replace(/\s+/g, "").length} 字
                    </p>
                    {issues.length > 0 && (
                      <p className="mt-0.5 text-[10px] text-amber-600">
                        还有 {issues.length} 项待完善
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[10px] text-brand group-hover:underline">
                    打开
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="还没有活动作品"
            description="新建一篇空白作品，或让 AI 根据已识别素材写一篇活动稿。"
            action={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={createPost}
                  disabled={!canCreate}
                  className="btn-secondary btn-sm"
                >
                  <Plus size={14} /> 新建作品
                </button>
                <button
                  onClick={() => setGenerateOpen(true)}
                  disabled={phase === "ended"}
                  className="btn-primary btn-sm"
                >
                  <Sparkles size={14} /> AI 写活动稿
                </button>
              </div>
            }
            icon={<FileText size={20} />}
          />
        )}
      </section>

      <EventEditorDialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        event={event}
        onSaved={() => void mutate()}
      />
      <EventGenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        event={event}
        onGenerated={(post) => {
          void mutate();
          openPost(post.id);
        }}
      />
      <PostDetailModal
        postId={postId}
        open={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          void mutate();
        }}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  accent,
  compact,
}: {
  label: string;
  value: string;
  hint: string;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-4 shadow-soft",
        accent ? "border-brand/15 bg-brand-soft/45" : "border-line bg-white"
      )}
    >
      <p className="text-xs text-muted">{label}</p>
      <p
        className={cn(
          "mt-2 font-display font-semibold tracking-tight",
          compact ? "text-sm leading-snug" : "text-2xl"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-[10px] text-muted">{hint}</p>
    </div>
  );
}

function RuleItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper/60 px-3 py-2">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-0.5 text-xs font-medium text-ink/80">{value}</p>
    </div>
  );
}

function CheckRow({
  checked,
  disabled,
  label,
  hint,
  onClick,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition",
        checked
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-line bg-white hover:border-brand/20"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          checked
            ? "border-emerald-500 bg-emerald-500 text-white"
            : "border-line bg-white text-transparent"
        )}
      >
        <Check size={12} strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">
          {hint}
        </span>
      </span>
    </button>
  );
}
