"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Camera,
  FileText,
  Images,
  LayoutDashboard,
  Megaphone,
  Menu,
  Send,
  Settings,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Modal } from "@/components/ui";
import { cn, todayStr, formatCN } from "@/lib/utils";
import { fetcher } from "@/lib/client";
import type { CampaignProgress } from "@/lib/types";

type NavItem = {
  href: string;
  label: string;
  short?: string;
  description?: string;
  icon: typeof LayoutDashboard;
};

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "总览",
    items: [
      { href: "/", label: "工作台", short: "工作台", icon: LayoutDashboard },
    ],
  },
  {
    label: "内容创作",
    items: [
      { href: "/library", label: "素材库", short: "素材", icon: Images },
      { href: "/campaign", label: "创作营", short: "创作", icon: Trophy },
      {
        href: "/events",
        label: "活动",
        short: "活动",
        description: "Power Day、发布会与群里的临时任务",
        icon: Megaphone,
      },
      {
        href: "/campaign/inspiration",
        label: "拍什么",
        short: "拍什么",
        icon: Camera,
      },
    ],
  },
  {
    label: "发布运营",
    items: [
      { href: "/posts", label: "作品库", short: "作品", icon: FileText },
      {
        href: "/publish",
        label: "发布中心",
        short: "发布",
        description: "今日队列、失败重试与最近发布",
        icon: Send,
      },
      {
        href: "/calendar",
        label: "发布日历",
        short: "日历",
        description: "月视图与待排期",
        icon: CalendarDays,
      },
    ],
  },
  {
    label: "数据洞察",
    items: [
      {
        href: "/insights",
        label: "数据看板",
        short: "数据",
        description: "账号指标、笔记与粉丝",
        icon: BarChart3,
      },
    ],
  },
  {
    label: "系统",
    items: [
      {
        href: "/settings",
        label: "设置",
        short: "设置",
        description: "账号、模型与环境",
        icon: Settings,
      },
    ],
  },
];

const MOBILE_PRIMARY: NavItem[] = [
  { href: "/", label: "工作台", icon: LayoutDashboard },
  { href: "/library", label: "素材", icon: Images },
  { href: "/campaign", label: "创作", icon: Trophy },
  { href: "/posts", label: "作品", icon: FileText },
];

