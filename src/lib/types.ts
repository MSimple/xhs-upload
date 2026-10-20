export type ImageStatus = "unused" | "reserved" | "used";
export type PostStatus = "draft" | "ready" | "published";
export type MediaKind = "image" | "video" | "gif";
export type PostMediaType = "image" | "video";

export interface ImageAnalysis {
  summary: string;
  subject: string;
  scene: string;
  objects: string[];
  mood: string;
  colors: string[];
  tags: string[];
  topics: string[];
  quality: number;
  orientation: string;
  mock?: boolean;
}

export interface Photo {
  id: string;
  originalName: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  kind: MediaKind;
  duration: number;
  status: ImageStatus;
  manualUsed: boolean;
  campaign: string;
  analysis: ImageAnalysis | null;
  summary: string | null;
  tags: string[];
  scene: string | null;
  mood: string | null;
  createdAt: string;
  analyzedAt: string | null;
  previewUrl: string;
  thumbUrl: string;
  originalUrl: string;
}

export interface Post {
  id: string;
  theme: string;
  title: string;
  body: string;
  hashtags: string[];
  campaign: string;
  eventId: string | null;
  eventName: string | null;
  status: PostStatus;
  scheduledDate: string | null;
  scheduledTime: string | null;
  publishedAt: string | null;
  publishedDate: string | null;
  coverImageId: string | null;
  note: string;
  autoPublish: boolean;
  publishError: string | null;
  publishAttemptedAt: string | null;
  publishAttemptCount: number;
  xhsUrl: string | null;
  createdAt: string;
  updatedAt: string;
  mediaType: PostMediaType;
  images: Photo[];
  cover: Photo | null;
}

export interface ShotIdea {
  id: string;
  campaign: string;
  category: string;
  title: string;
  location: string;
  subject: string;
  composition: string;
  lighting: string;
  props: string;
  caption: string;
  priority: number;
  done: boolean;
  source: string;
  createdAt: string;
}

export interface PlannedPost {
  theme: string;
  title: string;
  body: string;
  hashtags: string[];
  track?: string;
  imageIds: string[];
  coverImageId: string;
  publishTime: string;
  reason: string;
}

export interface Settings {
  ai_base_url: string;
  ai_api_key: string;
  ai_vision_model: string;
  ai_text_model: string;
  ai_enabled: string;
  persona: string;
  tone: string;
  signature: string;
  default_time: string;
  posts_per_day: string;
  auto_analyze: string;
  xhs_scheduler: string;
  xhs_headless: string;
  campaign_enabled: string;
  campaign_name: string;
  campaign_city: string;
  campaign_official_topic: string;
  campaign_model: string;
  campaign_track: string;
  campaign_registered: string;
  campaign_tier: string;
  campaign_weekly_posts: string;
  campaign_buffer_weeks: string;
  campaign_daily_posts: string;
  campaign_body_min: string;
  campaign_time: string;
  campaign_auto_plan: string;
  campaign_auto_publish: string;
  campaign_start_date: string;
  campaign_buffer_days: string;
  campaign_batch_images: string;
  campaign_points_per_post: string;
  campaign_points_cap: string;
  campaign_last_plan_at: string;
  campaign_announcement_raw: string;
  campaign_announcement_links: string;
  campaign_announcement_month: string;
  campaign_announcement_at: string;
}

export type SettingsInput = Partial<Settings>;

export type PlatformRange = "7" | "30";

export interface PlatformMetrics {
  period: string;
  exposure: string;
  views: string;
  coverCtr: string;
  averageWatch: string;
  totalWatch: string;
  completion: string;
  likes: string;
  comments: string;
  collects: string;
  shares: string;
  netFollowers: string;
  newFollowers: string;
  unfollows: string;
  homepageVisitors: string;
}

export interface PlatformDiagnosisItem {
  label: string;
  value: string;
  percentile: number | null;
}

export interface PlatformNoteRow {
  title: string;
  publishedAt: string;
  exposure: string;
  views: string;
  coverCtr: string;
  likes: string;
  comments: string;
  collects: string;
  follows: string;
  shares: string;
  avgWatch: string;
  danmaku: string;
}

export interface PlatformFans {
  range: string;
  total: number;
  newFans: number;
  lostFans: number;
  male: number | null;
  female: number | null;
  interests: string[];
  regionNote: string;
  sourceNote: string;
  activeNote: string;
}

export type CampaignProgressPhase =
  | "idle"
  | "starting"
  | "analyzing"
  | "planning"
  | "creating"
  | "done"
  | "error";

export interface CampaignProgress {
  running: boolean;
  source: "manual" | "auto" | null;
  phase: CampaignProgressPhase;
  message: string;
  batch: number;
  totalBatches: number;
  analyzed: number;
  created: number;
  remaining: number;
  startedAt: string | null;
  updatedAt: string | null;
  error: string | null;
}

export interface PlatformSnapshot {
  syncedAt: string;
  account: {
    following: number;
    followers: number;
    likesCollects: number;
    noteCount: number;
    status: string;
  };
  metrics: {
    "7": PlatformMetrics;
    "30": PlatformMetrics;
  };
  diagnosis: PlatformDiagnosisItem[];
  notes: PlatformNoteRow[];
  notesTotal: number;
  fans: PlatformFans;
  warnings?: string[];
}


export interface Event {
  id: string;
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
  note: string;
  formSubmitted: boolean;
  xiaoyanjingRegistered: boolean;
  createdAt: string;
  updatedAt: string;
  counts: {
    total: number;
    draft: number;
    ready: number;
    published: number;
    active: number;
  };
}
