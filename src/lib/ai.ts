import { getSettings } from "./db";
import {
  SHOT_CATEGORIES,
  isShotCategory,
  pickCuratedShotIdeas,
  type ShotIdeaDraft,
} from "./shot-ideas";
import {
  CAMPAIGN_MIN_IMAGES,
  CAMPAIGN_TRACKS,
  pickCampaignTrack,
  sanitizeCampaignHashtags,
} from "./campaign-rules";
import {
  charLength,
  publishedBodyLimit,
  XHS_BODY_MAX,
  XHS_HASHTAGS_MAX,
  XHS_TITLE_MAX,
} from "./content-rules";
import type { Event, ImageAnalysis, Photo, PlannedPost, Settings } from "./types";

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  visionModel: string;
  textModel: string;
  enabled: boolean;
}

export function getAiConfig(): AiConfig {
  const s = getSettings();
  return {
    baseUrl: s.ai_base_url.replace(/\/+$/, ""),
    apiKey: s.ai_api_key,
    visionModel: s.ai_vision_model,
    textModel: s.ai_text_model,
    enabled: s.ai_enabled === "1" && Boolean(s.ai_api_key),
  };
}

type ChatMessage = {
  role: "system" | "user";
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

async function chat(
  config: AiConfig,
  options: {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  }
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 120_000
  );
  try {
    const res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
        stream: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `AI 接口返回 ${res.status}${text ? `：${text.slice(0, 240)}` : ""}`
      );
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((part: { text?: string } | string) =>
          typeof part === "string" ? part : part?.text || ""
        )
        .join("");
    }
    throw new Error("AI 返回内容为空");
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(text: string): unknown {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    const arrayStart = cleaned.indexOf("[");
    const arrayEnd = cleaned.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
    }
    throw new Error("AI 没有返回有效的 JSON");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}

function cleanupText(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function stringArray(value: unknown, limit = XHS_HASHTAGS_MAX): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => cleanupText(item))
        .filter(Boolean)
        .map((item) => item.replace(/^#+/, ""))
    )
  ).slice(0, limit);
}

const ANALYSIS_PROMPT = `你是一位资深的小红书视觉编辑。请仔细分析这张图片，判断它的内容、气质以及适合的笔记选题。
只输出一个 JSON 对象，不要输出任何解释。格式：
{
  "summary": "40-80字，客观描述画面内容、构图、氛围和亮点",
  "subject": "画面主体，10字以内",
  "scene": "场景，如咖啡馆/海边/卧室/街头，10字以内",
  "objects": ["画面主要物体，最多6个"],
  "mood": "氛围情绪，如治愈/松弛/元气/安静，10字以内",
  "colors": ["主色调，如奶油白、落日橘，最多4个"],
  "tags": ["适合小红书的内容标签，6-10个，不带#"],
  "topics": ["适合的笔记选题，2-4条"],
  "quality": 3,
  "orientation": "横图"
}
quality 为 1-5 的整数，表示这张图作为小红书封面的吸引力和清晰度。orientation 只能是 横图/竖图/方图。`;

