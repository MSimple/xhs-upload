import clsx, { type ClassValue } from "clsx";
import { XHS_HASHTAGS_MAX } from "./content-rules";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayStr() {
  return toDateStr(new Date());
}

export function parseDateStr(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(value: string, days: number) {
  const d = parseDateStr(value);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function formatCN(value: string | null | undefined, withYear = false) {
  if (!value) return "";
  const d = parseDateStr(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${withYear ? `${d.getFullYear()}年` : ""}${d.getMonth() + 1}月${d.getDate()}日`;
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return formatDateTime(iso).slice(0, 10);
}

export function monthMatrix(month: string) {
  // month: YYYY-MM
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday start
  const start = new Date(y, m - 1, 1 - offset);
  const cells: { date: string; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ds = toDateStr(d);
    cells.push({ date: ds, inMonth: d.getMonth() === m - 1 });
  }
  return cells;
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${y} 年 ${m} 月`;
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export const STATUS_LABEL: Record<string, string> = {
  unused: "未使用",
  reserved: "已排期",
  used: "已使用",
  draft: "草稿",
  ready: "待发布",
  published: "已发布",
};

export function parseHashtags(input: string, limit = XHS_HASHTAGS_MAX) {
  return Array.from(
    new Set(
      input
        .split(/[\s#，,]+/)
        .map((t) => t.trim().replace(/^#+/, ""))
        .filter(Boolean)
    )
  ).slice(0, limit);
}

export function fullCopy(post: {
  title: string;
  body: string;
  hashtags: string[];
}) {
  const tags = post.hashtags.map((t) => `#${t}`).join(" ");
  return `${post.title}\n\n${post.body}${tags ? `\n\n${tags}` : ""}`;
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 11) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export function colorForStatus(status: string) {
  if (status === "published") return "bg-emerald-500";
  if (status === "ready") return "bg-amber-500";
  return "bg-stone-400";
}
