import { isValidDateString, normalizeHashtags } from "./content-rules";
import { todayStr } from "./utils";

export type ParsedEvent = {
  name: string;
  startDate: string;
  endDate: string;
  requiredTopics: string[];
  quota: number;
  countsWeekly: boolean;
  publishTime: string;
  minImages: number;
  minBody: number;
  collectionForm: string;
  collectionUrl: string;
  internal: boolean;
  officialAssets: boolean;
  brief: string;
  links: Array<{ label: string; url: string }>;
  warnings: string[];
};

function cleanLine(value: string) {
  return value
    .replace(/^[@＠]\S+\s*/g, "")
    .replace(/^[\s\-*•·]+/, "")
    .trim();
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function parseDateRange(text: string, year: number) {
  const pattern =
    /(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*(?:-|~|—|至|到)\s*(?:(\d{1,2})\s*月\s*)?(\d{1,2})\s*日?/;
  const match = text.match(pattern);
  if (!match) {
    const single = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (!single) return null;
    const month = Number(single[1]);
    const day = Number(single[2]);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
      2,
      "0"
    )}`;
    return isValidDateString(date) ? { start: date, end: date } : null;
  }
  const startMonth = Number(match[1]);
  const startDay = Number(match[2]);
  const endMonth = match[3] ? Number(match[3]) : startMonth;
  const endDay = Number(match[4]);
  const start = `${year}-${String(startMonth).padStart(2, "0")}-${String(
    startDay
  ).padStart(2, "0")}`;
  let end = `${year}-${String(endMonth).padStart(2, "0")}-${String(
    endDay
  ).padStart(2, "0")}`;
  if (
    endMonth === startMonth &&
    endDay < startDay &&
    !match[3]
  ) {
    end = `${year}-${String(startMonth + 1).padStart(2, "0")}-${String(
      endDay
    ).padStart(2, "0")}`;
  }
  if (!isValidDateString(start) || !isValidDateString(end)) return null;
  if (end < start) return { start, end: start };
  return { start, end };
}

function parseEventName(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);
  for (const line of lines) {
    if (/^【.*】/.test(line)) continue;
    if (/^@|^亲爱的|^各位/.test(line)) continue;
    const powerDay = line.match(/Power\s*Day\s*[：:]\s*(.+)$/i);
    if (powerDay) return powerDay[1].trim().replace(/[。；;]+$/, "");
  }
  for (const line of lines) {
    if (/^【.*】/.test(line)) continue;
    if (/发布会|活动|挑战|共创|征集/.test(line) && line.length <= 40) {
      return line.replace(/[。；;]+$/, "");
    }
  }
  return lines.find((line) => !/^@|^亲爱的|^各位/.test(line))?.slice(0, 40) || "临时活动";
}

function sectionAfter(text: string, label: string) {
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.includes(label));
  if (index < 0) return "";
  const sameLine = lines[index].split(label).slice(1).join(label).trim();
  if (sameLine) return sameLine.replace(/^[】:：\s]+/, "").trim();
  const next = lines[index + 1]?.trim() || "";
  return next.startsWith("【") ? "" : next;
}

function parseTopics(text: string, model: string) {
  const section =
    sectionAfter(text, "活动话题") ||
    sectionAfter(text, "话题") ||
    "";
  const withoutExamples = section
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/例如.*$/g, "")
    .trim();
  let topics = Array.from(withoutExamples.matchAll(/#([^\s#，,。；;、]+)/g)).map(
    (match) => match[1].trim()
  );
  const needsModel = /车型词/.test(section) || /车型词/.test(withoutExamples);
  topics = topics.map((topic) => (topic === "车型词" ? model : topic));
  if (needsModel && model && !topics.includes(model)) topics.push(model);
  return {
    topics: unique(normalizeHashtags(topics, 10)),
    needsModel,
  };
}

function parseQuota(text: string) {
  const match =
    text.match(/周期内\s*(\d+)\s*篇/) ||
    text.match(/最多\s*(\d+)\s*篇/) ||
    text.match(/(\d+)\s*篇/);
  const quota = match ? Number(match[1]) : 1;
  return Math.min(10, Math.max(1, Number.isFinite(quota) ? quota : 1));
}

function parseLinks(text: string) {
  const links: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const matches = line.match(/https?:\/\/[^\s]+/g);
    if (!matches) continue;
    for (const raw of matches) {
      const url = raw.replace(/[，。；、）)\]]+$/g, "");
      if (seen.has(url)) continue;
      seen.add(url);
      const label =
        line
          .replace(raw, "")
          .replace(/^[\s\-*•·]+/, "")
          .replace(/^\d+[.、)]\s*/, "")
          .replace(/^[：:\s]+/, "")
          .replace(/[\s:：]+$/g, "")
          .slice(0, 40) || "收集表";
      links.push({ label, url });
    }
  }
  return links;
}

export function parseEventAnnouncement(
  text: string,
  options: { model?: string; today?: string } = {}
): ParsedEvent {
  const raw = String(text || "").trim();
  const today = options.today || todayStr();
  const year = Number(today.slice(0, 4));
  const model = (options.model || "").trim().replace(/^#+/, "");
  const warnings: string[] = [];

  const dates = parseDateRange(raw, year);
  const name = parseEventName(raw);
  const topics = parseTopics(raw, model);
  const quota = parseQuota(raw);
  const countsWeekly = /不计入|不占|不参与/.test(raw)
    ? false
    : /计入.*周上限|占.*周上限/.test(raw)
    ? true
    : false;
  const collectionForm =
    sectionAfter(raw, "收集表选择") ||
    sectionAfter(raw, "收集表") ||
    "";
  const links = parseLinks(raw);
  const collectionUrl =
    links.find((link) =>
      /(form|feishu|lark|docs|shimo|jinshuju|wjx|收集)/i.test(link.url)
    )?.url ||
    links[0]?.url ||
    "";
  const internal = /内部活动|请勿截图|内部资料|截图外传/.test(raw);
  const officialAssets = /官方素材.*二创|二创|二次创作/.test(raw);
  const imageMatch =
    raw.match(/至少\s*(\d+)\s*张/) || raw.match(/(\d+)\s*张图/);
  const bodyMatch =
    raw.match(/至少\s*(\d+)\s*字/) ||
    raw.match(/不少于\s*(\d+)\s*字/) ||
    raw.match(/(\d+)\s*字/);
  const timeMatch = raw.match(
    /(?:发帖时间|发布时间|建议发布)[:：\s]*([01]?\d|2[0-3]):([0-5]\d)/
  );
  const publishTime = timeMatch
    ? `${String(timeMatch[1]).padStart(2, "0")}:${timeMatch[2]}`
    : /今晚|直播|发布会/.test(raw)
    ? "21:30"
    : "19:30";
  const minImages = imageMatch ? Number(imageMatch[1]) : 6;
  const minBody = bodyMatch ? Number(bodyMatch[1]) : 50;

  if (!dates) {
    warnings.push("没有识别到活动日期，已默认从今天开始，请手动修改");
  }
  if (!topics.topics.length) {
    warnings.push("没有识别到活动话题，请手动补充");
  }
  if (topics.needsModel && !model) {
    warnings.push("公告要求车型词，但当前活动没有配置车型词，请手动补充");
  }
  if (!collectionForm) {
    warnings.push("没有识别到收集表名称，请手动补充");
  }
  if (dates && dates.end < today) {
    warnings.push("识别到的活动结束日期早于今天，请确认是否已结束");
  }

  return {
    name,
    startDate: dates?.start || today,
    endDate: dates?.end || today,
    requiredTopics: topics.topics,
    quota,
    countsWeekly,
    publishTime,
    minImages: Math.max(1, Math.min(9, Number.isFinite(minImages) ? minImages : 6)),
    minBody: Math.max(1, Math.min(1000, Number.isFinite(minBody) ? minBody : 50)),
    collectionForm,
    collectionUrl,
    internal,
    officialAssets,
    brief: raw.slice(0, 8000),
    links,
    warnings,
  };
}
