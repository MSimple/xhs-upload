"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  CheckCircle2,
  Coins,
  Images,
  Layers,
  RefreshCw,
  Rocket,
  Save,
  Sparkles,
  Timer,
  Upload,
} from "lucide-react";
import { Spinner, Tabs } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, fetcher, refreshAll } from "@/lib/client";
import { cn, formatCN, todayStr } from "@/lib/utils";
import type { CampaignProgress, Post } from "@/lib/types";

const PLAN_ROUNDS = 6;

type CampaignSettings = {
  campaign_enabled: string;
  campaign_name: string;
  campaign_city: string;
  campaign_model: string;
  campaign_tier: string;
  campaign_weekly_posts: string;
  campaign_buffer_weeks: string;
  campaign_body_min: string;
  campaign_time: string;
  campaign_auto_plan: string;
  campaign_start_date: string;
  campaign_batch_images: string;
  campaign_points_per_post: string;
  campaign_points_cap: string;
  campaign_last_plan_at: string;
};

type CampaignIssue = {
  id: string;
  title: string;
  status: string;
  scheduledDate: string | null;
  issues: string[];
  warnings: string[];
};

type AnnouncementLink = { label: string; url: string };

type Announcement = {
  raw: string;
  links: AnnouncementLink[];
  month: string;
  at: string;
};

type CampaignResponse = {
  campaign: string;
  configured: boolean;
  model: string;
  announcement: Announcement;
  settings: CampaignSettings;
  counts: {
    tagged: number;
    unused: number;
    analyzed: number;
    pendingAnalysis: number;
    scheduled: number;
    published: number;
    publishedThisMonth: number;
    weeklyPublished: number;
    weeklyPostsCap: number;
    weeklyPoints: number;
    weeklyPointsCap: number;
    estimatedPoints: number;
  };
  rules: { minImages: number; minBody: number; weeklyPostsCap: number };
  issues: CampaignIssue[];
  next: Post[];
};

type PlanResponse = {
  created: Post[];
  warnings: string[];
  analyzed: number;
  remaining: number;
  mock: boolean;
};

function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start justify-between gap-4 rounded-2xl border border-line bg-white px-4 py-3 text-left transition hover:border-ink/15"
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
          {description}
        </span>
      </span>
      <span
        className={cn(
          "relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full transition",
          checked ? "bg-brand" : "bg-stone-200"
        )}
      >
        <span
          className={cn(
            "h-4.5 w-4.5 rounded-full bg-white shadow transition",
            checked ? "translate-x-[1.4rem]" : "translate-x-1"
          )}
          style={{ height: 18, width: 18 }}
        />
      </span>
    </button>
  );
}

function Stat({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "card p-4",
        accent && "border-brand/25 bg-brand-soft/40"
      )}
    >
      <div className="flex items-center gap-2 text-[11px] text-muted">
        <span className={cn("text-brand", !accent && "opacity-70")}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-display text-2xl tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-[10px] text-muted">{hint}</p>}
    </div>
  );
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center sm:text-left">
      <p className="text-[10px] text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tracking-tight">{value}</p>
    </div>
  );
}

