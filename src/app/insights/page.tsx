"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  BarChart3,
  Eye,
  Heart,
  Info,
  RefreshCw,
  UserPlus,
  Users,
} from "lucide-react";
import { EmptyState, SectionHeading, Spinner, Tabs } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, fetcher } from "@/lib/client";
import { cn, formatDateTime } from "@/lib/utils";
import type {
  PlatformMetrics,
  PlatformRange,
  PlatformSnapshot,
} from "@/lib/types";

type PlatformResponse = {
  snapshot: PlatformSnapshot | null;
  syncedAt: string | null;
};

type XhsStatusLite = {
  loggedIn: boolean | null;
  loginInProgress: boolean;
  publishing: boolean;
  syncing: boolean;
  profileExists: boolean;
};

const STEPS = [
  "正在打开创作服务平台…",
  "正在读取账号与诊断数据…",
  "正在读取近半年笔记数据…",
  "正在读取粉丝画像…",
  "正在整理数据…",
];

function formatNum(value: number) {
  return value.toLocaleString("zh-CN");
}

export default function InsightsPage() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<PlatformResponse>(
    "/api/platform",
    fetcher,
    { revalidateOnFocus: false }
  );
  const { data: xhs } = useSWR<XhsStatusLite>("/api/xhs/status", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: (latest) => (latest?.syncing ? 3000 : 0),
  });

  const snapshot = data?.snapshot || null;
  const [range, setRange] = useState<PlatformRange>("7");
  const [tab, setTab] = useState<"overview" | "notes" | "fans">("overview");
  const [syncing, setSyncing] = useState(false);
  const [step, setStep] = useState(0);
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    if (!syncing) return;
    setStep(0);
    const timer = setInterval(
      () => setStep((prev) => Math.min(prev + 1, STEPS.length - 1)),
      4000
    );
    return () => clearInterval(timer);
  }, [syncing]);

  async function sync() {
    if (syncing) return;
    setSyncing(true);
    setSyncError("");
    try {
      const res = await api<{ snapshot: PlatformSnapshot; syncedAt: string }>(
        "/api/platform/sync",
        { method: "POST" }
      );
      await mutate(
        { snapshot: res.snapshot, syncedAt: res.syncedAt },
        { revalidate: false }
      );
      toast("创作平台数据已同步", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "同步失败，请稍后重试";
      setSyncError(message);
      toast(message, "error");
    } finally {
      setSyncing(false);
    }
  }

  const metrics = snapshot?.metrics[range];
  const busy = syncing || Boolean(xhs?.syncing);
  const notLoggedIn =
    xhs?.loggedIn === false || (Boolean(xhs) && !xhs?.profileExists);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
            Insights
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-[34px]">
            数据看板
          </h1>
          <p className="mt-1 text-sm text-muted">
            把小红书创作中心的数据同步进来，账号、笔记、粉丝表现一页看清。
          </p>
          {snapshot && (
            <p className="mt-1 text-[11px] text-muted/80">
              上次同步 {formatDateTime(snapshot.syncedAt)} · 数据来自小红书创作中心
            </p>
          )}
        </div>
        <button onClick={sync} disabled={busy} className="btn-primary">
          {busy ? <Spinner size={15} /> : <RefreshCw size={15} />}
          {busy ? "同步中…" : "同步数据"}
        </button>
      </header>

      {snapshot &&
        (snapshot.warnings?.length ||
          (snapshot.notes.length === 0 && snapshot.account.noteCount > 0)) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-relaxed text-amber-800">
            <p className="font-medium">本次同步有部分数据不完整</p>
            <ul className="mt-1 space-y-1">
              {(snapshot.warnings || []).map((warning) => (
                <li key={warning}>· {warning}</li>
              ))}
              {snapshot.notes.length === 0 && snapshot.account.noteCount > 0 && (
                <li>
                  · 账号有 {snapshot.account.noteCount} 篇笔记，但最近笔记明细为 0，建议重新同步或检查创作中心页面结构
                </li>
              )}
            </ul>
          </div>
        )}

      {notLoggedIn && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 sm:flex-row sm:items-center">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Info size={15} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-amber-900">
              还没有登录小红书
            </p>
            <p className="mt-0.5 text-xs text-amber-800/80">
              数据同步需要读取创作中心，请先在设置里登录一次。
            </p>
          </div>
          <Link
            href="/settings"
            className="shrink-0 rounded-full bg-amber-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-amber-950"
          >
            去登录
          </Link>
        </div>
      )}

      {syncing && (
        <div className="card flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
            <Spinner size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{STEPS[step]}</p>
            <p className="mt-0.5 text-[11px] text-muted">
              同步过程约 20-40 秒，请保持页面打开，不会修改账号内容。
            </p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-paper">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
            </div>
          </div>
        </div>
      )}

      {syncError && !syncing && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs leading-relaxed text-red-600">
          <Info size={14} className="mt-0.5 shrink-0" />
          <p className="break-words">{syncError}</p>
        </div>
      )}

      {isLoading && !snapshot ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-3xl" />
          ))}
        </div>
      ) : !snapshot ? (
        <EmptyState
          icon={<BarChart3 size={22} />}
          title="还没有同步过数据"
          description="点右上角「同步数据」，程序会用本机浏览器读取创作中心的账号、笔记和粉丝数据。登录一次后可以随时同步。"
          action={
            notLoggedIn ? (
              <Link href="/settings" className="btn-primary btn-sm">
                先去登录小红书
              </Link>
            ) : (
              <button onClick={sync} disabled={busy} className="btn-primary btn-sm">
                {busy ? <Spinner size={14} /> : <RefreshCw size={14} />}
                同步数据
              </button>
            )
          }
        />
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={(value) => setTab(value as "overview" | "notes" | "fans")}
            items={[
              { value: "overview", label: "概览" },
              { value: "notes", label: "笔记" },
              { value: "fans", label: "粉丝" },
            ]}
          />
          <div
            className={cn(
              "grid grid-cols-2 gap-3 xl:grid-cols-4",
              tab !== "overview" && "hidden"
            )}
          >
            <AccountStat
              label="粉丝"
              value={formatNum(snapshot.account.followers)}
              hint="当前总粉丝"
              icon={<Users size={16} />}
              accent
            />
            <AccountStat
              label="关注"
              value={formatNum(snapshot.account.following)}
              hint="正在关注的人"
              icon={<UserPlus size={16} />}
            />
            <AccountStat
              label="获赞与收藏"
              value={formatNum(snapshot.account.likesCollects)}
              hint="账号累计"
              icon={<Heart size={16} />}
            />
            <AccountStat
              label="笔记总数"
              value={formatNum(snapshot.account.noteCount)}
              hint={`账号状态 · ${snapshot.account.status}`}
              icon={<BarChart3 size={16} />}
            />
          </div>

          <section
            className={cn(
              "card p-5 sm:p-6",
              tab !== "overview" && "hidden"
            )}
          >
            <SectionHeading
              title="笔记数据"
              subtitle={
                metrics?.period && metrics.period !== "—"
                  ? `统计周期 ${metrics.period}`
                  : "来自创作中心数据看板"
              }
              action={
                <div className="flex items-center gap-1 rounded-full border border-line bg-paper/60 p-1">
                  {(["7", "30"] as PlatformRange[]).map((item) => (
                    <button
                      key={item}
                      onClick={() => setRange(item)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-[11px] transition",
                        range === item
                          ? "bg-white font-medium text-ink shadow-sm"
                          : "text-muted hover:text-ink"
                      )}
                    >
                      近 {item} 天
                    </button>
                  ))}
                </div>
              }
            />

            {metrics && <MetricGroups metrics={metrics} />}
          </section>

          <section
            className={cn(
              "card min-w-0 p-5 sm:p-6",
              tab !== "notes" && "hidden"
            )}
          >
              <SectionHeading
                title="最近笔记"
                subtitle={`近半年 · 共 ${snapshot.notesTotal || snapshot.notes.length} 条`}
              />
              {snapshot.notes.length ? (
                <div>
                  <p className="mb-2 text-[10px] text-muted sm:hidden">
                    左右滑动查看完整指标
                  </p>
                  <div className="thin-scroll -mx-1 overflow-x-auto px-1">
                  <table className="w-full min-w-[980px] text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-[10px] font-medium text-muted">
                        <th className="sticky left-0 z-10 min-w-[180px] bg-white py-2 pr-3">
                          笔记
                        </th>
                        <th className="py-2 pr-3 whitespace-nowrap">发布</th>
                        <th className="py-2 pr-3">曝光</th>
                        <th className="py-2 pr-3">观看</th>
                        <th className="py-2 pr-3">封面点击</th>
                        <th className="py-2 pr-3">赞</th>
                        <th className="py-2 pr-3">评</th>
                        <th className="py-2 pr-3">藏</th>
                        <th className="py-2 pr-3">涨粉</th>
                        <th className="py-2 pr-3">分享</th>
                        <th className="py-2 pr-3">人均观看</th>
                        <th className="py-2">弹幕</th>
                      </tr>
                    </thead>
                    <tbody>
                      {snapshot.notes.map((note, index) => (
                        <tr
                          key={`${note.title}-${index}`}
                          className="border-b border-line/60 last:border-0"
                        >
                          <td className="sticky left-0 z-10 max-w-[260px] bg-white py-3 pr-3">
                            <p className="truncate font-medium" title={note.title}>
                              {note.title}
                            </p>
                          </td>
                          <td className="whitespace-nowrap py-3 pr-3 text-[10px] text-muted">
                            {note.publishedAt || "—"}
                          </td>
                          <NoteCell value={note.exposure} />
                          <NoteCell value={note.views} strong />
                          <NoteCell value={note.coverCtr} />
                          <NoteCell value={note.likes} />
                          <NoteCell value={note.comments} />
                          <NoteCell value={note.collects} />
                          <NoteCell value={note.follows} />
                          <NoteCell value={note.shares} />
                          <NoteCell value={note.avgWatch} />
                          <NoteCell value={note.danmaku} last />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-line py-10 text-center text-xs text-muted">
                  近半年暂无笔记数据
                </p>
              )}
              <p className="mt-3 text-[10px] leading-relaxed text-muted">
                内容分析仅保留近半年发布的笔记，不含未发布的定时笔记。
                {snapshot.notesTotal > snapshot.notes.length
                  ? ` 当前显示最近 ${snapshot.notes.length} 条。`
                  : ""}
              </p>
          </section>

          <div className="grid grid-cols-1 gap-5">
              <section
                className={cn(
                  "card p-5 sm:p-6",
                  tab !== "overview" && "hidden"
                )}
              >
                <SectionHeading
                  title="账号诊断"
                  subtitle="和同类创作者对比"
                />
                {snapshot.diagnosis.length ? (
                  <div className="space-y-4">
                    {snapshot.diagnosis.map((item) => (
                      <div key={item.label}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-xs text-muted">{item.label}</span>
                          <span className="font-display text-lg font-semibold">
                            {item.value}
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              item.percentile !== null
                                ? "bg-brand"
                                : "bg-line"
                            )}
                            style={{
                              width: `${item.percentile ?? 0}%`,
                            }}
                          />
                        </div>
                        <p className="mt-1 text-[10px] text-muted">
                          {item.percentile !== null
                            ? `超过 ${item.percentile}% 的同类创作者`
                            : "继续加油，保持稳定更新"}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted">暂无诊断数据</p>
                )}
              </section>

              <section
                className={cn(
                  "card p-5 sm:p-6",
                  tab !== "fans" && "hidden"
                )}
              >
                <SectionHeading
                  title="粉丝画像"
                  subtitle={`${snapshot.fans.range} · 完整画像在小红书 App 查看`}
                />
                <div className="grid grid-cols-3 gap-2">
                  <MiniStat label="总粉丝" value={formatNum(snapshot.fans.total)} />
                  <MiniStat
                    label="新增"
                    value={`+${formatNum(snapshot.fans.newFans)}`}
                    tone="text-emerald-600"
                  />
                  <MiniStat
                    label="流失"
                    value={`-${formatNum(snapshot.fans.lostFans)}`}
                    tone="text-red-500"
                  />
                </div>

                {(snapshot.fans.male !== null ||
                  snapshot.fans.female !== null) && (
                  <div className="mt-5">
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-paper">
                      <div
                        className="bg-brand"
                        style={{ width: `${snapshot.fans.male ?? 0}%` }}
                      />
                      <div
                        className="bg-ink/25"
                        style={{ width: `${snapshot.fans.female ?? 0}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                        男性 {snapshot.fans.male ?? "—"}%
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-ink/25" />
                        女性 {snapshot.fans.female ?? "—"}%
                      </span>
                    </div>
                  </div>
                )}

                {snapshot.fans.interests.length > 0 && (
                  <div className="mt-5">
                    <p className="text-[10px] font-medium text-muted">兴趣分布</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {snapshot.fans.interests.map((interest) => (
                        <span key={interest} className="chip">
                          {interest}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 space-y-1 text-[10px] leading-relaxed text-muted">
                  <p>· {snapshot.fans.regionNote}</p>
                  <p>· 粉丝来源：{snapshot.fans.sourceNote}</p>
                  <p>· 活跃粉丝：{snapshot.fans.activeNote}</p>
                </div>
              </section>
          </div>

          <div className="flex items-start gap-2 rounded-2xl border border-line bg-white/60 px-4 py-3 text-[10px] leading-relaxed text-muted">
            <Info size={13} className="mt-0.5 shrink-0" />
            <p>
              数据来自小红书创作中心，平台按小时更新；同步只读取页面，不会修改账号。
              观看来源/时段需要观看数达到 50 才能看到，完整地域和年龄分布请在小红书 App
              查看。发布新笔记后，再点一次「同步数据」即可更新。
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function AccountStat({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-4 shadow-soft sm:p-5",
        accent ? "border-brand/15 bg-brand-soft/50" : "border-line bg-white"
      )}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">{label}</p>
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-xl",
            accent ? "bg-white text-brand" : "bg-paper text-muted"
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight">
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] text-muted">{hint}</p>
    </div>
  );
}

function MetricGroups({ metrics }: { metrics: PlatformMetrics }) {
  const flow = [
    { label: "曝光", value: metrics.exposure },
    { label: "观看", value: metrics.views },
    { label: "封面点击率", value: metrics.coverCtr },
    { label: "平均观看", value: metrics.averageWatch },
    { label: "观看总时长", value: metrics.totalWatch },
    { label: "完播率", value: metrics.completion },
  ];
  const interaction = [
    { label: "点赞", value: metrics.likes },
    { label: "评论", value: metrics.comments },
    { label: "收藏", value: metrics.collects },
    { label: "分享", value: metrics.shares },
  ];
  const followers = [
    {
      label: "净涨粉",
      value: metrics.netFollowers,
      tone:
        metrics.netFollowers.startsWith("-")
          ? "text-red-500"
          : "text-emerald-600",
    },
    { label: "新增关注", value: metrics.newFollowers },
    { label: "取消关注", value: metrics.unfollows },
    { label: "主页访客", value: metrics.homepageVisitors },
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          <Eye size={11} /> 流量
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
          {flow.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>
      </div>
      <div className="border-t border-line pt-4">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          <Heart size={11} /> 互动
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {interaction.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>
      </div>
      <div className="border-t border-line pt-4">
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          <Users size={11} /> 粉丝与主页
        </p>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {followers.map((item) => (
            <MetricCard key={item.label} {...item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  const empty = !value || value === "—" || value === "-";
  return (
    <div className="rounded-2xl border border-line/80 bg-paper/35 px-3.5 py-3">
      <p className="text-[10px] text-muted">{label}</p>
      <p
        className={cn(
          "mt-1 font-display text-lg font-semibold tracking-tight",
          empty ? "text-muted/50" : "text-ink",
          !empty && tone
        )}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-2xl bg-paper/60 px-2.5 py-2.5 text-center">
      <p className={cn("text-sm font-semibold", tone)}>{value}</p>
      <p className="mt-0.5 text-[10px] text-muted">{label}</p>
    </div>
  );
}

function NoteCell({
  value,
  strong,
  last,
}: {
  value: string;
  strong?: boolean;
  last?: boolean;
}) {
  const empty = !value || value === "—" || value === "-";
  return (
    <td
      className={cn(
        "whitespace-nowrap py-3 pr-3",
        last && "pr-0",
        empty ? "text-muted/40" : strong ? "font-medium text-ink" : "text-ink/80"
      )}
    >
      {empty ? "—" : value}
    </td>
  );
}
