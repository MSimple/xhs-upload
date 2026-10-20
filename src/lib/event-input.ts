import {
  isValidDateString,
  isValidTimeString,
  isHttpUrl,
  normalizeHashtags,
  XHS_HASHTAGS_MAX,
} from "./content-rules";
import type { Event } from "./types";

export type EventPatch = {
  name?: string;
  startDate?: string;
  endDate?: string;
  requiredTopics?: string[];
  quota?: number;
  countsWeekly?: boolean;
  publishTime?: string;
  minImages?: number;
  minBody?: number;
  collectionForm?: string;
  collectionUrl?: string;
  internal?: boolean;
  officialAssets?: boolean;
  brief?: string;
  note?: string;
};

const has = (body: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(body, key);

export function parseEventPatch(
  body: Record<string, unknown>,
  options: { requireName?: boolean } = {}
): { patch: EventPatch; errors: string[] } {
  const patch: EventPatch = {};
  const errors: string[] = [];

  if (has(body, "name") || options.requireName) {
    const name = String(body.name || "").trim().slice(0, 60);
    if (!name) errors.push("活动名称不能为空");
    else patch.name = name;
  }

  if (has(body, "startDate") || has(body, "endDate")) {
    const startDate = String(body.startDate ?? "").trim();
    const endDate = String(body.endDate ?? "").trim();
    if (!isValidDateString(startDate)) {
      errors.push("活动开始日期不合法");
    } else if (!isValidDateString(endDate)) {
      errors.push("活动结束日期不合法");
    } else if (endDate < startDate) {
      errors.push("活动结束日期不能早于开始日期");
    } else {
      patch.startDate = startDate;
      patch.endDate = endDate;
    }
  }

  if (has(body, "requiredTopics")) {
    if (!Array.isArray(body.requiredTopics)) {
      errors.push("活动话题格式不正确");
    } else {
      const topics = normalizeHashtags(body.requiredTopics, 20);
      if (topics.length > XHS_HASHTAGS_MAX) {
        errors.push(`活动话题最多 ${XHS_HASHTAGS_MAX} 个`);
      } else {
        patch.requiredTopics = topics;
      }
    }
  }

  if (has(body, "quota")) {
    const value = Number(body.quota);
    if (!Number.isFinite(value)) {
      errors.push("活动篇数格式不正确");
    } else {
      patch.quota = Math.min(10, Math.max(1, Math.round(value)));
    }
  }

  if (has(body, "countsWeekly")) {
    patch.countsWeekly = Boolean(body.countsWeekly);
  }

  if (has(body, "publishTime")) {
    const value = String(body.publishTime || "").trim();
    if (!isValidTimeString(value)) {
      errors.push("建议发布时间应为 HH:mm");
    } else {
      patch.publishTime = value;
    }
  }

  if (has(body, "minImages")) {
    const value = Number(body.minImages);
    if (!Number.isFinite(value)) errors.push("最少配图数格式不正确");
    else patch.minImages = Math.min(9, Math.max(1, Math.round(value)));
  }

  if (has(body, "minBody")) {
    const value = Number(body.minBody);
    if (!Number.isFinite(value)) errors.push("最少字数格式不正确");
    else patch.minBody = Math.min(1000, Math.max(1, Math.round(value)));
  }

  if (has(body, "collectionForm")) {
    patch.collectionForm = String(body.collectionForm || "").trim().slice(0, 100);
  }

  if (has(body, "collectionUrl")) {
    const url = String(body.collectionUrl || "").trim();
    if (url && !isHttpUrl(url)) {
      errors.push("收集表链接必须是 http(s) 地址");
    } else {
      patch.collectionUrl = url;
    }
  }

  if (has(body, "internal")) patch.internal = Boolean(body.internal);
  if (has(body, "officialAssets")) {
    patch.officialAssets = Boolean(body.officialAssets);
  }
  if (has(body, "brief")) {
    patch.brief = String(body.brief || "").slice(0, 8000);
  }
  if (has(body, "note")) {
    patch.note = String(body.note || "").slice(0, 2000);
  }

  return { patch, errors };
}

export function eventToPatch(event: Event): EventPatch {
  return {
    name: event.name,
    startDate: event.startDate,
    endDate: event.endDate,
    requiredTopics: event.requiredTopics,
    quota: event.quota,
    countsWeekly: event.countsWeekly,
    publishTime: event.publishTime,
    minImages: event.minImages,
    minBody: event.minBody,
    collectionForm: event.collectionForm,
    collectionUrl: event.collectionUrl,
    internal: event.internal,
    officialAssets: event.officialAssets,
    brief: event.brief,
    note: event.note,
  };
}
