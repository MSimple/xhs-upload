import {
  countEventPosts,
  countPublishedCampaignPostsInRange,
  countPublishedForWeeklyCap,
  getEvent,
  getSettings,
  listDueAutoPosts,
  recordPublishFailure,
  recordPublishSuccess,
} from "./db";
import {
  campaignPublishBlockers,
  campaignWeeklyCap,
  currentDayRange,
  currentWeekRange,
} from "./campaign-rules";
import {
  getXhsStatus,
  hasXhsProfile,
  isPostPublishing,
  isXhsLoginInProgress,
  isXhsPublishing,
  isXhsSyncing,
  publishPostToXhs,
} from "./xhs";
import { ensureCampaignQueue } from "./campaign";
import { eventPublishBlockers } from "./event-rules";

const globalForScheduler = globalThis as unknown as {
  __xhsSchedulerStarted?: boolean;
  __xhsSchedulerTicking?: boolean;
};

async function tick() {
  if (globalForScheduler.__xhsSchedulerTicking) return;
  globalForScheduler.__xhsSchedulerTicking = true;
  try {
    void ensureCampaignQueue().catch((error) => {
      console.error("[campaign] auto plan failed:", error);
    });

    const settings = getSettings();
    if (settings.xhs_scheduler !== "1") return;
    if (!hasXhsProfile()) return;
    if (isXhsPublishing() || isXhsLoginInProgress() || isXhsSyncing()) return;
    if (getXhsStatus().loggedIn === false) return;

    const week = currentWeekRange();
    const day = currentDayRange();
    const weeklyPublished = countPublishedForWeeklyCap(
      settings.campaign_name,
      week.from,
      week.to
    );
    const todayPublished = countPublishedCampaignPostsInRange(
      settings.campaign_name,
      day.from,
      day.to
    );
    const weeklyCap = campaignWeeklyCap(settings);
    const due = listDueAutoPosts().filter((post) => {
      if (isPostPublishing(post.id)) return false;
      if (post.eventId) {
        const event = getEvent(post.eventId);
        if (!event) return false;
        const active = countEventPosts(event.id, ["ready", "published"]);
        const other = Math.max(0, active - 1);
        if (eventPublishBlockers(post, event, other).errors.length) return false;
        if (event.countsWeekly && weeklyPublished >= weeklyCap) return false;
      }
      if (!post.campaign) return true;
      if (todayPublished >= 1) return false;
      if (weeklyPublished >= weeklyCap) return false;
      if (campaignPublishBlockers(post, settings).length) return false;
      return true;
    });
    if (!due.length) return;

    const post = due[0];
    console.log(`[scheduler] auto publishing ${post.id} · ${post.title}`);
    try {
      const url = await publishPostToXhs(post);
      recordPublishSuccess(post.id, url);
      console.log(`[scheduler] published ${post.id}${url ? ` · ${url}` : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recordPublishFailure(post.id, message);
      console.error(`[scheduler] publish failed ${post.id}:`, message);
    }
  } catch (error) {
    console.error("[scheduler] tick failed:", error);
  } finally {
    globalForScheduler.__xhsSchedulerTicking = false;
  }
}

export function startScheduler() {
  if (globalForScheduler.__xhsSchedulerStarted) return;
  globalForScheduler.__xhsSchedulerStarted = true;
  setTimeout(() => void tick(), 20_000);
  setInterval(() => void tick(), 60_000);
  console.log("[scheduler] xiaohongshu auto-publish scheduler started");
}
