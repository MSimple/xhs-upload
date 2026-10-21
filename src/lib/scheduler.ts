import { ensureCampaignQueue } from "./campaign";

const globalForScheduler = globalThis as unknown as {
  __xhsSchedulerStarted?: boolean;
  __xhsSchedulerTicking?: boolean;
};

async function tick() {
  if (globalForScheduler.__xhsSchedulerTicking) return;
  globalForScheduler.__xhsSchedulerTicking = true;
  try {
    await ensureCampaignQueue();
  } catch (error) {
    console.error("[scheduler] campaign auto-plan failed:", error);
  } finally {
    globalForScheduler.__xhsSchedulerTicking = false;
  }
}

export function startScheduler() {
  if (globalForScheduler.__xhsSchedulerStarted) return;
  globalForScheduler.__xhsSchedulerStarted = true;
  setTimeout(() => void tick(), 20_000);
  setInterval(() => void tick(), 60_000);
}
