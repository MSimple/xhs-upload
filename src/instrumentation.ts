export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  } catch (error) {
    console.error("[scheduler] failed to start:", error);
  }
}