const MOBILE_MORE: NavItem[] = [
  {
    href: "/events",
    label: "活动",
    description: "临时活动、截止时间与收集表",
    icon: Megaphone,
  },
  {
    href: "/publish",
    label: "发布中心",
    description: "今日队列、失败重试与最近发布",
    icon: Send,
  },
  {
    href: "/calendar",
    label: "发布日历",
    description: "月视图、待排期与从某天开始排期",
    icon: CalendarDays,
  },
  {
    href: "/campaign/inspiration",
    label: "拍什么",
    description: "素材缺口与可直接照拍的清单",
    icon: Camera,
  },
  {
    href: "/insights",
    label: "数据看板",
    description: "账号指标、笔记明细与粉丝画像",
    icon: BarChart3,
  },
  {
    href: "/settings",
    label: "设置",
    description: "账号与发布、AI 模型、环境与数据",
    icon: Settings,
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-3">
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_10px_24px_-10px_rgba(200,30,58,0.9)]">
        <Sparkles size={19} strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block font-display text-[17px] font-semibold tracking-tight">
            薯光工坊
          </span>
          <span className="block text-[9px] font-medium uppercase tracking-[0.22em] text-muted">
            Xiaohongshu Studio
          </span>
        </span>
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";
  const [moreOpen, setMoreOpen] = useState(false);

  const { data } = useSWR<{
    configured: boolean;
    hasApiKey: boolean;
    settings: { xhs_scheduler: string };
  }>(isLogin ? null : "/api/settings", fetcher, {
    revalidateOnFocus: false,
  });
  const configured = data?.configured ?? false;
  const settingsLoading = !data;
  const schedulerOn = data?.settings?.xhs_scheduler === "1";

  const { data: campaignProgress } = useSWR<{ progress: CampaignProgress }>(
    isLogin ? null : "/api/campaign/progress",
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5000 }
  );

  const { data: xhsStatus } = useSWR<{
    loggedIn: boolean | null;
    loginInProgress: boolean;
    publishing: boolean;
    syncing: boolean;
    profileExists: boolean;
  }>(isLogin ? null : "/api/xhs/status", fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 5000,
  });

  if (isLogin) {
    return <div className="min-h-screen">{children}</div>;
  }

  const modeLabel = settingsLoading
    ? "检测中"
    : configured
    ? "AI 已配置"
    : "演示模式";
  const modeHint = settingsLoading
    ? "正在读取模型配置"
    : configured
    ? "图片识别与文案生成已配置"
    : "配置模型后开启真实图片识别";

  let xhsLabel = "小红书未登录";
  let xhsDot = "bg-stone-300";
  if (xhsStatus?.publishing) {
    xhsLabel = "正在发布";
    xhsDot = "bg-brand";
  } else if (xhsStatus?.loginInProgress) {
    xhsLabel = "等待登录";
    xhsDot = "bg-amber-500";
  } else if (xhsStatus?.loggedIn === true) {
    xhsLabel = "小红书已连接";
    xhsDot = "bg-emerald-500";
  } else if (xhsStatus?.loggedIn === false) {
    xhsLabel = "登录已失效";
    xhsDot = "bg-red-500";
  } else if (xhsStatus?.profileExists) {
    xhsLabel = "登录待检测";
    xhsDot = "bg-amber-500";
  }

  const progress = campaignProgress?.progress;
  let activeTask: { href: string; title: string; detail: string } | null = null;
  if (progress?.running) {
    const title =
      progress.phase === "analyzing"
        ? "正在识别活动素材"
        : progress.phase === "planning"
        ? "正在策划活动笔记"
        : progress.phase === "creating"
        ? "正在生成发布排期"
        : "正在准备活动排期";
    const detail =
      progress.created > 0
        ? `已生成 ${progress.created} 篇`
        : progress.remaining > 0
        ? `剩余 ${progress.remaining} 张素材`
        : "正在处理";
    activeTask = { href: "/campaign", title, detail };
  } else if (xhsStatus?.publishing) {
    activeTask = {
      href: "/publish",
      title: "正在自动发布笔记",
      detail: "发布到小红书",
    };
  } else if (xhsStatus?.syncing) {
    activeTask = {
      href: "/insights",
      title: "正在同步创作数据",
      detail: "读取创作中心",
    };
  } else if (xhsStatus?.loginInProgress) {
    activeTask = {
      href: "/settings",
      title: "等待小红书登录",
      detail: "请在浏览器窗口完成",
    };
  }

  const moreActive = MOBILE_MORE.some((item) =>
    isActive(pathname, item.href)
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed bottom-4 left-4 top-4 z-40 hidden w-[232px] flex-col rounded-[1.9rem] border border-line bg-white/85 p-4 shadow-soft backdrop-blur-xl lg:flex">
        <div className="px-2 pb-4 pt-1">
          <Brand />
        </div>

        <nav className="thin-scroll flex-1 overflow-y-auto pr-0.5">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mb-1">
              <p className="px-3.5 pb-1.5 pt-3 text-[9px] font-medium uppercase tracking-[0.18em] text-muted/60">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition-all",
                        active
                          ? "bg-ink font-medium text-white shadow-[0_8px_20px_-12px_rgba(31,28,26,0.9)]"
                          : "text-muted hover:bg-paper hover:text-ink"
                      )}
                    >
                      <Icon
                        size={17}
                        className={cn(
                          "transition",
                          active
                            ? "text-brand-soft"
                            : "text-muted group-hover:text-ink"
                        )}
                      />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-3 space-y-2 rounded-2xl border border-line bg-paper/70 p-3.5">
          <Link
            href="/settings"
            className="flex items-center gap-2 text-xs"
            title={modeHint}
          >
            <span
              className={cn(
                "relative flex h-2 w-2",
                settingsLoading
                  ? "text-stone-400"
                  : configured
                  ? "text-emerald-500"
                  : "text-amber-500"
              )}
            >
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
            <span className="font-medium text-ink">{modeLabel}</span>
            <Settings size={12} className="ml-auto text-muted" />
          </Link>
          <Link href="/settings" className="flex items-center gap-2 text-xs">
            <span className={cn("h-2 w-2 rounded-full", xhsDot)} />
            <span className="font-medium text-ink">{xhsLabel}</span>
            <span className="ml-auto text-[9px] text-muted">
              {schedulerOn ? "自动发布开" : "自动发布关"}
            </span>
          </Link>
          <p className="text-[10px] leading-relaxed text-muted">{modeHint}</p>
        </div>

        <p className="px-1 pt-3 text-[10px] tracking-wide text-muted/70">
          {formatCN(todayStr(), true)} · 记录生活
        </p>
      </aside>

      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-paper/80 px-4 py-3 backdrop-blur-xl lg:hidden">
        <Brand compact />
        <div className="flex items-center gap-1">
          <span className="mr-1 flex items-center gap-1.5 rounded-full border border-line bg-white px-2.5 py-1 text-[10px] text-muted">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                settingsLoading
                  ? "bg-stone-400"
                  : configured
                  ? "bg-emerald-500"
                  : "bg-amber-500"
              )}
            />
            {configured ? "AI 已配置" : "演示模式"}
          </span>
          <Link
            href="/settings"
            className="rounded-full border border-line bg-white p-2 text-muted"
            aria-label="设置"
          >
            <Settings size={16} />
          </Link>
        </div>
      </header>

      <div className="lg:pl-[264px]">
        <main className="mx-auto w-full max-w-[1380px] px-4 pb-28 pt-5 sm:px-6 lg:px-9 lg:pb-12 lg:pt-9">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-[1.6rem] border border-line bg-white/90 px-1.5 py-2 shadow-lift backdrop-blur-xl lg:hidden">
        {MOBILE_PRIMARY.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[10px] transition",
                active ? "text-brand" : "text-muted"
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-10 items-center justify-center rounded-xl transition",
                  active ? "bg-brand-soft" : ""
                )}
              >
                <Icon size={18} />
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="打开更多菜单"
          className={cn(
            "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-2xl py-1.5 text-[10px] transition",
            moreActive ? "text-brand" : "text-muted"
          )}
        >
          <span
            className={cn(
              "flex h-8 w-10 items-center justify-center rounded-xl transition",
              moreActive ? "bg-brand-soft" : ""
            )}
          >
            <Menu size={18} />
          </span>
          更多
        </button>
      </nav>

      <Modal
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="更多"
        subtitle="发布、数据与系统"
        size="sm"
      >
        <div className="grid grid-cols-1 gap-2 p-5 sm:grid-cols-2 sm:p-6">
          {MOBILE_MORE.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl border p-3.5 transition",
                  active
                    ? "border-brand/30 bg-brand-soft/40"
                    : "border-line bg-white hover:border-brand/20 hover:bg-paper/50"
                )}
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper text-brand">
                  <Icon size={16} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{item.label}</span>
                  <span className="mt-0.5 block text-[10px] leading-relaxed text-muted">
                    {item.description}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </Modal>

      {activeTask && (
        <Link
          href={activeTask.href}
          aria-live="polite"
          className="fixed bottom-24 left-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-full border border-line bg-white/95 px-4 py-2.5 text-xs shadow-lift backdrop-blur-xl transition hover:border-brand/30 lg:bottom-6 lg:left-[264px]"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
          </span>
          <span className="font-medium">{activeTask.title}</span>
          {activeTask.detail && (
            <span className="hidden max-w-[180px] truncate text-[10px] text-muted sm:inline">
              {activeTask.detail}
            </span>
          )}
          <ArrowUpRight size={12} className="shrink-0 text-muted" />
        </Link>
      )}
    </div>
  );
}
