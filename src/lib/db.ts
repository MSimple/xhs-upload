import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import type {
  Event,
  ImageAnalysis,
  Photo,
  PlatformSnapshot,
  Post,
  PostStatus,
  Settings,
  ShotIdea,
} from "./types";
import { addDays, parseDateStr, toDateStr, todayStr } from "./utils";

export const DATA_DIR = process.env.XHS_DATA_DIR || path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  preview_name TEXT,
  thumb_name TEXT,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'image',
  duration REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unused',
  manual_used INTEGER NOT NULL DEFAULT 0,
  campaign TEXT NOT NULL DEFAULT '',
  analysis TEXT,
  summary TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  scene TEXT,
  mood TEXT,
  created_at TEXT NOT NULL,
  analyzed_at TEXT
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  theme TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '未命名笔记',
  body TEXT NOT NULL DEFAULT '',
  hashtags TEXT NOT NULL DEFAULT '[]',
  campaign TEXT NOT NULL DEFAULT '',
  event_id TEXT,
  event_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_date TEXT,
  scheduled_time TEXT,
  published_at TEXT,
  published_date TEXT,
  cover_image_id TEXT,
  note TEXT NOT NULL DEFAULT '',
  auto_publish INTEGER NOT NULL DEFAULT 0,
  publish_error TEXT,
  publish_attempted_at TEXT,
  publish_attempt_count INTEGER NOT NULL DEFAULT 0,
  xhs_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_images (
  post_id TEXT NOT NULL,
  image_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, image_id),
  FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (image_id) REFERENCES images(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_snapshots (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  required_topics TEXT NOT NULL DEFAULT '[]',
  quota INTEGER NOT NULL DEFAULT 1,
  counts_weekly INTEGER NOT NULL DEFAULT 0,
  publish_time TEXT NOT NULL DEFAULT '21:30',
  min_images INTEGER NOT NULL DEFAULT 6,
  min_body INTEGER NOT NULL DEFAULT 50,
  collection_form TEXT NOT NULL DEFAULT '',
  collection_url TEXT NOT NULL DEFAULT '',
  internal INTEGER NOT NULL DEFAULT 0,
  official_assets INTEGER NOT NULL DEFAULT 0,
  brief TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  form_submitted INTEGER NOT NULL DEFAULT 0,
  xiaoyanjing_registered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shot_ideas (
  id TEXT PRIMARY KEY,
  campaign TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  composition TEXT NOT NULL DEFAULT '',
  lighting TEXT NOT NULL DEFAULT '',
  props TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 2,
  done INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'curated',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_images_status ON images(status);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_date ON posts(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_post_images_image ON post_images(image_id);
CREATE INDEX IF NOT EXISTS idx_shot_ideas_campaign ON shot_ideas(campaign);
`;

export const DEFAULT_SETTINGS: Settings = {
  ai_base_url: "https://api.deepseek.com/v1",
  ai_api_key: "",
  ai_vision_model: "deepseek-flash",
  ai_text_model: "deepseek-flash",
  ai_enabled: "1",
  persona: "生活方式分享博主，记录日常里的小美好，喜欢咖啡、旅行、家居和城市漫步",
  tone: "真诚、松弛、有点小幽默，像朋友聊天，不端着",
  signature: "关注我，一起收集生活里的小确幸 ✨",
  default_time: "19:30",
  posts_per_day: "1",
  auto_analyze: "1",
  xhs_scheduler: "1",
  xhs_headless: "1",
  campaign_enabled: "1",
  campaign_name: "有理想的创作者",
  campaign_city: "",
  campaign_official_topic: "",
  campaign_model: "",
  campaign_track: "我的智系车",
  campaign_registered: "0",
  campaign_tier: "explorer",
  campaign_weekly_posts: "4",
  campaign_buffer_weeks: "2",
  campaign_daily_posts: "1",
  campaign_body_min: "220",
  campaign_time: "19:30",
  campaign_auto_plan: "1",
  campaign_auto_publish: "1",
  campaign_start_date: "",
  campaign_buffer_days: "7",
  campaign_batch_images: "30",
  campaign_points_per_post: "150",
  campaign_points_cap: "600",
  campaign_last_plan_at: "",
  campaign_announcement_raw: "",
  campaign_announcement_links: "[]",
  campaign_announcement_month: "",
  campaign_announcement_at: "",
};

function createDb(): DatabaseSync {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "studio.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA busy_timeout = 5000;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  const columns = db.prepare("PRAGMA table_info(posts)").all() as Row[];
  const addColumn = (name: string, ddl: string) => {
    if (!columns.some((column) => String(column.name) === name)) {
      db.exec(`ALTER TABLE posts ADD COLUMN ${ddl}`);
    }
  };
  addColumn("auto_publish", "auto_publish INTEGER NOT NULL DEFAULT 0");
  addColumn("publish_error", "publish_error TEXT");
  addColumn("publish_attempted_at", "publish_attempted_at TEXT");
  addColumn("xhs_url", "xhs_url TEXT");
  addColumn("campaign", "campaign TEXT NOT NULL DEFAULT ''");
  addColumn("event_id", "event_id TEXT");
  addColumn("event_name", "event_name TEXT");
  const eventColumns = db.prepare("PRAGMA table_info(events)").all() as Row[];
  if (!eventColumns.some((column) => String(column.name) === "publish_time")) {
    db.exec("ALTER TABLE events ADD COLUMN publish_time TEXT NOT NULL DEFAULT '21:30'");
  }
  addColumn("published_date", "published_date TEXT");
  addColumn(
    "publish_attempt_count",
    "publish_attempt_count INTEGER NOT NULL DEFAULT 0"
  );
  const missingPublishedDate = db
    .prepare(
      "SELECT id, published_at FROM posts WHERE published_at IS NOT NULL AND published_date IS NULL"
    )
    .all() as Row[];
  if (missingPublishedDate.length) {
    const update = db.prepare("UPDATE posts SET published_date = ? WHERE id = ?");
    for (const row of missingPublishedDate) {
      const date = new Date(str(row.published_at));
      if (!Number.isNaN(date.getTime())) {
        update.run(toDateStr(date), str(row.id));
      }
    }
  }
  const imageColumns = db.prepare("PRAGMA table_info(images)").all() as Row[];
  if (!imageColumns.some((column) => String(column.name) === "campaign")) {
    db.exec("ALTER TABLE images ADD COLUMN campaign TEXT NOT NULL DEFAULT ''");
  }
  if (!imageColumns.some((column) => String(column.name) === "thumb_name")) {
    db.exec("ALTER TABLE images ADD COLUMN thumb_name TEXT");
  }
  if (!imageColumns.some((column) => String(column.name) === "kind")) {
    db.exec("ALTER TABLE images ADD COLUMN kind TEXT NOT NULL DEFAULT 'image'");
  }
  if (!imageColumns.some((column) => String(column.name) === "duration")) {
    db.exec("ALTER TABLE images ADD COLUMN duration REAL NOT NULL DEFAULT 0");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_images_campaign ON images(campaign);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_posts_event ON posts(event_id);"
  );
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);"
  );
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    stmt.run(key, value);
  }
  return db;
}

const globalForDb = globalThis as unknown as { __studioDb?: DatabaseSync };

function getDb(): DatabaseSync {
  if (!globalForDb.__studioDb) {
    globalForDb.__studioDb = createDb();
  }
  return globalForDb.__studioDb;
}

// Lazy proxy so that merely importing this module (e.g. during `next build`)
// does not open the SQLite database in parallel worker processes.
export const db: DatabaseSync = new Proxy({} as DatabaseSync, {
  get(_target, property) {
    const instance = getDb();
    const value = (instance as unknown as Record<PropertyKey, unknown>)[property];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

type Row = Record<string, unknown>;

function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function str(value: unknown, fallback = ""): string {
  return value === null || value === undefined ? fallback : String(value);
}

function num(value: unknown): number {
  return Number(value) || 0;
}

function parseArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(str(value, "[]"));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseAnalysis(value: unknown): ImageAnalysis | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(String(value));
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as ImageAnalysis;
  } catch {
    return null;
  }
}

export function imageFromRow(row: Row): Photo {
  const id = str(row.id);
  return {
    id,
    originalName: str(row.original_name),
    mime: str(row.mime, "image/jpeg"),
    size: num(row.size),
    width: num(row.width),
    height: num(row.height),
    kind: (str(row.kind, "image") || "image") as Photo["kind"],
    duration: num(row.duration),
    status: str(row.status, "unused") as Photo["status"],
    manualUsed: num(row.manual_used) === 1,
    campaign: str(row.campaign),
    analysis: parseAnalysis(row.analysis),
    summary: row.summary ? str(row.summary) : null,
    tags: parseArray(row.tags),
    scene: row.scene ? str(row.scene) : null,
    mood: row.mood ? str(row.mood) : null,
    createdAt: str(row.created_at),
    analyzedAt: row.analyzed_at ? str(row.analyzed_at) : null,
    previewUrl: `/api/images/${id}/file?kind=preview`,
    thumbUrl: `/api/images/${id}/file?kind=thumb`,
    originalUrl: `/api/images/${id}/file?kind=original`,
  };
}

export function postFromRow(row: Row, images: Photo[]): Post {
  const coverImageId = row.cover_image_id ? str(row.cover_image_id) : null;
  return {
    id: str(row.id),
    theme: str(row.theme),
    title: str(row.title),
    body: str(row.body),
    hashtags: parseArray(row.hashtags),
    campaign: str(row.campaign),
    eventId: row.event_id ? str(row.event_id) : null,
    eventName: row.event_name ? str(row.event_name) : null,
    status: str(row.status, "draft") as PostStatus,
    scheduledDate: row.scheduled_date ? str(row.scheduled_date) : null,
    scheduledTime: row.scheduled_time ? str(row.scheduled_time) : null,
    publishedAt: row.published_at ? str(row.published_at) : null,
    publishedDate: row.published_date ? str(row.published_date) : null,
    coverImageId,
    note: str(row.note),
    autoPublish: num(row.auto_publish) === 1,
    publishError: row.publish_error ? str(row.publish_error) : null,
    publishAttemptedAt: row.publish_attempted_at
      ? str(row.publish_attempted_at)
      : null,
    publishAttemptCount: num(row.publish_attempt_count),
    xhsUrl: row.xhs_url ? str(row.xhs_url) : null,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    mediaType: images.some((image) => image.kind !== "image")
      ? "video"
      : "image",
    images,
    cover: images.find((img) => img.id === coverImageId) || images[0] || null,
  };
}

export function recomputeImageStatuses() {
  db.exec(`
    UPDATE images SET status = CASE
      WHEN manual_used = 1 THEN 'used'
      WHEN EXISTS (
        SELECT 1 FROM post_images pi JOIN posts p ON p.id = pi.post_id
        WHERE pi.image_id = images.id AND p.status = 'published'
      ) THEN 'used'
      WHEN EXISTS (
        SELECT 1 FROM post_images pi WHERE pi.image_id = images.id
      ) THEN 'reserved'
      ELSE 'unused'
    END
  `);
}

export function getSettings(): Settings {
  const rows = db.prepare("SELECT key, value FROM settings").all() as Row[];
  const merged: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) merged[str(row.key)] = str(row.value);
  return merged as unknown as Settings;
}

export function saveSettings(input: Partial<Settings>): Settings {
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  for (const [key, value] of Object.entries(input)) {
    if (key in DEFAULT_SETTINGS && value !== undefined && value !== null) {
      stmt.run(key, String(value));
    }
  }
  return getSettings();
}

export function listImages(options?: {
  status?: string;
  analyzed?: boolean;
  campaign?: string;
  excludeCampaign?: boolean;
  order?: "asc" | "desc";
}): Photo[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (options?.status && options.status !== "all") {
    if (options.status === "pending") {
      clauses.push("analysis IS NULL");
    } else {
      clauses.push("status = ?");
      params.push(options.status);
    }
  }
  if (typeof options?.analyzed === "boolean") {
    clauses.push(options.analyzed ? "analysis IS NOT NULL" : "analysis IS NULL");
  }
  if (typeof options?.campaign === "string" && options.campaign) {
    clauses.push("campaign = ?");
    params.push(options.campaign);
  } else if (options?.excludeCampaign) {
    clauses.push("campaign = ''");
  }
  const sql = `SELECT * FROM images ${
    clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  } ORDER BY created_at ${options?.order === "asc" ? "ASC" : "DESC"}`;
  const rows = db.prepare(sql).all(...params) as Row[];
  return rows.map(imageFromRow);
}

export function getImage(id: string): Photo | null {
  const row = db.prepare("SELECT * FROM images WHERE id = ?").get(id) as
    | Row
    | undefined;
  return row ? imageFromRow(row) : null;
}

export function getImageFileNames(id: string) {
  const row = db
    .prepare(
      "SELECT filename, preview_name, thumb_name, mime, original_name, kind, duration FROM images WHERE id = ?"
    )
    .get(id) as Row | undefined;
  if (!row) return null;
  return {
    filename: str(row.filename),
    previewName: row.preview_name ? str(row.preview_name) : null,
    thumbName: row.thumb_name ? str(row.thumb_name) : null,
    mime: str(row.mime, "image/jpeg"),
    originalName: str(row.original_name),
    kind: (str(row.kind, "image") || "image") as Photo["kind"],
    duration: num(row.duration),
  };
}

export function getPlatformSnapshot(): {
  snapshot: PlatformSnapshot | null;
  syncedAt: string | null;
} {
  const row = db
    .prepare("SELECT data, synced_at FROM platform_snapshots WHERE id = 1")
    .get() as Row | undefined;
  if (!row) return { snapshot: null, syncedAt: null };
  try {
    return {
      snapshot: JSON.parse(str(row.data)) as PlatformSnapshot,
      syncedAt: str(row.synced_at),
    };
  } catch {
    return { snapshot: null, syncedAt: null };
  }
}

export function savePlatformSnapshot(snapshot: PlatformSnapshot) {
  db.prepare(
    `INSERT INTO platform_snapshots (id, data, synced_at) VALUES (1, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, synced_at = excluded.synced_at`
  ).run(JSON.stringify(snapshot), snapshot.syncedAt);
}

export function insertImage(input: {
  id: string;
  filename: string;
  previewName: string | null;
  thumbName?: string | null;
  originalName: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  kind?: Photo["kind"];
  duration?: number;
  campaign?: string;
}): Photo {
  db.prepare(
    `INSERT INTO images
      (id, filename, preview_name, thumb_name, original_name, mime, size, width, height, kind, duration, campaign, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.id,
    input.filename,
    input.previewName,
    input.thumbName || null,
    input.originalName,
    input.mime,
    input.size,
    input.width,
    input.height,
    input.kind || "image",
    input.duration || 0,
    input.campaign || "",
    new Date().toISOString()
  );
  return getImage(input.id)!;
}

export function saveImageAnalysis(id: string, analysis: ImageAnalysis) {
  db.prepare(
    `UPDATE images SET analysis = ?, summary = ?, tags = ?, scene = ?, mood = ?, analyzed_at = ?
     WHERE id = ?`
  ).run(
    JSON.stringify(analysis),
    analysis.summary || "",
    JSON.stringify(analysis.tags || []),
    analysis.scene || "",
    analysis.mood || "",
    new Date().toISOString(),
    id
  );
}

export function setManualUsed(id: string, used: boolean) {
  db.prepare("UPDATE images SET manual_used = ? WHERE id = ?").run(used ? 1 : 0, id);
  recomputeImageStatuses();
}

export function setImageCampaign(id: string, campaign: string) {
  db.prepare("UPDATE images SET campaign = ? WHERE id = ?").run(
    campaign.trim(),
    id
  );
}

export function setImagesCampaign(ids: string[], campaign: string) {
  const value = campaign.trim();
  const stmt = db.prepare("UPDATE images SET campaign = ? WHERE id = ?");
  for (const id of ids) stmt.run(value, id);
}

export function renameCampaign(oldName: string, newName: string) {
  const from = oldName.trim();
  const to = newName.trim();
  if (!from || !to || from === to) return;
  tx(() => {
    db.prepare("UPDATE images SET campaign = ? WHERE campaign = ?").run(to, from);
    db.prepare(
      "UPDATE posts SET campaign = ?, updated_at = ? WHERE campaign = ?"
    ).run(to, new Date().toISOString(), from);
  });
}

export function deleteImage(id: string) {
  const names = getImageFileNames(id);
  db.prepare("DELETE FROM images WHERE id = ?").run(id);
  recomputeImageStatuses();
  if (names) {
    for (const name of [
      names.filename,
      names.previewName,
      names.thumbName,
      `${id}.mp4`,
    ]) {
      if (!name) continue;
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, name));
      } catch {
        // ignore missing file
      }
    }
  }
}

export function deleteImages(ids: string[]) {
  for (const id of ids) deleteImage(id);
}

function imagesForPost(postId: string): Photo[] {
  const rows = db
    .prepare(
      `SELECT i.* FROM post_images pi JOIN images i ON i.id = pi.image_id
       WHERE pi.post_id = ? ORDER BY pi.position ASC`
    )
    .all(postId) as Row[];
  return rows.map(imageFromRow);
}

export function listPosts(options?: {
  status?: string;
  from?: string;
  to?: string;
}): Post[] {
  const clauses: string[] = [];
  const params: string[] = [];
  if (options?.status && options.status !== "all") {
    clauses.push("status = ?");
    params.push(options.status);
  }
  if (options?.from) {
    clauses.push("scheduled_date >= ?");
    params.push(options.from);
  }
  if (options?.to) {
    clauses.push("scheduled_date <= ?");
    params.push(options.to);
  }
  const sql = `SELECT * FROM posts ${
    clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""
  } ORDER BY updated_at DESC, created_at DESC`;
  const rows = db.prepare(sql).all(...params) as Row[];
  return rows.map((row) => postFromRow(row, imagesForPost(str(row.id))));
}

export function getPost(id: string): Post | null {
  const row = db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as
    | Row
    | undefined;
  return row ? postFromRow(row, imagesForPost(id)) : null;
}

function setPostImages(postId: string, imageIds: string[]) {
  db.prepare("DELETE FROM post_images WHERE post_id = ?").run(postId);
  const stmt = db.prepare(
    "INSERT OR IGNORE INTO post_images (post_id, image_id, position) VALUES (?, ?, ?)"
  );
  imageIds.forEach((imageId, index) => stmt.run(postId, imageId, index));
}

export function createPost(input: {
  theme?: string;
  title: string;
  body: string;
  hashtags: string[];
  campaign?: string;
  eventId?: string | null;
  eventName?: string | null;
  status?: PostStatus;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  coverImageId?: string | null;
  note?: string;
  autoPublish?: boolean;
  images?: string[];
}): Post {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const imageIds = input.images || [];
  const cover = input.coverImageId && imageIds.includes(input.coverImageId)
    ? input.coverImageId
    : imageIds[0] || null;
  tx(() => {
    db.prepare(
      `INSERT INTO posts
        (id, theme, title, body, hashtags, campaign, event_id, event_name, status, scheduled_date, scheduled_time, cover_image_id, note, auto_publish, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      input.theme || "",
      input.title,
      input.body,
      JSON.stringify(input.hashtags || []),
      input.campaign || "",
      input.eventId || null,
      input.eventName || null,
      input.status || "draft",
      input.scheduledDate || null,
      input.scheduledTime || null,
      cover,
      input.note || "",
      input.autoPublish ? 1 : 0,
      now,
      now
    );
    setPostImages(id, imageIds);
  });
  recomputeImageStatuses();
  return getPost(id)!;
}

export function updatePost(
  id: string,
  patch: {
    theme?: string;
    title?: string;
    body?: string;
    hashtags?: string[];
    campaign?: string;
    eventId?: string | null;
    eventName?: string | null;
    status?: PostStatus;
    scheduledDate?: string | null;
    scheduledTime?: string | null;
    publishedAt?: string | null;
    coverImageId?: string | null;
    note?: string;
    autoPublish?: boolean;
    publishError?: string | null;
    publishAttemptedAt?: string | null;
    xhsUrl?: string | null;
    images?: string[];
  }
): Post | null {
  const existing = getPost(id);
  if (!existing) return null;
  const sets: string[] = [];
  const params: (string | number | null)[] = [];
  if (patch.theme !== undefined) {
    sets.push("theme = ?");
    params.push(patch.theme);
  }
  if (patch.title !== undefined) {
    sets.push("title = ?");
    params.push(patch.title);
  }
  if (patch.body !== undefined) {
    sets.push("body = ?");
    params.push(patch.body);
  }
  if (patch.hashtags !== undefined) {
    sets.push("hashtags = ?");
    params.push(JSON.stringify(patch.hashtags));
  }
  if (patch.campaign !== undefined) {
    sets.push("campaign = ?");
    params.push(patch.campaign);
  }
  if (patch.eventId !== undefined) {
    sets.push("event_id = ?");
    params.push(patch.eventId);
  }
  if (patch.eventName !== undefined) {
    sets.push("event_name = ?");
    params.push(patch.eventName);
  }
  if (patch.status !== undefined) {
    sets.push("status = ?");
    params.push(patch.status);
  }
  if (patch.scheduledDate !== undefined) {
    sets.push("scheduled_date = ?");
    params.push(patch.scheduledDate);
  }
  if (patch.scheduledTime !== undefined) {
    sets.push("scheduled_time = ?");
    params.push(patch.scheduledTime);
  }
  if (patch.publishedAt !== undefined) {
    sets.push("published_at = ?");
    params.push(patch.publishedAt);
  }
  if (patch.note !== undefined) {
    sets.push("note = ?");
    params.push(patch.note);
  }
  if (patch.autoPublish !== undefined) {
    sets.push("auto_publish = ?");
    params.push(patch.autoPublish ? 1 : 0);
  }
  if (patch.publishError !== undefined) {
    sets.push("publish_error = ?");
    params.push(patch.publishError);
  }
  if (patch.publishAttemptedAt !== undefined) {
    sets.push("publish_attempted_at = ?");
    params.push(patch.publishAttemptedAt);
  }
  if (patch.xhsUrl !== undefined) {
    sets.push("xhs_url = ?");
    params.push(patch.xhsUrl);
  }

  const imageIds = patch.images !== undefined ? patch.images : existing.images.map((i) => i.id);
  let coverId = patch.coverImageId !== undefined ? patch.coverImageId : existing.coverImageId;
  if (!coverId || !imageIds.includes(coverId)) coverId = imageIds[0] || null;
  if (patch.coverImageId !== undefined || patch.images !== undefined) {
    sets.push("cover_image_id = ?");
    params.push(coverId);
  }

  sets.push("updated_at = ?");
  params.push(new Date().toISOString());
  params.push(id);

  tx(() => {
    db.prepare(`UPDATE posts SET ${sets.join(", ")} WHERE id = ?`).run(...params);
    if (patch.images !== undefined) setPostImages(id, imageIds);
  });
  recomputeImageStatuses();
  return getPost(id);
}

export function setPostPublished(id: string, published: boolean): Post | null {
  const existing = getPost(id);
  if (!existing) return null;
  const today = todayStr();
  if (published) {
    db.prepare(
      "UPDATE posts SET status = 'published', published_at = ?, published_date = ?, scheduled_date = COALESCE(scheduled_date, ?), publish_error = NULL, publish_attempt_count = 0, updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), today, today, new Date().toISOString(), id);
  } else {
    db.prepare(
      "UPDATE posts SET status = 'ready', published_at = NULL, published_date = NULL, xhs_url = NULL, publish_attempt_count = 0, updated_at = ? WHERE id = ?"
    ).run(new Date().toISOString(), id);
  }
  recomputeImageStatuses();
  return getPost(id);
}

export function deletePost(id: string) {
  db.prepare("DELETE FROM posts WHERE id = ?").run(id);
  recomputeImageStatuses();
}

export function recordPublishSuccess(id: string, url: string | null): Post | null {
  const now = new Date().toISOString();
  db.prepare(
    `UPDATE posts SET status = 'published', published_at = ?, published_date = ?, scheduled_date = COALESCE(scheduled_date, ?),
       xhs_url = ?, publish_error = NULL, publish_attempted_at = ?, publish_attempt_count = 0, updated_at = ? WHERE id = ?`
  ).run(now, todayStr(), todayStr(), url, now, now, id);
  recomputeImageStatuses();
  return getPost(id);
}

export function recordPublishFailure(id: string, error: string): Post | null {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE posts SET publish_error = ?, publish_attempted_at = ?, publish_attempt_count = publish_attempt_count + 1, updated_at = ? WHERE id = ?"
  ).run(error.slice(0, 2000), now, now, id);
  return getPost(id);
}

export function listDueAutoPosts(): Post[] {
  const rows = db
    .prepare(
      "SELECT * FROM posts WHERE status = 'ready' AND auto_publish = 1 AND scheduled_date IS NOT NULL AND publish_attempt_count < 3"
    )
    .all() as Row[];
  const now = Date.now();
  const fallbackTime = getSettings().default_time || "19:30";
  return rows
    .map((row) => postFromRow(row, imagesForPost(str(row.id))))
    .filter((post) => {
      if (!post.scheduledDate) return false;
      const at = parseDateStr(post.scheduledDate);
      const [hour, minute] = (post.scheduledTime || fallbackTime)
        .split(":")
        .map(Number);
      at.setHours(hour || 0, minute || 0, 0, 0);
      if (at.getTime() > now) return false;
      if (
        post.publishAttemptedAt &&
        now - new Date(post.publishAttemptedAt).getTime() < 15 * 60 * 1000
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) =>
      `${a.scheduledDate}${a.scheduledTime || ""}`.localeCompare(
        `${b.scheduledDate}${b.scheduledTime || ""}`
      )
    );
}

export function calendarPosts(month: string): Post[] {
  const start = parseDateStr(`${month}-01`);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
  const rows = db
    .prepare(
      `SELECT * FROM posts
       WHERE (status = 'published' AND (published_date LIKE ? OR (published_date IS NULL AND published_at LIKE ?)))
          OR (status != 'published' AND scheduled_date LIKE ?)
          OR (status != 'published' AND scheduled_date IS NULL AND created_at >= ? AND created_at < ?)
       ORDER BY COALESCE(
         CASE WHEN status = 'published' THEN published_date ELSE scheduled_date END,
         substr(created_at, 1, 10)
       ) ASC`
    )
    .all(
      `${month}%`,
      `${month}%`,
      `${month}%`,
      start.toISOString(),
      end.toISOString()
    ) as Row[];
  return rows.map((row) => postFromRow(row, imagesForPost(str(row.id))));
}

export function countUnusedCampaignImages(campaign: string): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) AS c FROM images WHERE campaign = ? AND status = 'unused' AND manual_used = 0 AND kind = 'image'"
    )
    .get(campaign) as Row;
  return num(row.c);
}

export function countFutureCampaignPosts(campaign: string, from: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM posts
       WHERE campaign = ? AND status = 'ready' AND scheduled_date IS NOT NULL AND scheduled_date >= ?`
    )
    .get(campaign, from) as Row;
  return num(row.c);
}

export function shotIdeaFromRow(row: Row): ShotIdea {
  return {
    id: str(row.id),
    campaign: str(row.campaign),
    category: str(row.category),
    title: str(row.title),
    location: str(row.location),
    subject: str(row.subject),
    composition: str(row.composition),
    lighting: str(row.lighting),
    props: str(row.props),
    caption: str(row.caption),
    priority: num(row.priority) || 2,
    done: num(row.done) === 1,
    source: str(row.source, "curated"),
    createdAt: str(row.created_at),
  };
}

export function getShotIdea(id: string): ShotIdea | null {
  const row = db.prepare("SELECT * FROM shot_ideas WHERE id = ?").get(id) as
    | Row
    | undefined;
  return row ? shotIdeaFromRow(row) : null;
}

export function listShotIdeas(campaign: string): ShotIdea[] {
  const rows = db
    .prepare(
      `SELECT * FROM shot_ideas WHERE campaign = ?
       ORDER BY priority ASC, created_at DESC`
    )
    .all(campaign) as Row[];
  return rows.map(shotIdeaFromRow);
}

export function insertShotIdeas(
  campaign: string,
  ideas: Array<{
    category: string;
    title: string;
    location?: string;
    subject?: string;
    composition?: string;
    lighting?: string;
    props?: string;
    caption?: string;
    priority?: number;
    source?: string;
  }>
): ShotIdea[] {
  const stmt = db.prepare(
    `INSERT INTO shot_ideas
      (id, campaign, category, title, location, subject, composition, lighting, props, caption, priority, done, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
  );
  const ids: string[] = [];
  const now = new Date().toISOString();
  tx(() => {
    for (const idea of ideas) {
      const id = crypto.randomUUID();
      ids.push(id);
      stmt.run(
        id,
        campaign,
        idea.category || "门店探店",
        idea.title,
        idea.location || "",
        idea.subject || "",
        idea.composition || "",
        idea.lighting || "",
        idea.props || "",
        idea.caption || "",
        Math.min(3, Math.max(1, Number(idea.priority) || 2)),
        idea.source || "curated",
        now
      );
    }
  });
  return ids.map((id) => getShotIdea(id)!).filter(Boolean);
}

export function setShotIdeaDone(id: string, done: boolean): ShotIdea | null {
  db.prepare("UPDATE shot_ideas SET done = ? WHERE id = ?").run(
    done ? 1 : 0,
    id
  );
  return getShotIdea(id);
}

export function deleteShotIdea(id: string) {
  db.prepare("DELETE FROM shot_ideas WHERE id = ?").run(id);
}

export function clearShotIdeas(campaign: string) {
  db.prepare("DELETE FROM shot_ideas WHERE campaign = ?").run(campaign);
}

export function countCampaignPosts(
  campaign: string,
  status?: string
): number {
  const row = (
    status && status !== "all"
      ? db
          .prepare("SELECT COUNT(*) AS c FROM posts WHERE campaign = ? AND status = ?")
          .get(campaign, status)
      : db
          .prepare("SELECT COUNT(*) AS c FROM posts WHERE campaign = ?")
          .get(campaign)
  ) as Row;
  return num(row.c);
}

export function countPublishedCampaignPostsInRange(
  campaign: string,
  fromIso: string,
  toIso: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM posts
       WHERE campaign = ? AND status = 'published'
         AND published_at IS NOT NULL AND published_at >= ? AND published_at < ?`
    )
    .get(campaign, fromIso, toIso) as Row;
  return num(row.c);
}

export function countPublishedForWeeklyCap(
  campaign: string,
  fromIso: string,
  toIso: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM posts p
       LEFT JOIN events e ON e.id = p.event_id
       WHERE p.status = 'published' AND p.published_at IS NOT NULL
         AND p.published_at >= ? AND p.published_at < ?
         AND (p.campaign = ? OR (p.event_id IS NOT NULL AND e.counts_weekly = 1))`
    )
    .get(fromIso, toIso, campaign) as Row;
  return num(row.c);
}

export function countPublishedCampaignPosts(
  campaign: string,
  monthPrefix: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM posts
       WHERE campaign = ? AND status = 'published' AND published_date LIKE ?`
    )
    .get(campaign, `${monthPrefix}%`) as Row;
  return num(row.c);
}

export function listCampaignPosts(
  campaign: string,
  options?: { status?: string; from?: string; to?: string; limit?: number }
): Post[] {
  const clauses = ["campaign = ?"];
  const params: (string | number)[] = [campaign];
  if (options?.status && options.status !== "all") {
    clauses.push("status = ?");
    params.push(options.status);
  }
  if (options?.from) {
    clauses.push("scheduled_date >= ?");
    params.push(options.from);
  }
  if (options?.to) {
    clauses.push("scheduled_date <= ?");
    params.push(options.to);
  }
  const limit = Math.max(1, Math.min(200, options?.limit || 50));
  const rows = db
    .prepare(
      `SELECT * FROM posts WHERE ${clauses.join(" AND ")}
       ORDER BY COALESCE(scheduled_date, '') ASC, COALESCE(scheduled_time, '') ASC, created_at DESC
       LIMIT ?`
    )
    .all(...params, limit) as Row[];
  return rows.map((row) => postFromRow(row, imagesForPost(str(row.id))));
}

export function recentCampaignPostTitles(campaign: string, limit = 40): string[] {
  const rows = db
    .prepare(
      "SELECT title FROM posts WHERE campaign = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(campaign, Math.max(1, Math.min(200, limit))) as Row[];
  return rows.map((row) => str(row.title)).filter(Boolean);
}

export function assignScheduleDates(
  startDate: string,
  count: number,
  perDay: number
): string[] {
  const usage = new Map<string, number>();
  const rows = db
    .prepare(
      "SELECT scheduled_date, COUNT(*) AS c FROM posts WHERE scheduled_date IS NOT NULL GROUP BY scheduled_date"
    )
    .all() as Row[];
  for (const row of rows) usage.set(str(row.scheduled_date), num(row.c));

  const result: string[] = [];
  let cursor = startDate;
  let guard = 0;
  while (result.length < count && guard < 3650) {
    guard++;
    const used = usage.get(cursor) || 0;
    if (used < Math.max(1, perDay)) {
      result.push(cursor);
      usage.set(cursor, used + 1);
    }
    if (result.length < count && (usage.get(cursor) || 0) >= Math.max(1, perDay)) {
      cursor = addDays(cursor, 1);
    }
  }
  return result;
}

function mondayOf(dateStr: string): string {
  const date = parseDateStr(dateStr);
  const weekday = (date.getDay() + 6) % 7;
  return addDays(dateStr, -weekday);
}

export function assignCampaignDates(
  campaign: string,
  startDate: string,
  count: number,
  weeklyCap: number
): string[] {
  const cap = Math.max(1, Math.min(4, weeklyCap));
  const preferred = [0, 2, 4, 5].slice(0, cap);
  const allowedWeekdays = new Set(preferred);

  const usage = new Map<string, number>();
  const rows = db
    .prepare(
      "SELECT scheduled_date, COUNT(*) AS c FROM posts WHERE scheduled_date IS NOT NULL GROUP BY scheduled_date"
    )
    .all() as Row[];
  for (const row of rows) usage.set(str(row.scheduled_date), num(row.c));

  const weekUsage = new Map<string, number>();
  const campaignRows = db
    .prepare(
      "SELECT scheduled_date, COUNT(*) AS c FROM posts WHERE campaign = ? AND scheduled_date IS NOT NULL GROUP BY scheduled_date"
    )
    .all(campaign) as Row[];
  for (const row of campaignRows) {
    const date = str(row.scheduled_date);
    const key = mondayOf(date);
    weekUsage.set(key, (weekUsage.get(key) || 0) + num(row.c));
  }

  const result: string[] = [];
  let cursor = startDate;
  let guard = 0;
  while (result.length < count && guard < 3650) {
    guard++;
    const date = parseDateStr(cursor);
    const weekday = (date.getDay() + 6) % 7;
    const weekKey = mondayOf(cursor);
    const usedWeek = weekUsage.get(weekKey) || 0;
    const usedDay = usage.get(cursor) || 0;
    if (
      allowedWeekdays.has(weekday) &&
      usedWeek < cap &&
      usedDay < 1
    ) {
      result.push(cursor);
      weekUsage.set(weekKey, usedWeek + 1);
      usage.set(cursor, usedDay + 1);
    }
    cursor = addDays(cursor, 1);
  }
  return result;
}

export function defaultStartDate() {
  return addDays(todayStr(), 1);
}

export function eventFromRow(row: Row): Event {
  const id = str(row.id);
  return {
    id,
    name: str(row.name, "未命名活动"),
    startDate: str(row.start_date),
    endDate: str(row.end_date),
    requiredTopics: parseArray(row.required_topics),
    quota: Math.max(1, num(row.quota) || 1),
    countsWeekly: num(row.counts_weekly) === 1,
    publishTime: str(row.publish_time, "21:30"),
    minImages: Math.max(1, num(row.min_images) || 6),
    minBody: Math.max(1, num(row.min_body) || 50),
    collectionForm: str(row.collection_form),
    collectionUrl: str(row.collection_url),
    internal: num(row.internal) === 1,
    officialAssets: num(row.official_assets) === 1,
    brief: str(row.brief),
    note: str(row.note),
    formSubmitted: num(row.form_submitted) === 1,
    xiaoyanjingRegistered: num(row.xiaoyanjing_registered) === 1,
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    counts: eventPostCounts(id),
  };
}

export function eventPostCounts(eventId: string) {
  const rows = db
    .prepare(
      "SELECT status, COUNT(*) AS c FROM posts WHERE event_id = ? GROUP BY status"
    )
    .all(eventId) as Row[];
  const counts = { total: 0, draft: 0, ready: 0, published: 0, active: 0 };
  for (const row of rows) {
    const key = str(row.status) as "draft" | "ready" | "published";
    if (key in counts) counts[key] = num(row.c);
    counts.total += num(row.c);
  }
  counts.active = counts.ready + counts.published;
  return counts;
}

export function listEvents(): Event[] {
  const rows = db
    .prepare("SELECT * FROM events ORDER BY start_date DESC, created_at DESC")
    .all() as Row[];
  return rows.map(eventFromRow);
}

export function getEventRow(id: string): Event | null {
  const row = db.prepare("SELECT * FROM events WHERE id = ?").get(id) as
    | Row
    | undefined;
  return row ? eventFromRow(row) : null;
}

export const getEvent = getEventRow;

export function insertEvent(input: {
  name: string;
  startDate: string;
  endDate: string;
  requiredTopics: string[];
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
}): Event {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO events
      (id, name, start_date, end_date, required_topics, quota, counts_weekly,
       publish_time, min_images, min_body, collection_form, collection_url, internal,
       official_assets, brief, note, form_submitted, xiaoyanjing_registered,
       created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  ).run(
    id,
    input.name.trim(),
    input.startDate,
    input.endDate,
    JSON.stringify(input.requiredTopics || []),
    Math.max(1, Math.min(10, Math.round(input.quota || 1))),
    input.countsWeekly ? 1 : 0,
    input.publishTime || "21:30",
    Math.max(1, Math.min(9, Math.round(input.minImages || 6))),
    Math.max(1, Math.min(1000, Math.round(input.minBody || 50))),
    (input.collectionForm || "").trim(),
    (input.collectionUrl || "").trim(),
    input.internal ? 1 : 0,
    input.officialAssets ? 1 : 0,
    input.brief || "",
    input.note || "",
    now,
    now
  );
  return getEvent(id)!;
}

export function updateEvent(
  id: string,
  patch: {
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
  }
): Event | null {
  const current = getEvent(id);
  if (!current) return null;
  db.prepare(
    `UPDATE events SET name = ?, start_date = ?, end_date = ?, required_topics = ?,
       quota = ?, counts_weekly = ?, publish_time = ?, min_images = ?, min_body = ?,
       collection_form = ?, collection_url = ?, internal = ?, official_assets = ?,
       brief = ?, note = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    (patch.name ?? current.name).trim(),
    patch.startDate ?? current.startDate,
    patch.endDate ?? current.endDate,
    JSON.stringify(patch.requiredTopics ?? current.requiredTopics),
    Math.max(1, Math.min(10, Math.round(patch.quota ?? current.quota))),
    (patch.countsWeekly ?? current.countsWeekly) ? 1 : 0,
    patch.publishTime ?? current.publishTime,
    Math.max(1, Math.min(9, Math.round(patch.minImages ?? current.minImages))),
    Math.max(1, Math.min(1000, Math.round(patch.minBody ?? current.minBody))),
    (patch.collectionForm ?? current.collectionForm).trim(),
    (patch.collectionUrl ?? current.collectionUrl).trim(),
    (patch.internal ?? current.internal) ? 1 : 0,
    (patch.officialAssets ?? current.officialAssets) ? 1 : 0,
    patch.brief ?? current.brief,
    patch.note ?? current.note,
    new Date().toISOString(),
    id
  );
  return getEvent(id);
}

export function deleteEvent(id: string) {
  tx(() => {
    db.prepare(
      "UPDATE posts SET event_id = NULL, event_name = NULL, updated_at = ? WHERE event_id = ?"
    ).run(new Date().toISOString(), id);
    db.prepare("DELETE FROM events WHERE id = ?").run(id);
  });
}

export function setEventChecklist(
  id: string,
  patch: { formSubmitted?: boolean; xiaoyanjingRegistered?: boolean }
): Event | null {
  const current = getEvent(id);
  if (!current) return null;
  db.prepare(
    "UPDATE events SET form_submitted = ?, xiaoyanjing_registered = ?, updated_at = ? WHERE id = ?"
  ).run(
    (patch.formSubmitted ?? current.formSubmitted) ? 1 : 0,
    (patch.xiaoyanjingRegistered ?? current.xiaoyanjingRegistered) ? 1 : 0,
    new Date().toISOString(),
    id
  );
  return getEvent(id);
}

export function countEventPosts(eventId: string, statuses?: PostStatus[]) {
  if (statuses?.length) {
    const placeholders = statuses.map(() => "?").join(",");
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM posts WHERE event_id = ? AND status IN (${placeholders})`
      )
      .get(eventId, ...statuses) as Row;
    return num(row.c);
  }
  const row = db
    .prepare("SELECT COUNT(*) AS c FROM posts WHERE event_id = ?")
    .get(eventId) as Row;
  return num(row.c);
}

export function listEventPosts(eventId: string): Post[] {
  const rows = db
    .prepare(
      "SELECT * FROM posts WHERE event_id = ? ORDER BY COALESCE(scheduled_date, '') ASC, created_at DESC"
    )
    .all(eventId) as Row[];
  return rows.map((row) => postFromRow(row, imagesForPost(str(row.id))));
}

export function stats() {
  const imageCounts = db
    .prepare("SELECT status, COUNT(*) AS c FROM images GROUP BY status")
    .all() as Row[];
  const images = { total: 0, unused: 0, reserved: 0, used: 0, analyzed: 0 };
  for (const row of imageCounts) {
    const key = str(row.status) as "unused" | "reserved" | "used";
    if (key in images) images[key] = num(row.c);
    images.total += num(row.c);
  }
  images.analyzed = num(
    (db.prepare("SELECT COUNT(*) AS c FROM images WHERE analysis IS NOT NULL").get() as Row).c
  );

  const postCounts = db
    .prepare("SELECT status, COUNT(*) AS c FROM posts GROUP BY status")
    .all() as Row[];
  const posts = { total: 0, draft: 0, ready: 0, published: 0, publishedThisMonth: 0, failed: 0, dueToday: 0, overdue: 0, unscheduled: 0 };
  for (const row of postCounts) {
    const key = str(row.status) as "draft" | "ready" | "published";
    if (key in posts) posts[key] = num(row.c);
    posts.total += num(row.c);
  }
  const month = todayStr().slice(0, 7);
  posts.publishedThisMonth = num(
    (
      db
        .prepare("SELECT COUNT(*) AS c FROM posts WHERE status = 'published' AND published_date LIKE ?")
        .get(`${month}%`) as Row
    ).c
  );

  const today = todayStr();
  const failed = num(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM posts WHERE status = 'ready' AND publish_error IS NOT NULL"
        )
        .get() as Row
    ).c
  );
  const dueToday = num(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM posts WHERE status = 'ready' AND scheduled_date = ?"
        )
        .get(today) as Row
    ).c
  );
  const overdue = num(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM posts WHERE status = 'ready' AND scheduled_date IS NOT NULL AND scheduled_date < ?"
        )
        .get(today) as Row
    ).c
  );
  const unscheduled = num(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM posts WHERE status IN ('draft','ready') AND (scheduled_date IS NULL OR scheduled_date = '')"
        )
        .get() as Row
    ).c
  );
  const upcomingRows = db
    .prepare(
      `SELECT * FROM posts WHERE status != 'published' AND scheduled_date IS NOT NULL AND scheduled_date >= ?
       ORDER BY scheduled_date ASC LIMIT 6`
    )
    .all(today) as Row[];
  const upcoming = upcomingRows.map((row) =>
    postFromRow(row, imagesForPost(str(row.id)))
  );

  const recentRows = db
    .prepare("SELECT * FROM posts ORDER BY updated_at DESC LIMIT 4")
    .all() as Row[];
  const recent = recentRows.map((row) => postFromRow(row, imagesForPost(str(row.id))));

  const unanalyzed = images.total - images.analyzed;
  posts.failed = failed;
  posts.dueToday = dueToday;
  posts.overdue = overdue;
  posts.unscheduled = unscheduled;
  return { images: { ...images, unanalyzed }, posts, upcoming, recent };
}

export function monthDateOfPost(post: Post) {
  return (
    post.publishedDate ||
    post.scheduledDate ||
    (post.publishedAt ? toDateStr(new Date(post.publishedAt)) : "")
  );
}

export function isSameMonth(date: string, month: string) {
  return date.startsWith(`${month}-`);
}

export function todayDateObj() {
  return parseDateStr(todayStr());
}
