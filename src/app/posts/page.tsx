"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  CalendarDays,
  CheckCircle2,
  FileText,
  Images,
  Megaphone,
  Play,
  Plus,
  Search,
  Send,
  Sparkles,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import { EmptyState, Spinner, StatusBadge } from "@/components/ui";
import { PostDetailModal } from "@/components/post-detail";
import { GenerateDialog } from "@/components/generate-dialog";
import { useToast } from "@/components/toast";
import { api, fetcher, refreshAll } from "@/lib/client";
import { cn, formatCN, toDateStr } from "@/lib/utils";
import type { Post, PostStatus } from "@/lib/types";

type Filter = "all" | PostStatus;

const TABS: { key: Filter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "ready", label: "待发布" },
  { key: "published", label: "已发布" },
];

function displayDate(post: Post) {
  if (post.status === "published" && post.publishedAt) {
    return `发布于 ${formatCN(toDateStr(new Date(post.publishedAt)))}`;
  }
  if (post.scheduledDate) {
    return `计划 ${formatCN(post.scheduledDate)}${
      post.scheduledTime ? ` ${post.scheduledTime}` : ""
    }`;
  }
  return "未排期";
}

export default function PostsPage() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<{ posts: Post[] }>("/api/posts", fetcher);
  const posts = useMemo(() => data?.posts || [], [data]);

  const [tab, setTab] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"updated" | "schedule" | "created">(
    "updated"
  );
  const [postId, setPostId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    const status = new URLSearchParams(window.location.search).get("status");
    if (status === "draft" || status === "ready" || status === "published") {
      setTab(status);
    }
  }, []);

  const counts = useMemo(() => {
    return {
      all: posts.length,
      draft: posts.filter((p) => p.status === "draft").length,
      ready: posts.filter((p) => p.status === "ready").length,
      published: posts.filter((p) => p.status === "published").length,
    };
  }, [posts]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = posts.filter((post) => {
      if (tab !== "all" && post.status !== tab) return false;
      if (!query) return true;
      const haystack = [
        post.title,
        post.body,
        post.theme,
        post.campaign,
        post.eventName || "",
        ...post.hashtags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
    return list.sort((a, b) => {
      if (sort === "schedule") {
        return (
          (a.scheduledDate || "9999-99-99").localeCompare(
            b.scheduledDate || "9999-99-99"
          ) || (a.scheduledTime || "").localeCompare(b.scheduledTime || "")
        );
      }
      if (sort === "created") {
        return b.createdAt.localeCompare(a.createdAt);
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [posts, tab, search, sort]);

  function openPost(id: string) {
    setPostId(id);
    setDetailOpen(true);
  }

  async function togglePublished(post: Post, event: React.MouseEvent) {
    event.stopPropagation();
    if (markingId) return;
    if (post.status === "published") {
      if (!window.confirm("撤回本地已发布标记？小红书上的笔记不会被删除，配图会重新变为可用。")) return;
      setMarkingId(post.id);
      try {
        await api(`/api/posts/${post.id}/publish`, {
          method: "POST",
          body: JSON.stringify({ published: false }),
        });
        await mutate();
        await refreshAll();
        toast("已撤回发布标记", "success");
      } catch (error) {
        toast(error instanceof Error ? error.message : "操作失败", "error");
      } finally {
        setMarkingId(null);
      }
      return;
    }
    const url = window.prompt(
      "已经在小红书手动发布了吗？可粘贴笔记链接（留空也可以）",
      post.xhsUrl || ""
    );
    if (url === null) return;
    setMarkingId(post.id);
    try {
      await api(`/api/posts/${post.id}/publish`, {
        method: "POST",
        body: JSON.stringify({ published: true, url: url.trim() || undefined }),
      });
      await mutate();
      await refreshAll();
      toast("已标记为手动发布，配图已锁定", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "标记失败", "error");
    } finally {
      setMarkingId(null);
    }
  }

  async function createBlank() {
    setCreating(true);
    try {
      const res = await api<{ post: Post }>("/api/posts", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refreshAll();
      openPost(res.post.id);
      toast("已新建草稿，从素材库挑几个素材开始吧", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "创建失败", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
            Notes
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-[34px]">
            作品库
          </h1>
          <p className="mt-1 text-sm text-muted">
            {counts.all} 篇作品 · {counts.draft} 篇草稿 · {counts.published} 篇已发布
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/publish" className="btn-secondary">
            <Send size={15} /> 发布中心
          </Link>
          <button
            onClick={createBlank}
            disabled={creating}
            className="btn-secondary"
          >
            {creating ? <Spinner size={15} /> : <Plus size={15} />} 新建空白
          </button>
          <button
            onClick={() => setGenerateOpen(true)}
            className="btn-primary"
          >
            <Wand2 size={15} /> AI 智能策划
          </button>
        </div>
      </header>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:w-72">
          <Search
            size={14}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="搜索作品"
            placeholder="搜索标题、正文、主题、标签…"
            className="field rounded-full py-2 pl-9 pr-8 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="清空搜索"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </div>
        <select
          value={sort}
          onChange={(event) =>
            setSort(event.target.value as "updated" | "schedule" | "created")
          }
          aria-label="作品排序"
          className="field w-full rounded-full py-2 text-xs sm:w-auto"
        >
          <option value="updated">最近编辑</option>
          <option value="schedule">按排期日期</option>
          <option value="created">最近创建</option>
        </select>
      </div>

      <div className="mb-5 flex items-center gap-1 overflow-x-auto no-scrollbar">
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
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="skeleton h-72 rounded-3xl" />
          ))}
        </div>
      ) : filtered.length ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((post) => (
            <div
              key={post.id}
              role="button"
              tabIndex={0}
              onClick={() => openPost(post.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") openPost(post.id);
              }}
              className="group card cursor-pointer overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-paper">
                {post.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={post.cover.thumbUrl}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.04]"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted">
                    <Images size={24} />
                    <span className="text-[11px]">还没有配图</span>
                  </div>
                )}
                {post.mediaType === "video" &&
                  post.images[0]?.kind === "video" && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white shadow-sm backdrop-blur">
                        <Play size={17} fill="currentColor" />
                      </span>
                    </span>
                  )}
                <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
                  <StatusBadge
                    status={post.status}
                    className="border-white/30 bg-white/90 backdrop-blur"
                  />
                  <span className="rounded-full border border-white/30 bg-black/35 px-2 py-0.5 text-[10px] text-white backdrop-blur">
                    {post.mediaType === "video"
                      ? post.images[0]?.kind === "gif"
                        ? "动图"
                        : "视频"
                      : `${post.images.length} 图`}
                  </span>
                </div>
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
                <p className="absolute bottom-3 left-4 right-4 line-clamp-1 text-sm font-medium text-white drop-shadow">
                  {post.title || "未命名笔记"}
                </p>
              </div>

              <div className="p-4">
                <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-muted">
                  {post.body || "还没有正文，点开继续完善。"}
                </p>
                {post.campaign && (
                  <span className="mt-2 mr-1 inline-flex max-w-full items-center gap-1 truncate rounded-full bg-brand-soft px-2 py-0.5 text-[10px] text-brand">
                    <Sparkles size={10} /> {post.campaign}
                  </span>
                )}
                {post.eventName && (
                  <span className="mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                    <Megaphone size={10} /> {post.eventName}
                  </span>
                )}
                {post.hashtags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {post.hashtags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-muted"
                      >
                        #{tag}
                      </span>
                    ))}
                    {post.hashtags.length > 3 && (
                      <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] text-muted">
                        +{post.hashtags.length - 3}
                      </span>
                    )}
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3 text-[10px] text-muted">
                  <span className="flex min-w-0 items-center gap-1">
                    <CalendarDays size={11} /> {displayDate(post)}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => togglePublished(post, event)}
                    disabled={markingId === post.id}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-medium text-ink transition hover:border-brand/30 hover:bg-brand-soft/40 hover:text-brand disabled:opacity-50"
                  >
                    {markingId === post.id ? (
                      <Spinner size={11} />
                    ) : post.status === "published" ? (
                      <Undo2 size={11} />
                    ) : (
                      <CheckCircle2 size={11} />
                    )}
                    {post.status === "published" ? "撤回标记" : "标记已发布"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={tab === "all" ? "还没有作品" : "这个分类下还没有作品"}
          description="让 AI 把素材库里的照片分成几篇笔记，或者新建一篇空白作品手动创作。"
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={() => setGenerateOpen(true)}
                className="btn-primary btn-sm"
              >
                <Sparkles size={14} /> AI 策划
              </button>
              <button onClick={createBlank} className="btn-secondary btn-sm">
                <Plus size={14} /> 新建空白
              </button>
            </div>
          }
          icon={<FileText size={20} />}
        />
      )}

      <PostDetailModal
        postId={postId}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      <GenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerated={(created) => {
          if (created[0]) openPost(created[0].id);
        }}
      />
    </div>
  );
}
