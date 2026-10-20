import type {
  PlatformDiagnosisItem,
  PlatformFans,
  PlatformMetrics,
  PlatformNoteRow,
} from "./types";

export type PlatformViewMetrics = Pick<
  PlatformMetrics,
  | "period"
  | "exposure"
  | "views"
  | "coverCtr"
  | "averageWatch"
  | "totalWatch"
  | "completion"
>;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clean(value: string | null | undefined) {
  return (value || "").trim();
}

function sliceBetween(text: string, start: string, end: string) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) return "";
  const endIndex = text.indexOf(end, startIndex + start.length);
  return text.slice(startIndex, endIndex > startIndex ? endIndex : undefined);
}

function pick(block: string, label: string) {
  const match = block.match(
    new RegExp(`${escapeRegExp(label)}\\s*([^\\n]+)`)
  );
  return clean(match?.[1]) || "—";
}

function parsePeriod(block: string) {
  const match = block.match(
    /统计周期\s*([0-9]{2}-[0-9]{2}\s*至\s*[0-9]{2}-[0-9]{2})/
  );
  return clean(match?.[1]) || "—";
}

function parseNumber(value: string) {
  return Number(String(value).replace(/[,，\s]/g, "")) || 0;
}

export function parseAccount(text: string) {
  const match = text.match(
    /([\d,]+)\s*关注数\s*([\d,]+)\s*粉丝数\s*([\d,]+)\s*获赞与收藏/
  );
  const status = text.match(/账号状态\s*([^\s\n]{1,10})/)?.[1] || "正常";
  return {
    following: parseNumber(match?.[1] || "0"),
    followers: parseNumber(match?.[2] || "0"),
    likesCollects: parseNumber(match?.[3] || "0"),
    status,
  };
}

export function parseHomeMetrics(text: string): PlatformMetrics {
  const block =
    sliceBetween(text, "笔记数据总览", "最新笔记") || text;
  return {
    period: parsePeriod(block),
    exposure: pick(block, "曝光数"),
    views: pick(block, "观看数"),
    coverCtr: pick(block, "封面点击率"),
    averageWatch: "—",
    totalWatch: "—",
    completion: pick(block, "视频完播率"),
    likes: pick(block, "点赞数"),
    comments: pick(block, "评论数"),
    collects: pick(block, "收藏数"),
    shares: pick(block, "分享数"),
    netFollowers: pick(block, "净涨粉"),
    newFollowers: pick(block, "新增关注"),
    unfollows: pick(block, "取消关注"),
    homepageVisitors: pick(block, "主页访客"),
  };
}

export function parseViewMetrics(text: string): PlatformViewMetrics {
  const block = sliceBetween(text, "数据总览", "观看来源") || text;
  return {
    period: parsePeriod(block),
    exposure: pick(block, "曝光数"),
    views: pick(block, "观看数"),
    coverCtr: pick(block, "封面点击率"),
    averageWatch: pick(block, "平均观看时长"),
    totalWatch: pick(block, "观看总时长"),
    completion: pick(block, "视频完播率"),
  };
}

export function mergePlatformMetrics(
  home: PlatformMetrics,
  view: PlatformViewMetrics
): PlatformMetrics {
  const prefer = (primary: string, fallback: string) =>
    primary && primary !== "—" ? primary : fallback;
  return {
    ...home,
    period: prefer(view.period, home.period),
    exposure: prefer(view.exposure, home.exposure),
    views: prefer(view.views, home.views),
    coverCtr: prefer(view.coverCtr, home.coverCtr),
    completion: prefer(view.completion, home.completion),
    averageWatch: prefer(view.averageWatch, home.averageWatch),
    totalWatch: prefer(view.totalWatch, home.totalWatch),
  };
}

export function parseDiagnosis(text: string): PlatformDiagnosisItem[] {
  const items: PlatformDiagnosisItem[] = [];
  const seen = new Set<string>();
  const pattern =
    /(观看数|涨粉数|主页访客数|发布数|互动数)：\s*你的(?:观看数|涨粉数|主页访客数|发布数|互动数)为\s*([\d,]+)\s*([^\n]*)/g;
  for (const match of text.matchAll(pattern)) {
    const label = match[1];
    if (seen.has(label)) continue;
    seen.add(label);
    const percentile = match[3].match(/超过\s*(\d+)%/);
    items.push({
      label,
      value: match[2],
      percentile: percentile ? Number(percentile[1]) : null,
    });
  }
  return items;
}

export function parseFans(text: string): PlatformFans {
  const total = text.match(/总粉丝数\s*([\d,]+)/)?.[1] || "0";
  const newFans = text.match(/新增粉丝数\s*([\d,]+)/)?.[1] || "0";
  const lostFans = text.match(/流失粉丝数\s*([\d,]+)/)?.[1] || "0";
  let male: number | null = null;
  let female: number | null = null;
  for (const match of text.matchAll(/(男性|女性)\s*(\d+)%/g)) {
    if (match[1] === "男性") male = Number(match[2]);
    else female = Number(match[2]);
  }
  const interestBlock = sliceBetween(text, "兴趣分布", "地域分布");
  const interests = Array.from(
    new Set(
      interestBlock
        .split(/\n+/)
        .map((line) => line.trim())
        .filter((line) => line && line !== "兴趣分布" && !line.includes("暂无"))
    )
  ).slice(0, 12);

  const regionLine =
    text
      .split(/\n+/)
      .map((line) => line.trim())
      .find((line) => line.includes("完整地域数据")) || "";
  const sourceBlock = sliceBetween(text, "粉丝来源", "我的活跃粉丝");
  const sourceNote = sourceBlock.includes("暂无数据") ? "暂无数据" : "—";
  const activeNote = text.includes("最近还没有粉丝和你互动")
    ? "最近还没有粉丝互动"
    : "—";

  return {
    range: "近7天",
    total: parseNumber(total),
    newFans: parseNumber(newFans),
    lostFans: parseNumber(lostFans),
    male,
    female,
    interests,
    regionNote: regionLine || "完整地域数据需在小红书 App 查看",
    sourceNote,
    activeNote,
  };
}

export function parseNotes(rows: string[][]): PlatformNoteRow[] {
  const notes: PlatformNoteRow[] = [];
  for (const row of rows) {
    if (!row || row.length < 2) continue;
    const infoLines = row[0]
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const title =
      infoLines.find(
        (line) =>
          line !== "置顶" &&
          line !== "仅自己可见" &&
          !line.startsWith("发布于")
      ) || "";
    if (!title || title === "笔记基础信息") continue;
    const dateLine = infoLines.find((line) => line.startsWith("发布于")) || "";
    const publishedAt = dateLine.replace(/^发布于\s*/, "");
    const cells = row.slice(1, 11).map((cell) => clean(cell) || "—");
    notes.push({
      title,
      publishedAt,
      exposure: cells[0] || "—",
      views: cells[1] || "—",
      coverCtr: cells[2] || "—",
      likes: cells[3] || "—",
      comments: cells[4] || "—",
      collects: cells[5] || "—",
      follows: cells[6] || "—",
      shares: cells[7] || "—",
      avgWatch: cells[8] || "—",
      danmaku: cells[9] || "—",
    });
  }
  return notes;
}

export function parseNotesTotal(text: string) {
  const match = text.match(/共\s*([\d,]+)\s*条/);
  return parseNumber(match?.[1] || "0");
}

export function parseNoteCount(text: string) {
  const match = text.match(/全部\s*([\d,]+)/);
  return parseNumber(match?.[1] || "0");
}