export default function CampaignPage() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<CampaignResponse>(
    "/api/campaign",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30_000 }
  );
  const [form, setForm] = useState<CampaignSettings | null>(null);
  const [baseline, setBaseline] = useState<CampaignSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [planning, setPlanning] = useState<"one" | "all" | null>(null);
  const [tab, setTab] = useState<"overview" | "plan" | "rules" | "announcement">("overview");
  const [planRound, setPlanRound] = useState(0);
  const [lastPlan, setLastPlan] = useState<PlanResponse | null>(null);
  const { data: progressData } = useSWR<{ progress: CampaignProgress }>(
    "/api/campaign/progress",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 3000 }
  );
  const progress = progressData?.progress;
  const wasPlanning = useRef(false);

  useEffect(() => {
    const running = Boolean(progress?.running || planning);
    if (wasPlanning.current && !running) {
      void mutate();
    }
    wasPlanning.current = running;
  }, [progress?.running, planning, mutate]);

  const [announcementText, setAnnouncementText] = useState("");
  const [announcementTouched, setAnnouncementTouched] = useState(false);
  const [parsingAnnouncement, setParsingAnnouncement] = useState(false);

  const enabled = form?.campaign_enabled === "1";
  const canPlan = Boolean(
    data &&
      data.model &&
      data.counts.unused >= data.rules.minImages
  );
  const missingImages = data
    ? Math.max(0, data.rules.minImages - data.counts.unused)
    : 0;
  const points = Number(form?.campaign_points_per_post) || 0;
  const cap = Number(form?.campaign_points_cap) || 0;
  const weeklyPoints = data?.counts.weeklyPoints || 0;
  const weeklyPublished = data?.counts.weeklyPublished || 0;
  const weeklyPostsCap = data?.counts.weeklyPostsCap || 4;

  const dirty = useMemo(() => {
    if (!form || !baseline) return false;
    return JSON.stringify(form) !== JSON.stringify(baseline);
  }, [form, baseline]);

  useEffect(() => {
    if (!data?.settings) return;
    if (!form || !baseline) {
      setForm(data.settings);
      setBaseline(data.settings);
      return;
    }
    if (JSON.stringify(form) !== JSON.stringify(baseline)) return;
    if (JSON.stringify(data.settings) !== JSON.stringify(baseline)) {
      setForm(data.settings);
      setBaseline(data.settings);
    }
  }, [data, form, baseline]);

  useEffect(() => {
    if (data?.announcement && !announcementTouched) {
      setAnnouncementText(data.announcement.raw || "");
    }
  }, [data, announcementTouched]);

  async function parseAnnouncement() {
    if (!announcementText.trim()) return;
    setParsingAnnouncement(true);
    try {
      const res = await api<{ announcement: Announcement }>(
        "/api/campaign/announcement",
        {
          method: "POST",
          body: JSON.stringify({ text: announcementText }),
        }
      );
      setAnnouncementText(res.announcement.raw);
      setAnnouncementTouched(false);
      await mutate();
      toast(
        `已解析 ${res.announcement.links.length} 个收集表链接`,
        "success"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "解析失败", "error");
    } finally {
      setParsingAnnouncement(false);
    }
  }

  function patch<K extends keyof CampaignSettings>(
    key: K,
    value: CampaignSettings[K]
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await api<CampaignResponse>("/api/campaign", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setForm(res.settings);
      setBaseline(res.settings);
      await mutate(res, { revalidate: false });
      await refreshAll();
      toast("活动设置已保存", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  async function plan(all: boolean) {
    if (all && !window.confirm("会尽量把当前活动里所有未排期素材都生成并排期，可能耗时几分钟。继续？")) {
      return;
    }
    setPlanning(all ? "all" : "one");
    setLastPlan(null);
    setPlanRound(all ? 0 : 1);
    try {
      if (!all) {
        const res = await api<PlanResponse>("/api/campaign/plan", {
          method: "POST",
          body: JSON.stringify({ maxPosts: 10 }),
        });
        setLastPlan(res);
        await refreshAll();
        toast(
          res.created.length
            ? `已生成 ${res.created.length} 篇，剩余 ${res.remaining} 张待排期`
            : "这批没有生成新作品",
          res.created.length ? "success" : "error"
        );
        return;
      }

      const created: Post[] = [];
      const warnings: string[] = [];
      let analyzed = 0;
      let remaining = data?.counts.unused || 0;
      for (let round = 0; round < PLAN_ROUNDS; round++) {
        setPlanRound(round + 1);
        const res = await api<PlanResponse>("/api/campaign/plan", {
          method: "POST",
          body: JSON.stringify({ maxPosts: 10 }),
        });
        created.push(...res.created);
        warnings.push(...res.warnings);
        analyzed += res.analyzed;
        remaining = res.remaining;
        setLastPlan({
          created: [...created],
          warnings: warnings.slice(-10),
          analyzed,
          remaining,
          mock: res.mock,
        });
        if (!res.created.length || remaining <= 0) break;
      }
      await refreshAll();
      toast(
        created.length
          ? `已生成 ${created.length} 篇，剩余 ${remaining} 张待排期`
          : "没有生成新作品",
        created.length ? "success" : "error"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "生成失败", "error");
    } finally {
      setPlanning(null);
    }
  }

  if (isLoading || !form || !data) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-24 rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-24 rounded-3xl" />
          ))}
        </div>
        <div className="skeleton h-96 rounded-3xl" />
      </div>
    );
  }

  const progressActive = Boolean(planning) || Boolean(progress?.running);
  const phaseRank =
    progress?.phase === "analyzing"
      ? 1
      : progress?.phase === "planning"
      ? 2
      : progress?.phase === "creating"
      ? 3
      : progress?.phase === "done"
      ? 3
      : 0;
  const phaseTitle = progress?.running
    ? progress.phase === "analyzing"
      ? "正在识别活动素材"
      : progress.phase === "planning"
      ? "正在策划活动笔记"
      : progress.phase === "creating"
      ? "正在生成发布排期"
      : "正在准备活动排期"
    : planning
    ? "正在策划活动笔记"
    : "排期进行中";
  const activeCreated = progress?.running ? progress.created || 0 : 0;
  const generatedTotal = (lastPlan?.created.length || 0) + activeCreated;
  const analyzedCount = progress?.analyzed || 0;
  const remainingCount = progress?.remaining ?? data.counts.unused;
  const roundLabel =
    planning === "all"
      ? `第 ${Math.max(1, planRound)} / ${PLAN_ROUNDS} 轮`
      : progress?.totalBatches
      ? `第 ${Math.max(1, progress.batch)} / ${progress.totalBatches} 批`
      : planning
      ? "第 1 / 1 轮"
      : "";
  const progressError =
    progress?.phase === "error" ? progress.error : null;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
            Campaign
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-[34px]">
            创作营
          </h1>
          <p className="mt-1 text-sm text-muted">
            {data.campaign} · 10 积分 = 1 元 · 上传一次，自动排期与发布
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/campaign/inspiration" className="btn-secondary">
            <Camera size={15} /> 拍什么
          </Link>
          <Link href="/library?campaign=1" className="btn-secondary">
            <Upload size={15} /> 上传活动素材
          </Link>
          <button
            onClick={() => plan(false)}
            disabled={Boolean(planning) || !canPlan}
            title={
              !data.model
                ? "请先填写车型词"
                : missingImages
                ? `活动图文至少 ${data.rules.minImages} 张，还差 ${missingImages} 张`
                : undefined
            }
            className="btn-primary"
          >
            {planning === "one" ? <Spinner size={15} /> : <Sparkles size={15} />}
            {planning === "one" ? "正在生成…" : "生成下一批"}
          </button>
        </div>
      </header>

      {progressActive && (
        <section className="card mb-5 overflow-hidden border-brand/20 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand">
                <Spinner size={18} />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{phaseTitle}</p>
                  {roundLabel && <span className="chip">{roundLabel}</span>}
                  {progress?.source === "auto" && (
                    <span className="chip text-brand">自动排队</span>
                  )}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  {progress?.message || "正在准备活动排期…"}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:min-w-[320px] sm:gap-5">
              <ProgressStat label="已生成" value={`${generatedTotal} 篇`} />
              <ProgressStat label="已识别" value={`${analyzedCount} 张`} />
              <ProgressStat label="剩余素材" value={`${remainingCount} 张`} />
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { label: "识别素材", rank: 1 },
              { label: "AI 策划", rank: 2 },
              { label: "创建排期", rank: 3 },
            ].map((step) => {
              const done = phaseRank > step.rank;
              const active = phaseRank === step.rank;
              return (
                <div key={step.label}>
                  <div
                    className={cn(
                      "h-1 overflow-hidden rounded-full",
                      done || active ? "bg-brand" : "bg-paper"
                    )}
                  />
                  <p
                    className={cn(
                      "mt-1.5 text-[10px]",
                      active
                        ? "font-medium text-brand"
                        : done
                        ? "text-ink/70"
                        : "text-muted"
                    )}
                  >
                    {step.label}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!progressActive && progressError && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">排期生成失败：{progressError}</p>
        </div>
      )}

      {!data.configured && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            当前是演示模式，只会生成示例文案，不会调用真实模型。请先到
            <Link href="/settings" className="mx-1 font-medium underline">
              设置
            </Link>
            配置 AI。
          </p>
        </div>
      )}

      {!enabled && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-xs text-muted">
          <Timer size={16} className="mt-0.5 shrink-0 text-brand" />
          活动自动排期已关闭。打开下方「启用活动」后，调度器会自动补齐发布队列。
        </div>
      )}

      {!form.campaign_model && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            还没设置车型词。官方话题是「#车型词 + AI
            从三选一赛道中选一个」；未设置车型词时生成和发布都会被阻止。
          </p>
        </div>
      )}

      {data.counts.unused > 0 && missingImages > 0 && (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p className="leading-relaxed">
            当前有 {data.counts.unused} 张待排期活动素材，活动图文至少需要{" "}
            {data.rules.minImages} 张，还差 {missingImages} 张。补齐前不会调用 AI
            生成。
          </p>
        </div>
      )}



      <Tabs
        className="mb-5"
        value={tab}
        onChange={(value) =>
          setTab(value as "overview" | "plan" | "rules" | "announcement")
        }
        items={[
          { value: "overview", label: "概览" },
          { value: "plan", label: "生成与排期" },
          {
            value: "rules",
            label: "规则与体检",
            count: data.issues.length,
          },
          {
            value: "announcement",
            label: "公告与收集表",
            count: data.announcement.links.length,
          },
        ]}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="待排期素材"
          value={data.counts.unused}
          hint={`${data.counts.analyzed} 张已识别${
            data.counts.pendingAnalysis
              ? ` · ${data.counts.pendingAnalysis} 张待识别`
              : ""
          }`}
          icon={<Images size={15} />}
        />
        <Stat
          label="已排期"
          value={data.counts.scheduled}
          hint="未来待发布的活动笔记"
          icon={<CalendarDays size={15} />}
        />
        <Stat
          label="本周已发布"
          value={`${weeklyPublished} / ${weeklyPostsCap}`}
          hint={`本月 ${data.counts.publishedThisMonth} 篇 · 累计 ${data.counts.published} 篇`}
          icon={<CheckCircle2 size={15} />}
        />
        <Stat
          label="本周积分"
          value={weeklyPoints}
          hint={`上限 ${cap || "—"} · 约 ${(weeklyPoints / 10).toFixed(1)} 元`}
          icon={<Coins size={15} />}
          accent
        />
      </div>

      <div className="grid grid-cols-1 gap-5">
        <section className={cn("card p-5 sm:p-6", tab !== "plan" && "hidden")}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="section-title">排期设置</h2>
              <p className="mt-0.5 text-xs text-muted">
                调度器每分钟检查一次，队列不足时自动补新作品。
              </p>
            </div>
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="btn-primary btn-sm"
            >
              {saving ? <Spinner size={14} /> : <Save size={14} />}
              {dirty ? "保存设置" : "已保存"}
            </button>
          </div>

          <div className="space-y-4">
            <Switch
              checked={enabled}
              onChange={(value) =>
                patch("campaign_enabled", value ? "1" : "0")
              }
              label="启用活动"
              description="启用后，带活动标签的素材才会被创作营自动处理。"
            />
            <Switch
              checked={form.campaign_auto_plan === "1"}
              onChange={(value) =>
                patch("campaign_auto_plan", value ? "1" : "0")
              }
              label="自动补齐队列"
              description="未来可发布篇数低于储备周数时，自动调用 AI 生成下一批。"
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="label">活动名称（素材标签）</label>
                <input
                  aria-label="活动名称" value={form.campaign_name}
                  onChange={(event) =>
                    patch("campaign_name", event.target.value)
                  }
                  className="field"
                  placeholder="有理想的创作者"
                />
              </div>
              <div>
                <label className="label">车型词（不带 #）</label>
                <input
                  aria-label="车型词" value={form.campaign_model}
                  onChange={(event) =>
                    patch("campaign_model", event.target.value)
                  }
                  className="field"
                  placeholder="理想i6 / 理想L6 / 理想MEGA"
                />
                <p className="mt-1 text-[10px] text-muted">
                  官方话题 = 车型词 + AI 选择的赛道，例如 #理想i6 #我的智系车。
                </p>
              </div>
              <div>
                <label className="label">赛道（AI 自动三选一）</label>
                <div className="rounded-2xl border border-line bg-paper/60 px-4 py-2.5 text-[11px] leading-relaxed text-muted">
                  <p>AI 按内容从下面三组里选最贴合的一组，并尽量均衡：</p>
                  <p className="mt-1 font-medium text-ink/75">
                    #我的智系车 · #开车出去玩 · #车内躺平计划
                  </p>
                </div>
                <p className="mt-1 text-[10px] text-muted">
                  旧话题 #有理想的生活 已停用；每篇只带一组，不用全加。
                </p>
                <p className="mt-1 text-[10px] font-medium text-brand">
                  预览：#{form.campaign_model || "车型词"} + AI 选一个赛道
                </p>
              </div>
              <div>
                <label className="label">创作者等级</label>
                <select
                  aria-label="创作者等级" value={form.campaign_tier}
                  onChange={(event) => {
                    const tier = event.target.value;
                    patch("campaign_tier", tier);
                    patch(
                      "campaign_points_per_post",
                      tier === "creator" ? "300" : "150"
                    );
                    patch(
                      "campaign_points_cap",
                      tier === "creator" ? "1200" : "600"
                    );
                  }}
                  className="field"
                >
                  <option value="explorer">探索者（0-1000 粉）</option>
                  <option value="creator">共创者（1001 粉以上）</option>
                </select>
                <p className="mt-1 text-[10px] text-muted">
                  探索者 150/篇，每周上限 600；共创者 300/篇，每周上限 1200。
                  共创者需 1001 粉以上，且至少 2 篇小眼睛超 1500 的笔记。
                </p>
              </div>
              <div>
                <label className="label">每周发布篇数（上限 4）</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  aria-label="每周发布篇数" value={form.campaign_weekly_posts}
                  onChange={(event) =>
                    patch("campaign_weekly_posts", event.target.value)
                  }
                  className="field"
                />
                <p className="mt-1 text-[10px] text-muted">
                  规则每周最多 4 篇、每天最多 1 篇；默认排周一/三/五/六。
                </p>
              </div>
              <div>
                <label className="label">每天发布时间</label>
                <input
                  type="time"
                  aria-label="每天发布时间" value={form.campaign_time}
                  onChange={(event) =>
                    patch("campaign_time", event.target.value)
                  }
                  className="field"
                />
              </div>
              <div>
                <label className="label">正文最少字数</label>
                <input
                  type="number"
                  min={50}
                  max={800}
                  aria-label="正文最少字数" value={form.campaign_body_min}
                  onChange={(event) =>
                    patch("campaign_body_min", event.target.value)
                  }
                  className="field"
                />
                <p className="mt-1 text-[10px] text-muted">
                  活动要求至少 50 字，默认 220 更稳。
                </p>
              </div>
              <div>
                <label className="label">提前储备周数</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  aria-label="提前储备周数" value={form.campaign_buffer_weeks}
                  onChange={(event) =>
                    patch("campaign_buffer_weeks", event.target.value)
                  }
                  className="field"
                />
                <p className="mt-1 text-[10px] text-muted">
                  2 周 × 每周 4 篇 = 队列里保持 8 篇。
                </p>
              </div>
              <div>
                <label className="label">每批分析素材数</label>
                <input
                  type="number"
                  min={6}
                  max={45}
                  aria-label="每批分析素材数" value={form.campaign_batch_images}
                  onChange={(event) =>
                    patch("campaign_batch_images", event.target.value)
                  }
                  className="field"
                />
                <p className="mt-1 text-[10px] text-muted">
                  一次交给 AI 的图片上限，越大越容易凑成多篇。
                </p>
              </div>
              <div>
                <label className="label">每篇基础积分</label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  aria-label="每篇基础积分" value={form.campaign_points_per_post}
                  onChange={(event) =>
                    patch("campaign_points_per_post", event.target.value)
                  }
                  className="field"
                />
              </div>
              <div>
                <label className="label">每周积分上限</label>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  aria-label="每周积分上限" value={form.campaign_points_cap}
                  onChange={(event) =>
                    patch("campaign_points_cap", event.target.value)
                  }
                  className="field"
                />
                <p className="mt-1 text-[10px] text-muted">
                  探索者 600，共创者 1200；以官方发放为准。
                </p>
              </div>
              <div>
                <label className="label">开始日期（留空 = 明天）</label>
                <input
                  type="date"
                  min={todayStr()}
                  aria-label="开始日期" value={form.campaign_start_date}
                  onChange={(event) =>
                    patch("campaign_start_date", event.target.value)
                  }
                  className="field"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-brand/20 bg-brand-soft/40 px-4 py-3 text-[11px] leading-relaxed text-brand">
              活动硬性要求：图文至少 6 张图 + 50 字；每周最多 4 篇、每天最多 1
              篇。发布前会按你设置的「正文最少字数」
              {data.rules.minBody} 字和配图数一起校验。
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper/70 px-4 py-3">
              <p className="text-[11px] leading-relaxed text-muted">
                每篇 {points} 积分，本周上限 {cap} 积分 ≈{" "}
                {(cap / 10).toFixed(0)} 元
                {form.campaign_last_plan_at
                  ? ` · 上次生成 ${new Date(
                      form.campaign_last_plan_at
                    ).toLocaleString("zh-CN")}`
                  : ""}
              </p>
              <button
                onClick={() => plan(true)}
                disabled={Boolean(planning) || !canPlan}
                title={
                  missingImages
                    ? `活动图文至少 ${data.rules.minImages} 张，还差 ${missingImages} 张`
                    : undefined
                }
                className="btn-secondary btn-sm"
              >
                {planning === "all" ? (
                  <Spinner size={13} />
                ) : (
                  <Layers size={13} />
                )}
                {planning === "all" ? "正在全部排期…" : "全部排期"}
              </button>
            </div>
          </div>
        </section>

        <div className="space-y-5">
          <section
            className={cn(
              "card p-5 sm:p-6",
              tab !== "rules" && "hidden",
              data.issues.length > 0 && "border-amber-200"
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="section-title">规则体检</h2>
                <p className="mt-0.5 text-xs text-muted">
                  {data.issues.length
                    ? "硬性问题会阻止发布；灰色提示需要自查，不影响调度。"
                    : "没有发现配图、字数或排期方面的硬性不合规。"}
                </p>
              </div>
              <span
                className={cn(
                  "chip shrink-0",
                  data.issues.length ? "text-amber-700" : "text-emerald-600"
                )}
              >
                {data.issues.length
                  ? `${data.issues.length} 篇需自查`
                  : "通过"}
              </span>
            </div>
            {data.issues.length > 0 && (
              <ul className="space-y-2.5">
                {data.issues.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-2xl border border-line bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{item.title}</p>
                      <span className="shrink-0 text-[10px] text-muted">
                        {item.scheduledDate || "未排期"}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-amber-700">
                      {item.issues.map((issue) => (
                        <li key={issue}>· {issue}</li>
                      ))}
                    </ul>
                    {item.warnings.length > 0 && (
                      <ul className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-muted">
                        {item.warnings.map((warning) => (
                          <li key={warning}>自查：{warning}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {data.issues.some((item) => item.issues.length > 0) && (
              <p className="mt-2 text-[10px] leading-relaxed text-muted">
                建议先处理硬性问题，再开启「自动补齐队列」；否则新上传的素材可能被排成新作品。
              </p>
            )}
            {data.issues.length > 0 && (
              <Link
                href="/posts"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                去作品库修改
              </Link>
            )}
          </section>

          <section className={cn("card p-5 sm:p-6", tab !== "overview" && "hidden")}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="section-title">接下来发布</h2>
                <p className="mt-0.5 text-xs text-muted">
                  这里只预览活动队列，发布操作去发布中心处理。
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Link href="/publish" className="btn-ghost btn-sm">
                  发布中心
                </Link>
                <button
                  onClick={() => mutate()}
                  className="btn-ghost btn-sm"
                  aria-label="刷新"
                >
                  <RefreshCw size={13} />
                </button>
              </div>
            </div>

            {data.next.length ? (
              <ul className="space-y-2.5">
                {data.next.map((post) => (
                  <li
                    key={post.id}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-white p-2.5"
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
                        <div className="flex h-full w-full items-center justify-center text-muted">
                          <Images size={16} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {post.title}
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted">
                        {post.scheduledDate
                          ? formatCN(post.scheduledDate)
                          : "未排期"}{" "}
                        {post.scheduledTime || ""} · {post.images.length} 图 ·{" "}
                        {post.body.replace(/\s+/g, "").length} 字
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                      待发布
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
                <Rocket className="mx-auto mb-2 text-brand" size={20} />
                <p className="text-sm font-medium">队列还是空的</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  上传并勾选活动标签后，点「生成下一批」就会自动排期。
                </p>
                <Link
                  href="/campaign/inspiration"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  <Camera size={12} /> 不知道拍什么？看拍摄清单
                </Link>
              </div>
            )}
          </section>

          {lastPlan && (tab === "overview" || tab === "plan") && (
            <section className="card p-5 sm:p-6">
              <h2 className="section-title mb-3">本次结果</h2>
              <div className="flex flex-wrap gap-2 text-xs text-muted">
                <span className="chip">生成 {lastPlan.created.length} 篇</span>
                <span className="chip">新识别 {lastPlan.analyzed} 张</span>
                <span className="chip">剩余 {lastPlan.remaining} 张</span>
                {lastPlan.mock && <span className="chip">演示模式</span>}
              </div>
              {lastPlan.warnings.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-amber-700">
                  {lastPlan.warnings.map((warning, index) => (
                    <li key={`${index}-${warning}`}>· {warning}</li>
                  ))}
                </ul>
              )}
            </section>
          )}

          <section className={cn("card p-5 sm:p-6", tab !== "announcement" && "hidden")}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="section-title">群公告 / 本月收集表</h2>
                <p className="mt-0.5 text-xs text-muted">
                  每个月初把群公告粘贴进来，自动解析飞书收集表链接。
                </p>
              </div>
              {data.announcement.month && (
                <span className="chip shrink-0">{data.announcement.month}</span>
              )}
            </div>
            <textarea
              aria-label="群公告原文" value={announcementText}
              onChange={(event) => {
                setAnnouncementTouched(true);
                setAnnouncementText(event.target.value);
              }}
              rows={5}
              className="field resize-y text-xs"
              placeholder="粘贴群公告全文，包含飞书收集表链接…"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={parseAnnouncement}
                disabled={parsingAnnouncement || !announcementText.trim()}
                className="btn-primary btn-sm"
              >
                {parsingAnnouncement ? (
                  <Spinner size={13} />
                ) : (
                  <Sparkles size={13} />
                )}
                解析并保存
              </button>
              {data.announcement.at && (
                <span className="text-[10px] text-muted">
                  上次解析{" "}
                  {new Date(data.announcement.at).toLocaleString("zh-CN")}
                </span>
              )}
            </div>
            {data.announcement.links.length > 0 && (
              <div className="mt-3 space-y-2">
                {data.announcement.links.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-white px-3 py-2 text-xs transition hover:border-brand/30 hover:text-brand"
                  >
                    <span className="truncate">{link.label}</span>
                    <span className="shrink-0 text-[10px] text-muted">
                      打开 ↗
                    </span>
                  </a>
                ))}
              </div>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-muted">
              个人微信群没有稳定的官方接口，无法直接监控；把公告粘贴到这里即可。
              飞书表单暂不自动提交，先提供直达链接；群昵称记得改成「车型-小红书昵称」。
            </p>
          </section>

          <section className={cn("card p-5 sm:p-6", tab !== "rules" && "hidden")}>
            <h2 className="section-title mb-3">活动规则速览</h2>
            <ul className="space-y-2 text-[11px] leading-relaxed text-muted">
              <li>· 10 积分 = 1 元，奖励以活动页面为准。</li>
              <li>
                · 探索者：150 积分/篇，每周上限 600；共创者：300 积分/篇，每周上限
                1200。
              </li>
              <li>
                · 共创者门槛：1001 粉以上，且至少 2 篇小眼睛超 1500 的笔记；以官方晋级结果为准。
              </li>
              <li>
                · 共创者额外权益：官方账号展示、定向约稿、独立社群、线下培训/活动邀约等，以官方为准。
              </li>
              <li>· 每周最多 4 篇，每天最多 1 篇；图文至少 6 张图 + 50 字。</li>
              <li>
                · 视频至少 30 秒 + 20 字 + 高清；本工具目前只支持图文。
              </li>
              <li>
                · 官方话题：车型词 + AI 自动三选一赛道（#我的智系车 /
                #开车出去玩 / #车内躺平计划），每篇只带一组；旧 #有理想的生活
                已停用。
              </li>
              <li>
                · 图文需相符；图片实拍率 ≥80%，车辆相关内容至少 50%。
              </li>
              <li>
                · 2 篇小眼睛≥1500 只用于保级/升级共创者，无额外奖励；小眼睛 1
                万有神秘礼品，具体以官方为准。
              </li>
              <li>· 车型需与账号认证车型一致，认证手机号需与 App 手机号一致。</li>

              <li>
                · 必须真实原创，抄袭/搬运直接放弃活动资格；水贴会通知车主、不计入合格发帖且不支持修改。
              </li>
              <li>
                · 搬运、图文不符、同质化、流水账、商城种草、无实质内容、影视/游戏/行车记录仪占比高、AI
                痕迹、图片转视频，均按水帖处理，不计积分；水帖超 25% 取消资格。
              </li>
              <li>
                · 诋毁品牌、危险驾驶、刷量、提前删除/隐藏（需公开至活动结束后
                90 天）、PS/代写/抄袭/非本人笔记、负面或不实信息，不计分或取消资格。
              </li>
              <li>· 按自然周当天登记/上传，跨周跨月不计积分；重复上传只算一条。</li>
              <li>
                · 工具只负责排期和发布，发布前请自行确认内容符合活动要求。
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
