export const XHS_TITLE_MAX = 20;
export const XHS_BODY_MAX = 1000;
export const XHS_HASHTAGS_MAX = 10;

export const POST_STATUSES = ["draft", "ready", "published"] as const;
export type PostStatusValue = (typeof POST_STATUSES)[number];

export function charLength(value: string) {
  return Array.from(value || "").length;
}

export function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function isPostStatus(value: unknown): value is PostStatusValue {
  return typeof value === "string" && (POST_STATUSES as readonly string[]).includes(value);
}

export function isValidDateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidMonthString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeHashtags(input: unknown, limit = XHS_HASHTAGS_MAX): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((item) => String(item || "").trim().replace(/^#+/, "").trim())
        .filter(Boolean)
    )
  ).slice(0, limit);
}

export function hashtagLine(hashtags: string[]) {
  return hashtags.map((tag) => `#${tag}`).join(" ");
}

export function publishedBodyLimit(hashtags: string[]) {
  const tags = hashtagLine(hashtags);
  return Math.max(
    0,
    XHS_BODY_MAX - (tags ? charLength(tags) + 2 : 0)
  );
}

export function validatePostContent(input: {
  title: string;
  body: string;
  hashtags: string[];
}): string[] {
  const errors: string[] = [];
  const title = input.title.trim();
  const body = input.body || "";
  const hashtags = input.hashtags || [];

  if (!title) errors.push("标题不能为空");
  if (charLength(title) > XHS_TITLE_MAX) {
    errors.push(`标题最多 ${XHS_TITLE_MAX} 个字，当前 ${charLength(title)} 个`);
  }
  if (charLength(body) > XHS_BODY_MAX) {
    errors.push(`正文最多 ${XHS_BODY_MAX} 个字，当前 ${charLength(body)} 个`);
  }
  if (hashtags.length > XHS_HASHTAGS_MAX) {
    errors.push(`标签最多 ${XHS_HASHTAGS_MAX} 个，当前 ${hashtags.length} 个`);
  }
  const tags = hashtagLine(hashtags);
  const total = charLength(body) + (tags ? charLength(tags) + 2 : 0);
  if (total > XHS_BODY_MAX) {
    errors.push(
      `正文加标签共 ${total} 字，超过小红书 ${XHS_BODY_MAX} 字限制，请删减 ${total - XHS_BODY_MAX} 字`
    );
  }
  return errors;
}