export async function analyzeImage(
  config: AiConfig,
  image: { base64: string; mime: string; id: string; name?: string },
  context: Settings
): Promise<ImageAnalysis> {
  if (!config.enabled) return mockAnalysis(image.id);

  const dataUrl = `data:${image.mime};base64,${image.base64}`;
  let raw: string;
  try {
    raw = await chat(config, {
      model: config.visionModel,
      temperature: 0.2,
      maxTokens: 1200,
      timeoutMs: 120_000,
      messages: [
        {
          role: "system",
          content:
            "你是专业的小红书图片分析助手，擅长从画面中提取可用的内容标签和选题灵感。",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${ANALYSIS_PROMPT}\n\n账号人设（仅供判断选题时参考）：${context.persona}\n文件名：${image.name || "未命名"}`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("图片分析超时，请重试或换一张小一点的图片");
    }
    throw error;
  }

  const json = extractJson(raw) as Record<string, unknown>;
  return {
    summary: cleanupText(json.summary, "一张适合分享的生活随拍。"),
    subject: cleanupText(json.subject, "生活随拍"),
    scene: cleanupText(json.scene, "日常"),
    objects: stringArray(json.objects, 6),
    mood: cleanupText(json.mood, "松弛"),
    colors: stringArray(json.colors, 4),
    tags: stringArray(json.tags, 10),
    topics: stringArray(json.topics, 4),
    quality: Math.max(1, Math.min(5, Math.round(Number(json.quality) || 3))),
    orientation: cleanupText(json.orientation, "方图"),
  };
}

function hash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function mockAnalysis(id: string): ImageAnalysis {
  const scenes = ["日常", "咖啡馆", "城市街头", "旅行途中", "居家角落"];
  const moods = ["松弛", "治愈", "安静", "元气"];
  const h = hash(id);
  const scene = scenes[h % scenes.length];
  const mood = moods[h % moods.length];
  return {
    summary: `演示分析：一张${scene}生活随拍，画面干净，氛围${mood}，适合作为日常分享笔记的配图。配置 AI 后可获得真实的画面识别结果。`,
    subject: `${scene}随拍`,
    scene,
    objects: ["生活场景"],
    mood,
    colors: ["自然色"],
    tags: ["生活记录", "日常", "氛围感", "随手拍", "治愈", "生活碎片"],
    topics: ["日常分享", "生活碎片记录"],
    quality: 3 + (h % 3),
    orientation: "方图",
    mock: true,
  };
}

const PLAN_SYSTEM = `你是一位非常擅长小红书内容策划的编辑。你会根据图片库中的素材，把图片合理分组，为每组写一篇真实、有画面感、值得收藏的小红书笔记。
你的文案不浮夸、不编造功效，重体验和情绪价值；标题有信息量但不标题党。`;

function buildPlanPrompt(
  images: Photo[],
  settings: Settings,
  instruction: string
) {
  const compact = images.map((img) => ({
    id: img.id,
    summary: img.analysis?.summary || img.summary || "",
    scene: img.analysis?.scene || img.scene || "",
    mood: img.analysis?.mood || img.mood || "",
    subject: img.analysis?.subject || "",
    objects: img.analysis?.objects || [],
    colors: img.analysis?.colors || [],
    tags: img.analysis?.tags || img.tags || [],
    topics: img.analysis?.topics || [],
    quality: img.analysis?.quality || 3,
    orientation: img.analysis?.orientation || "",
    kind: img.kind,
    duration: img.duration || 0,
  }));

  return `请为下面的素材库策划一个小红书发布批次。

账号人设：${settings.persona}
语言风格：${settings.tone}
账号结尾签名（可自然融入，也可不用）：${settings.signature}
${instruction ? `本次额外要求：${instruction}` : ""}

素材库（JSON，id 用于引用；kind 为 image 表示静态图片，video 表示视频，gif 表示动图）：
${JSON.stringify(compact)}

策划规则：
1. 按照场景、情绪、内容主题把图片合理分组，每组做成一篇文章。同一个素材只能出现在一篇文章里。
2. 静态图片（kind=image）每组 1-9 张，优先 3-6 张，图片之间要有叙事顺序（封面 → 细节 → 氛围 → 收尾）。
3. 每组选一张最有吸引力的图作为封面（cover_image_id）。
4. 视频（kind=video）和动图（kind=gif）必须各自单独成篇，每篇只能有 1 个视频/动图，不能和静态图片或另一个视频混在一起；动图会转成短视频发布，请按视频口吻写标题和文案。
5. 主题差异大的图片要拆成不同文章；质量低或重复的素材可以不用，宁缺毋滥。
6. 标题 ≤ 20 个汉字，具体、有吸引力，不要夸张承诺，不使用"最"等绝对化表述。
7. 正文 180-350 字，口语化，有真实体验和细节，分段自然，适量使用 emoji，不要堆砌标签。
8. hashtags 给 8-10 个，不带 # 号，覆盖主题、场景、情绪和长尾词。
9. 结合内容给出建议发布时间 publish_time（HH:mm，如 19:30）。
10. 每篇文章 theme 用 4-10 个字概括主题，reason 用一句话说明分组理由。

只输出 JSON，不要 Markdown 代码块，不要解释。格式：
{"posts":[{"theme":"","title":"","body":"","hashtags":[""],"image_ids":[""],"cover_image_id":"","publish_time":"19:30","reason":""}]}`;
}

function normalizePlannedPosts(
  list: unknown[],
  images: Photo[],
  settings: Settings
): PlannedPost[] {
  const validIds = new Set(images.map((img) => img.id));
  const kindById = new Map(images.map((img) => [img.id, img.kind]));
  const consumed = new Set<string>();
  const planned: PlannedPost[] = [];

  for (const item of list as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue;
    const rawIds = Array.isArray(item.image_ids) ? item.image_ids.map(String) : [];
    const candidates = rawIds
      .filter((id) => validIds.has(id) && !consumed.has(id))
      .filter((id, index, arr) => arr.indexOf(id) === index);
    const videoLike = candidates.filter(
      (id) => kindById.get(id) !== "image"
    );
    const imageIds = videoLike.length
      ? videoLike.slice(0, 1)
      : candidates.slice(0, 9);
    if (!imageIds.length) continue;
    imageIds.forEach((id) => consumed.add(id));

    const coverCandidate = cleanupText(item.cover_image_id);
    const cover = imageIds.includes(coverCandidate) ? coverCandidate : imageIds[0];
    const title =
      Array.from(cleanupText(item.title, "生活里的小美好"))
        .slice(0, XHS_TITLE_MAX)
        .join("") || "生活里的小美好";
    const publishTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(cleanupText(item.publish_time))
      ? cleanupText(item.publish_time)
      : settings.default_time;
    const hashtags = stringArray(item.hashtags, XHS_HASHTAGS_MAX);
    const body = Array.from(cleanupText(item.body))
      .slice(0, publishedBodyLimit(hashtags))
      .join("")
      .slice(0, XHS_BODY_MAX);

    planned.push({
      theme: cleanupText(item.theme, "生活记录").slice(0, 20),
      title,
      body,
      hashtags,
      track: cleanupText(item.track) || undefined,
      imageIds,
      coverImageId: cover,
      publishTime,
      reason: cleanupText(item.reason),
    });
  }

  return planned;
}

function parsePlannedList(raw: string): unknown[] {
  const parsed = extractJson(raw);
  if (Array.isArray(parsed)) return parsed;
  const posts = (parsed as { posts?: unknown }).posts;
  return Array.isArray(posts) ? posts : [];
}

export async function planPosts(
  config: AiConfig,
  images: Photo[],
  settings: Settings,
  instruction: string
): Promise<PlannedPost[]> {
  if (!config.enabled) return mockPlan(images, settings);

  const raw = await chat(config, {
    model: config.textModel,
    temperature: 0.85,
    maxTokens: 4096,
    timeoutMs: 180_000,
    messages: [
      { role: "system", content: PLAN_SYSTEM },
      { role: "user", content: buildPlanPrompt(images, settings, instruction) },
    ],
  });

  const planned = normalizePlannedPosts(parsePlannedList(raw), images, settings);

  if (!planned.length) {
    throw new Error("AI 没有规划出可用作品，请补充一些内容更清晰的图片后重试");
  }
  return planned;
}

function mockPlan(images: Photo[], settings: Settings): PlannedPost[] {
  const videoAssets = images.filter((image) => image.kind !== "image");
  const imageAssets = images.filter((image) => image.kind === "image");
  const groups: Photo[][] = [];
  for (let i = 0; i < imageAssets.length; i += 3) {
    groups.push(imageAssets.slice(i, i + 3));
  }

  const planned: PlannedPost[] = groups.slice(0, 8).map((group) => {
    const first = group[0];
    const scene = first.analysis?.scene || first.scene || "日常";
    const summary =
      first.analysis?.summary || first.summary || "记录下这一刻的光线和心情。";
    const tags = Array.from(
      new Set([
        ...group.flatMap((img) => img.analysis?.tags || img.tags || []),
        "生活记录",
        "氛围感",
        "日常碎片",
      ])
    ).slice(0, 10);
    return {
      theme: `${scene}随拍`,
      title: Array.from(`今日份${scene}，把松弛感装进镜头`).slice(0, 20).join(""),
      body: `最近把相册里的${scene}照片整理了一下，越看越喜欢。\n\n${summary}\n\n不用特意安排，生活里这些不经意的瞬间，就足够让人心情变好。\n\n${settings.signature}`,
      hashtags: tags,
      imageIds: group.map((img) => img.id),
      coverImageId: group[0].id,
      publishTime: settings.default_time,
      reason: "演示模式：按上传顺序每 3 张静态图片分为一组。",
    };
  });

  for (const asset of videoAssets) {
    const scene = asset.analysis?.scene || asset.scene || "日常";
    const summary =
      asset.analysis?.summary ||
      asset.summary ||
      "用镜头记录下这一刻的画面和心情。";
    const isGif = asset.kind === "gif";
    const tags = Array.from(
      new Set([
        ...(asset.analysis?.tags || asset.tags || []),
        isGif ? "动图" : "视频记录",
        "生活记录",
        "氛围感",
      ])
    ).slice(0, 10);
    planned.push({
      theme: isGif ? "动图记录" : "视频记录",
      title: Array.from(
        isGif ? `今日份${scene}动图` : `${scene}的一段小视频`
      )
        .slice(0, 20)
        .join(""),
      body: `${summary}\n\n${isGif ? "这段动图" : "这段视频"}记录下了当时的光线和心情，剪成短短的片段，留作生活里的小纪念。\n\n${settings.signature}`,
      hashtags: tags,
      imageIds: [asset.id],
      coverImageId: asset.id,
      publishTime: settings.default_time,
      reason: "演示模式：视频/动图单独成篇。",
    });
  }

  return planned.slice(0, 12);
}

const CAMPAIGN_SYSTEM = `你是「有理想的创作者」活动的资深探店作者，长期写同城探店和生活体验。你的文字像真实到店消费后的记录：有具体场景、有取舍、有个人感受，不端着也不堆砌形容词。`;

function buildCampaignPrompt(
  images: Photo[],
  settings: Settings,
  options: {
    campaign: string;
    bodyMin: number;
    recentTitles: string[];
    model: string;
    trackUsage: Record<string, number>;
    instruction?: string;
  }
) {
  const compact = images.map((img) => ({
    id: img.id,
    summary: img.analysis?.summary || img.summary || "",
    scene: img.analysis?.scene || img.scene || "",
    mood: img.analysis?.mood || img.mood || "",
    subject: img.analysis?.subject || "",
    objects: img.analysis?.objects || [],
    colors: img.analysis?.colors || [],
    tags: img.analysis?.tags || img.tags || [],
    topics: img.analysis?.topics || [],
    quality: img.analysis?.quality || 3,
    orientation: img.analysis?.orientation || "",
  }));

  const recent = options.recentTitles.length
    ? options.recentTitles.slice(0, 30).map((title) => `- ${title}`).join("\n")
    : "暂无";

  return `请为小红书活动「${options.campaign}」策划下一批探店笔记。

车型词：${options.model || "未填写"}
赛道：每篇从「${CAMPAIGN_TRACKS.join("、")}」中选一个最贴合的，输出 track 字段；每篇只选一个，不要全带，也不要带 #有理想的生活。
最近赛道使用情况：${CAMPAIGN_TRACKS.map(
    (track) => `${track} ${options.trackUsage[track] || 0} 篇`
  ).join("，")}。整批尽量均衡，但内容贴合优先。
账号人设：${settings.persona}
语言风格：${settings.tone}
账号结尾签名（可自然融入，也可不用）：${settings.signature}
${options.instruction ? `本次额外要求：${options.instruction}` : ""}

最近已经发布过的标题（新标题必须避开，不要重复或只改一两个字）：
${recent}

素材库（JSON，id 用于引用；kind 为 image 表示静态图片，video 表示视频，gif 表示动图）：
${JSON.stringify(compact)}

硬性要求：
1. 每篇正文去掉空白后不少于 ${options.bodyMin} 字，建议 ${options.bodyMin + 40}-${options.bodyMin + 200} 字。用第一人称写清楚到店/到场的场景、点了什么或看了什么、真实感受和小遗憾，至少有一个具体细节。
2. 标题不超过 20 个汉字，具体、有画面感，不用夸张承诺。
3. 不使用"最""第一""绝对""100%""必吃""封神""天花板"等绝对化或夸大表述。
4. 不编造地址、价格、营业时间和功效；不确定的信息用感受代替，不要写联系方式或导流信息。
5. 不写硬广、不写"姐妹们冲""闭眼入"这类模板化带货话术；不同篇目的开头、结构和语气要有明显差异。
6. 按场景、情绪和主题分组，每组必须 ${CAMPAIGN_MIN_IMAGES}-9 张图，少于 ${CAMPAIGN_MIN_IMAGES} 张就不要生成该篇；同一张图只能出现一次；给每组选一张封面。
7. 每组 hashtags 6-10 个，不带 # 号，覆盖探店、同城、场景和情绪，不要每篇都用同一组标签。
8. 结合内容给出建议发布时间 publish_time（HH:mm）。
9. theme 用 4-10 个字概括，reason 用一句话说明分组理由。

只输出 JSON，不要 Markdown 代码块，不要解释。格式：
{"posts":[{"theme":"","title":"","body":"","hashtags":[""],"track":"我的智系车","image_ids":[""],"cover_image_id":"","publish_time":"19:30","reason":""}]}`;
}

function bodyLength(body: string) {
  return charLength(body.replace(/\s+/g, ""));
}

function normalizeTitleKey(title: string) {
  return title
    .replace(/[\s，。！？、,.!?：:；;""''（）()\-—·]/g, "")
    .toLowerCase();
}

async function rewriteCampaignBodies(
  config: AiConfig,
  plans: PlannedPost[],
  bodyMin: number
): Promise<void> {
  const short = plans
    .map((post, index) => ({ index, title: post.title, body: post.body }))
    .filter((item) => bodyLength(item.body) < bodyMin);
  if (!short.length) return;

  const raw = await chat(config, {
    model: config.textModel,
    temperature: 0.75,
    maxTokens: 5000,
    timeoutMs: 180_000,
    messages: [
      {
        role: "system",
        content:
          "你是小红书探店作者，擅长把过短的笔记扩写成真实、具体、有个人感受的长文，不编造事实，不使用绝对化表述。",
      },
      {
        role: "user",
        content: `下面几篇笔记正文太短，请在不改变图片内容和事实的前提下扩写，每篇去掉空白后不少于 ${bodyMin} 字，保留原来的标题和语气。只输出 JSON：{"posts":[{"index":0,"body":""}]}。
${JSON.stringify({ posts: short })}`,
      },
    ],
  });

  const parsed = extractJson(raw) as { posts?: unknown };
  const items = Array.isArray(parsed.posts) ? parsed.posts : [];
  for (const item of items as Record<string, unknown>[]) {
    const index = Number(item.index);
    const body = cleanupText(item.body).slice(0, 1000);
    if (!Number.isInteger(index) || !plans[index] || !body) continue;
    if (bodyLength(body) > bodyLength(plans[index].body)) {
      plans[index].body = body;
    }
  }
}

function mockCampaignPlan(
  images: Photo[],
  settings: Settings,
  options: { campaign: string; bodyMin: number; model: string }
): PlannedPost[] {
  const groups: Photo[][] = [];
  for (let i = 0; i < images.length; i += CAMPAIGN_MIN_IMAGES) {
    groups.push(images.slice(i, i + CAMPAIGN_MIN_IMAGES));
  }
  const fillers = [
    "店里人不算多，坐下来的那一刻才觉得这趟来得值。",
    "没有特意做攻略，顺着街边慢慢走，反而遇到了想再来一次的地方。",
    "照片拍得不算精致，但当时的光线和心情都留下来了。",
    "如果你也喜欢这种不赶时间的小店，可以挑个工作日的下午来。",
    "口味是很私人的事，我的感受只代表这一次的体验。",
  ];
  return groups.slice(0, 8).map((group, groupIndex) => {
    const first = group[0];
    const scene = first.analysis?.scene || first.scene || "日常";
    const summary =
      first.analysis?.summary || first.summary || "记录下这一刻的光线和心情。";
    let body = `最近去了一个${scene}，想认真记一下。\n\n${summary}\n\n${fillers[groupIndex % fillers.length]}`;
    let cursor = 0;
    while (bodyLength(body) < options.bodyMin && cursor < 20) {
      body += `\n\n${fillers[cursor % fillers.length]}`;
      cursor++;
    }
    const track =
      CAMPAIGN_TRACKS[groupIndex % CAMPAIGN_TRACKS.length];
    return {
      theme: `${scene}探店`,
      title: Array.from(`在${scene}待了一下午`).slice(0, 20).join(""),
      body,
      hashtags: sanitizeCampaignHashtags(options.model, track, [
        "探店",
        "同城生活",
        scene,
        "周末去哪儿",
        "生活记录",
        "城市漫步",
        "氛围感",
      ]),
      track,
      imageIds: group.map((img) => img.id),
      coverImageId: group[0].id,
      publishTime: settings.campaign_time || settings.default_time,
      reason: `演示模式：按上传顺序每 ${CAMPAIGN_MIN_IMAGES} 张分为一组。`,
    };
  });
}

export interface CampaignPlanResult {
  posts: PlannedPost[];
  warnings: string[];
}

export async function planCampaignPosts(
  config: AiConfig,
  images: Photo[],
  settings: Settings,
  options: {
    campaign: string;
    bodyMin: number;
    recentTitles: string[];
    model: string;
    trackUsage: Record<string, number>;
    instruction?: string;
  }
): Promise<CampaignPlanResult> {
  if (!options.model) {
    throw new Error("请先在创作营设置车型词，再生成活动文案");
  }
  if (!config.enabled) {
    const mock = mockCampaignPlan(images, settings, options).filter(
      (post) => post.imageIds.length >= CAMPAIGN_MIN_IMAGES
    );
    if (!mock.length) {
      throw new Error(
        `可用图片不足 ${CAMPAIGN_MIN_IMAGES} 张，无法组成符合活动要求的图文`
      );
    }
    return {
      posts: mock,
      warnings: [
        `演示模式：未配置 AI，生成的是示例文案；活动要求每组至少 ${CAMPAIGN_MIN_IMAGES} 张图。`,
      ],
    };
  }

  const raw = await chat(config, {
    model: config.textModel,
    temperature: 0.9,
    maxTokens: 6000,
    timeoutMs: 240_000,
    messages: [
      { role: "system", content: CAMPAIGN_SYSTEM },
      {
        role: "user",
        content: buildCampaignPrompt(images, settings, options),
      },
    ],
  });

  const planned = normalizePlannedPosts(parsePlannedList(raw), images, settings);
  if (!planned.length) {
    throw new Error("AI 没有规划出可用作品，请补充更清晰的图片后重试");
  }

  const warnings: string[] = [];
  const tooSmall = planned.filter(
    (post) => post.imageIds.length < CAMPAIGN_MIN_IMAGES
  );
  if (tooSmall.length) {
    warnings.push(
      `${tooSmall.length} 组配图少于 ${CAMPAIGN_MIN_IMAGES} 张，已跳过；请补拍后再排期`
    );
  }
  const grouped = planned.filter(
    (post) => post.imageIds.length >= CAMPAIGN_MIN_IMAGES
  );
  if (!grouped.length) {
    throw new Error(
      `可用图片不足 ${CAMPAIGN_MIN_IMAGES} 张，无法组成符合活动要求的图文；请再补拍一些素材`
    );
  }
  try {
    await rewriteCampaignBodies(config, planned, options.bodyMin);
  } catch (error) {
    warnings.push(
      `部分正文扩写失败：${error instanceof Error ? error.message : String(error)}`
    );
  }

  const recent = new Set(
    options.recentTitles.map((title) => normalizeTitleKey(title)).filter(Boolean)
  );
  const trackSet = new Set<string>(CAMPAIGN_TRACKS);
  const usage: Record<string, number> = { ...options.trackUsage };
  const valid: PlannedPost[] = [];
  for (const post of grouped) {
    const length = bodyLength(post.body);
    if (length < options.bodyMin) {
      warnings.push(
        `《${post.title}》正文 ${length} 字，少于 ${options.bodyMin} 字，已跳过`
      );
      continue;
    }
    const key = normalizeTitleKey(post.title);
    if (recent.has(key)) {
      warnings.push(`《${post.title}》与已发布标题重复，已跳过`);
      continue;
    }
    recent.add(key);
    const requested =
      post.track && trackSet.has(post.track) ? post.track : "";
    const track = requested || pickCampaignTrack(post, usage);
    usage[track] = (usage[track] || 0) + 1;
    post.track = track;
    post.hashtags = sanitizeCampaignHashtags(
      options.model,
      track,
      post.hashtags
    );
    post.body = Array.from(post.body)
      .slice(0, publishedBodyLimit(post.hashtags))
      .join("");
    if (bodyLength(post.body) < options.bodyMin) {
      warnings.push(`《${post.title}》加标签后正文空间不足，已跳过`);
      continue;
    }
    valid.push(post);
  }

  if (!valid.length) {
    throw new Error(
      warnings[0] || "本批文案没有达到活动要求，请稍后重试或补充素材"
    );
  }

  return { posts: valid, warnings };
}

export interface ShotIdeasResult {
  ideas: ShotIdeaDraft[];
  mock: boolean;
}

const SHOT_SYSTEM = `你是理想汽车「有理想的创作者」活动的拍摄编导，擅长把探店、试驾和家庭出行拆成普通人用手机就能完成的拍摄任务。你给出的每条建议都必须具体到机位、光线、道具和文案切入点，不写空话。`;

export async function generateShotIdeas(
  config: AiConfig,
  settings: Settings,
  options: {
    campaign: string;
    city: string;
    count: number;
    category?: string;
    focus?: string;
    existingSummaries: string[];
    existingTitles: string[];
    gaps: string[];
  }
): Promise<ShotIdeasResult> {
  if (!config.enabled) {
    return {
      ideas: pickCuratedShotIdeas({
        count: options.count,
        category: options.category,
        city: options.city,
        existingTitles: options.existingTitles,
      }),
      mock: true,
    };
  }

  const existing = options.existingSummaries.slice(0, 40);
  const recent = options.existingTitles.slice(0, 30);
  const prompt = `请为小红书活动「${options.campaign}」设计 ${options.count} 条可执行的拍摄任务。

账号人设：${settings.persona}
语言风格：${settings.tone}
拍摄城市：${options.city || "未填写，用「就近」描述地点"}
本次重点：${options.category || "不限分类"}${options.focus ? `；额外要求：${options.focus}` : ""}

现有素材摘要（避免重复拍同样的画面）：
${existing.length ? existing.map((item) => `- ${item}`).join("\n") : "暂无"}

已有拍摄清单标题（不要重复）：
${recent.length ? recent.map((item) => `- ${item}`).join("\n") : "暂无"}

素材缺口（优先补这些）：
${options.gaps.length ? options.gaps.join("、") : "暂无"}

分类只能从以下选一个：
${SHOT_CATEGORIES.join("、")}

每条严格按下面的字段输出，字段名不要改：
分类：上面的分类之一
标题：不超过 20 字，具体到拍什么
地点：拍摄地点，不要编造具体地址
拍什么：画面主体和动作，写清楚人在做什么
机位：机位、角度、焦段建议
光线：时间段和光线方向
道具：需要准备的道具，没有就写「无」
文案切入：这条素材适合对应的文案切入点，一句话
优先级：1-3，1 最值得先拍

要求：
1. 优先覆盖素材缺口，其次才是补强已有分类。
2. 不要求露脸，用背影、手部、局部和空镜也能完成。
3. 不编造价格、配置、地址和功效；不确定的写「以门店实车为准」。
4. 不写广告口吻，不写绝对化表述。
5. 每条之间画面要拉开差异，不要都是车头 45°。
6. 每条之间用一行 --- 分隔；不要输出 JSON、Markdown 代码块或额外解释。
7. 字段内容里不要使用英文双引号，需要引用时用「」。`;

  const raw = await chat(config, {
    model: config.textModel,
    temperature: 0.9,
    maxTokens: 5000,
    timeoutMs: 180_000,
    messages: [
      { role: "system", content: SHOT_SYSTEM },
      { role: "user", content: prompt },
    ],
  });

  let items: Record<string, unknown>[] = [];
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.includes('"ideas"')) {
    try {
      const parsed = extractJson(raw) as Record<string, unknown>;
      const list = Array.isArray(parsed.ideas)
        ? parsed.ideas
        : Array.isArray(parsed)
        ? (parsed as unknown[])
        : [];
      items = list as Record<string, unknown>[];
    } catch {
      items = [];
    }
  }
  if (!items.length) items = parseShotBlocks(raw);

  const seen = new Set(
    options.existingTitles.map((title) => normalizeTitleKey(title))
  );
  const ideas: ShotIdeaDraft[] = [];

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const title = cleanupText(item.title).slice(0, 30);
    if (!title) continue;
    const key = normalizeTitleKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const category = cleanupText(item.category);
    ideas.push({
      category: isShotCategory(category) ? category : "门店探店",
      title,
      location: cleanupText(item.location, "就近的理想汽车零售中心/展厅").slice(
        0,
        60
      ),
      subject: cleanupText(item.subject).slice(0, 120),
      composition: cleanupText(item.composition).slice(0, 120),
      lighting: cleanupText(item.lighting).slice(0, 100),
      props: cleanupText(item.props, "无").slice(0, 80),
      caption: cleanupText(item.caption).slice(0, 80),
      priority: Math.min(3, Math.max(1, Math.round(Number(item.priority) || 2))),
    });
    if (ideas.length >= options.count) break;
  }

  if (!ideas.length) {
    throw new Error("AI 没有给出可用的拍摄清单，请换个重点再试");
  }

  return { ideas, mock: false };
}

function parseShotBlocks(raw: string): Record<string, unknown>[] {
  const cleaned = raw.replace(/```[a-zA-Z]*\s*/g, "").replace(/```/g, "");
  const blocks = cleaned.split(/\n\s*-{3,}\s*\n/);
  const field = (block: string, labels: string[]) => {
    for (const label of labels) {
      const pattern = new RegExp(
        `^\\s*(?:[-*#]+\\s*)?(?:\\d+[.、)]\\s*)?\\*{0,2}\\s*${label}\\s*\\*{0,2}\\s*[：:]\\s*(.+)$`,
        "mi"
      );
      const match = block.match(pattern);
      if (match) return match[1].trim();
    }
    return "";
  };

  return blocks
    .map((block) => ({
      category: field(block, ["分类", "category"]),
      title: field(block, ["标题", "title"]),
      location: field(block, ["地点", "拍摄地点", "location"]),
      subject: field(block, ["拍什么", "画面主体", "主体", "subject"]),
      composition: field(block, ["机位", "构图", "composition"]),
      lighting: field(block, ["光线", "lighting"]),
      props: field(block, ["道具", "props"]),
      caption: field(block, ["文案切入", "文案", "caption"]),
      priority: field(block, ["优先级", "priority"]),
    }))
    .filter((item) => Boolean(item.title));
}


export async function planEventPost(
  config: AiConfig,
  images: Photo[],
  settings: Settings,
  event: Event,
  instruction: string
): Promise<{ post: PlannedPost; warnings: string[] }> {
  const warnings: string[] = [];
  const requiredTopics = event.requiredTopics;

  if (!config.enabled) {
    const chosen = images.slice(0, Math.max(event.minImages, 1));
    const first = chosen[0];
    const summary =
      first.analysis?.summary || first.summary || "记录下这一刻的真实感受。";
    const tags = Array.from(
      new Set([
        ...requiredTopics,
        "理想汽车",
        "电动车",
        "超充",
        "生活记录",
        "真实体验",
      ])
    ).slice(0, 10);
    let body = `看完「${event.name}」，我最想聊的不是参数，而是它和日常用车的关系。\n\n${summary}\n\n${settings.signature}`;
    const fillers = [
      "安全、续航和补能，最后都要落到每天开车的感受里。",
      "比起发布会的口号，我更关心下一次长途和充电时会不会更从容。",
      "这只是我作为普通车主的第一反应，具体配置以官方和实车为准。",
    ];
    let cursor = 0;
    while (bodyLength(body) < event.minBody && cursor < 12) {
      body += `\n\n${fillers[cursor % fillers.length]}`;
      cursor++;
    }
    return {
      post: {
        theme: event.name.slice(0, 20),
        title: Array.from(`看完${event.name}，我想聊聊这几点`)
          .slice(0, 20)
          .join(""),
        body: Array.from(body).slice(0, publishedBodyLimit(tags)).join(""),
        hashtags: tags,
        imageIds: chosen.map((image) => image.id),
        coverImageId: chosen[0]?.id || "",
        publishTime: settings.default_time,
        reason: `演示模式：临时活动「${event.name}」示例文案`,
      },
      warnings: ["演示模式：未配置 AI，生成的是示例活动文案"],
    };
  }

  const compact = images.map((img) => ({
    id: img.id,
    summary: img.analysis?.summary || img.summary || "",
    scene: img.analysis?.scene || img.scene || "",
    mood: img.analysis?.mood || img.mood || "",
    subject: img.analysis?.subject || "",
    tags: img.analysis?.tags || img.tags || [],
    topics: img.analysis?.topics || [],
    quality: img.analysis?.quality || 3,
  }));

  const raw = await chat(config, {
    model: config.textModel,
    temperature: 0.8,
    maxTokens: 3000,
    timeoutMs: 180_000,
    messages: [
      {
        role: "system",
        content:
          "你是小红书创作者，擅长把发布会、活动和真实用车体验写成有个人感受的笔记，不编造参数，不使用绝对化表述。",
      },
      {
        role: "user",
        content: `请为下面这个临时活动写 1 篇小红书笔记。

活动名称：${event.name}
活动说明：
${event.brief || "暂无补充说明"}

必带话题：${requiredTopics.map((topic) => `#${topic}`).join(" ")}
配图要求：${event.minImages}-9 张，使用下面提供的素材，全部放在同一篇里。
正文字数：去掉空白后不少于 ${event.minBody} 字。
账号人设：${settings.persona}
语言风格：${settings.tone}
签名（可自然融入）：${settings.signature}
${event.internal ? "注意：这是内部活动，不要使用内部群聊、直播或资料截图。" : ""}
${event.officialAssets ? "注意：官方素材必须二创，不要直接搬运官方海报或原片。" : ""}
${instruction ? `额外要求：${instruction}` : ""}

要求：
1. 用第一人称写，结合自己的真实用车/生活场景，至少一个具体细节。
2. 不编造价格、配置、参数和功效；不确定的地方写“以官方和实车为准”。
3. 不使用“最”“第一”“绝对”“100%”“必买”“封神”等绝对化表述。
4. 不写硬广，不带常驻活动的三赛道话题，不带 #有理想的生活。
5. 只输出 1 篇，标题不超过 20 个汉字，正文口语化分段，带 emoji 要克制。
6. 只输出 JSON，不要 Markdown 代码块：{"theme":"","title":"","body":"","hashtags":[""],"cover_image_id":"","publish_time":"19:30","reason":""}

素材：
${JSON.stringify(compact)}`,
      },
    ],
  });

  const list = parsePlannedList(raw);
  const planned = normalizePlannedPosts(list, images, settings);
  const first = planned[0];
  if (!first) throw new Error("AI 没有生成可用的活动文案，请稍后重试");

  const banned = new Set<string>([...CAMPAIGN_TRACKS, "有理想的生活"]);
  const hashtags = Array.from(
    new Set([
      ...requiredTopics,
      ...first.hashtags.filter((tag) => !banned.has(tag)),
    ])
  ).slice(0, XHS_HASHTAGS_MAX);
  const body = Array.from(first.body)
    .slice(0, publishedBodyLimit(hashtags))
    .join("");
  const imageIds = images.map((image) => image.id).slice(0, 9);
  const coverImageId = imageIds.includes(first.coverImageId)
    ? first.coverImageId
    : imageIds[0] || "";

  if (bodyLength(body) < event.minBody) {
    warnings.push(
      `AI 正文只有 ${bodyLength(body)} 字，少于活动要求 ${event.minBody} 字，请在发布前补充`
    );
  }

  return {
    post: {
      ...first,
      theme: (first.theme || event.name).slice(0, 20),
      body,
      hashtags,
      imageIds,
      coverImageId,
      publishTime: first.publishTime || settings.default_time,
      reason: first.reason || `临时活动「${event.name}」`,
    },
    warnings,
  };
}

export async function testAiConnection(config: AiConfig) {
  if (!config.apiKey) throw new Error("请先填写 API Key");
  const content = await chat(config, {
    model: config.textModel,
    temperature: 0,
    maxTokens: 50,
    timeoutMs: 45_000,
    messages: [
      { role: "system", content: "你是连接测试助手。" },
      { role: "user", content: "请只回复：pong" },
    ],
  });
  return content.trim().slice(0, 100);
}

const TEST_IMAGE =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

export async function testAiVisionConnection(config: AiConfig) {
  if (!config.apiKey) throw new Error("请先填写 API Key");
  const content = await chat(config, {
    model: config.visionModel,
    temperature: 0,
    maxTokens: 40,
    timeoutMs: 60_000,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "这是一张测试图片。如果你能读取图片，请只回复：vision-ok" },
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${TEST_IMAGE}` },
          },
        ],
      },
    ],
  });
  return content.trim().slice(0, 100);
}
