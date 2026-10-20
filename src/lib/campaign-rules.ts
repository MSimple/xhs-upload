import type { Photo, Post, Settings } from "./types";
import { charLength } from "./content-rules";

export const CAMPAIGN_MIN_IMAGES = 6;
export const CAMPAIGN_MIN_BODY = 50;
export const CAMPAIGN_MAX_WEEKLY_POSTS = 4;

export const CAMPAIGN_TRACKS = [
  "我的智系车",
  "开车出去玩",
  "车内躺平计划",
] as const;

export function campaignWeeklyCap(settings: Settings): number {
  return Math.max(
    1,
    Math.min(
      CAMPAIGN_MAX_WEEKLY_POSTS,
      Number(settings.campaign_weekly_posts) || CAMPAIGN_MAX_WEEKLY_POSTS
    )
  );
}

export function campaignModel(settings: Settings): string {
  return (settings.campaign_model || "").trim().replace(/^#+/, "");
}

export function campaignBodyMin(settings: Settings): number {
  const value = Number(settings.campaign_body_min);
  if (!Number.isFinite(value)) return 220;
  return Math.min(800, Math.max(CAMPAIGN_MIN_BODY, Math.round(value)));
}

const TRACK_KEYWORDS: Record<string, string[]> = {
  我的智系车: [
    "智驾",
    "辅助驾驶",
    "NOA",
    "HUD",
    "中控",
    "屏幕",
    "语音",
    "导航",
    "仪表",
    "科技",
    "自动泊车",
    "智能",
  ],
  开车出去玩: [
    "自驾",
    "出游",
    "露营",
    "郊外",
    "旅行",
    "公园",
    "周末",
    "野餐",
    "高速",
    "后备箱",
    "风景",
    "出逃",
    "回村",
  ],
  车内躺平计划: [
    "躺",
    "座椅",
    "午休",
    "后排",
    "空间",
    "冰箱",
    "天幕",
    "毯子",
    "休息",
    "睡觉",
    "放松",
    "零重力",
  ],
};

export function pickCampaignTrack(
  input: { title?: string; body?: string; images?: Photo[] },
  usage: Record<string, number> = {}
): string {
  const text = [
    input.title || "",
    input.body || "",
    ...(input.images || []).map(imageText),
  ]
    .join(" ")
    .toLowerCase();
  let best: string = CAMPAIGN_TRACKS[0];
  let bestScore = -1;
  for (const track of CAMPAIGN_TRACKS) {
    const score = (TRACK_KEYWORDS[track] || []).reduce(
      (total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 1 : 0),
      0
    );
    if (
      score > bestScore ||
      (score === bestScore && (usage[track] || 0) < (usage[best] || 0))
    ) {
      best = track;
      bestScore = score;
    }
  }
  return best;
}

export function sanitizeCampaignHashtags(
  model: string,
  track: string,
  hashtags: string[]
): string[] {
  const tracks = new Set<string>(CAMPAIGN_TRACKS);
  const cleaned = hashtags.filter(
    (tag) =>
      tag !== "有理想的生活" && !tracks.has(tag) && tag !== model
  );
  return Array.from(new Set([model, track, ...cleaned].filter(Boolean))).slice(
    0,
    10
  );
}

export function campaignPostIssues(post: Post, settings: Settings): string[] {
  if (!post.campaign) return [];
  const issues: string[] = [];
  if (post.images.length < CAMPAIGN_MIN_IMAGES) {
    issues.push(
      `配图 ${post.images.length} 张，活动要求至少 ${CAMPAIGN_MIN_IMAGES} 张`
    );
  }
  const chars = charLength(post.body.replace(/\s+/g, ""));
  const minBody = campaignBodyMin(settings);
  if (chars < minBody) {
    issues.push(`正文 ${chars} 字，当前设置要求至少 ${minBody} 字`);
  }
  const tags = post.hashtags.map((tag) => tag.trim());
  const model = campaignModel(settings);
  if (!model) {
    issues.push("未设置车型词，无法生成官方话题");
  } else if (!tags.includes(model)) {
    issues.push(`缺少车型话题 #${model}`);
  }
  const usedTracks = CAMPAIGN_TRACKS.filter((track) => tags.includes(track));
  if (!usedTracks.length) {
    issues.push("缺少赛道话题（三选一）");
  }
  if (usedTracks.length > 1) {
    issues.push("同时带了多个赛道话题，只能三选一");
  }
  if (tags.includes("有理想的生活")) {
    issues.push("使用了已停用的 #有理想的生活");
  }
  return issues;
}

const CAR_HINTS = [
  "车",
  "汽车",
  "suv",
  "mpv",
  "理想",
  "试驾",
  "门店",
  "展厅",
  "后备箱",
  "座椅",
  "方向盘",
  "充电",
  "驾驶",
  "自驾",
];

const NON_REAL_HINTS = [
  "ai绘画",
  "ai生成",
  "游戏截图",
  "游戏摄影",
  "影视剧",
  "插画",
  "动漫",
  "渲染图",
  "官方图",
];

const CONTENT_HINTS = [
  "总结",
  "建议",
  "感受",
  "体验",
  "功能",
  "空间",
  "续航",
  "充电",
  "适合",
  "推荐",
  "发现",
  "对比",
  "实测",
  "优点",
  "缺点",
  "不足",
];

function imageText(image: Photo) {
  return [
    image.summary || "",
    image.scene || "",
    image.mood || "",
    ...(image.tags || []),
    ...(image.analysis?.summary ? [image.analysis.summary] : []),
    ...(image.analysis?.tags || []),
    ...(image.analysis?.topics || []),
    ...(image.analysis?.objects || []),
  ]
    .join(" ")
    .toLowerCase();
}

export function campaignPublishBlockers(
  post: Post,
  settings: Settings
): string[] {
  if (!post.campaign) return [];
  const blockers: string[] = [];
  if (settings.campaign_enabled !== "1") blockers.push("活动已关闭");
  blockers.push(...campaignPostIssues(post, settings));
  return blockers;
}

export function campaignPostWarnings(post: Post): string[] {
  if (!post.campaign) return [];
  const warnings: string[] = [];
  if (post.images.length) {
    const texts = post.images.map(imageText);
    const carImages = texts.filter((text) =>
      CAR_HINTS.some((keyword) => text.includes(keyword))
    ).length;
    if (carImages / post.images.length < 0.5) {
      warnings.push(
        `车辆相关内容约 ${carImages}/${post.images.length} 张，低于 50%，可能被判出行笔记不计分`
      );
    }
    const nonReal = texts.filter((text) =>
      NON_REAL_HINTS.some((keyword) => text.includes(keyword))
    ).length;
    if (nonReal > 0) {
      warnings.push(
        `${nonReal} 张素材含 AI/游戏/影视/插画痕迹，注意实拍率需 ≥80%`
      );
    }
  }
  if (!CONTENT_HINTS.some((keyword) => post.body.includes(keyword))) {
    warnings.push(
      "正文缺少总结/体验/功能信息，可能被判日常流水账"
    );
  }
  return warnings;
}

export function currentDayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function currentWeekRange() {
  const now = new Date();
  const weekday = (now.getDay() + 6) % 7;
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - weekday
  );
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { from: start.toISOString(), to: end.toISOString() };
}
