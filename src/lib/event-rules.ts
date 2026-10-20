import type { Event, Post } from "./types";
import { charLength, normalizeHashtags } from "./content-rules";
import { formatCN, todayStr } from "./utils";

export type EventPhase = "upcoming" | "active" | "ended";

export function eventPhase(event: Event, today = todayStr()): EventPhase {
  if (today < event.startDate) return "upcoming";
  if (today > event.endDate) return "ended";
  return "active";
}

export function eventPhaseLabel(event: Event, today = todayStr()) {
  const phase = eventPhase(event, today);
  if (phase === "upcoming") return "即将开始";
  if (phase === "ended") return "已结束";
  return "进行中";
}

export function eventPhaseTone(event: Event, today = todayStr()) {
  const phase = eventPhase(event, today);
  if (phase === "upcoming") return "amber" as const;
  if (phase === "ended") return "stone" as const;
  return "emerald" as const;
}

export function eventDateRange(event: Event) {
  if (event.startDate === event.endDate) return formatCN(event.startDate);
  return `${formatCN(event.startDate)} - ${formatCN(event.endDate)}`;
}

export function normalizeEventTopics(topics: string[]) {
  return normalizeHashtags(topics, 20);
}

export function missingEventTopics(post: Post, event: Event) {
  const tags = new Set(normalizeHashtags(post.hashtags, 20));
  return normalizeEventTopics(event.requiredTopics).filter(
    (topic) => !tags.has(topic)
  );
}

export function eventPostWarnings(post: Post, event: Event) {
  if (!post.eventId || post.eventId !== event.id) return [];
  const warnings: string[] = [];
  if (event.internal) {
    warnings.push("内部活动：请勿把群聊、直播或内部资料截图外传");
  }
  if (event.officialAssets) {
    warnings.push("官方素材需要二创，不要直接搬运官方海报或原片");
  }
  warnings.push("发布前请确认收集表已选择正确活动，并按要求登记小眼睛");
  return warnings;
}

export function eventPostIssues(post: Post, event: Event): string[] {
  const issues: string[] = [];
  if (!post.eventId || post.eventId !== event.id) {
    issues.push("作品没有关联当前活动");
    return issues;
  }
  if (post.images.length < event.minImages) {
    issues.push(
      `配图 ${post.images.length} 张，活动要求至少 ${event.minImages} 张`
    );
  }
  const bodyLength = charLength(post.body.replace(/\s+/g, ""));
  if (bodyLength < event.minBody) {
    issues.push(
      `正文 ${bodyLength} 字，活动要求至少 ${event.minBody} 字`
    );
  }
  const missing = missingEventTopics(post, event);
  if (missing.length) {
    issues.push(
      `缺少活动话题：${missing.map((topic) => `#${topic}`).join(" ")}`
    );
  }
  if (post.scheduledDate) {
    if (post.scheduledDate < event.startDate) {
      issues.push(`排期早于活动开始日期 ${event.startDate}`);
    }
    if (post.scheduledDate > event.endDate) {
      issues.push(`排期晚于活动结束日期 ${event.endDate}`);
    }
  }
  return issues;
}

export function eventPublishBlockers(
  post: Post,
  event: Event,
  otherActivePosts = 0,
  today = todayStr()
): { errors: string[]; warnings: string[] } {
  const phase = eventPhase(event, today);
  const errors: string[] = [];
  if (phase === "upcoming") {
    errors.push(`活动尚未开始（${event.startDate} 开始）`);
  }
  if (phase === "ended") {
    errors.push(`活动已于 ${event.endDate} 结束`);
  }
  if (otherActivePosts >= event.quota) {
    errors.push(
      `活动周期内只能发布 ${event.quota} 篇，当前已有 ${otherActivePosts} 篇待发/已发布`
    );
  }
  errors.push(...eventPostIssues(post, event));
  return {
    errors: Array.from(new Set(errors)),
    warnings: eventPostWarnings(post, event),
  };
}
