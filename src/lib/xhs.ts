import { spawn } from "node:child_process";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import {
  DATA_DIR,
  getImageFileNames,
  getPost,
  getSettings,
  UPLOAD_DIR,
} from "./db";
import { validatePostContent } from "./content-rules";
import {
  mergePlatformMetrics,
  parseAccount,
  parseDiagnosis,
  parseFans,
  parseHomeMetrics,
  parseNoteCount,
  parseNotes,
  parseNotesTotal,
  parseViewMetrics,
} from "./platform-parse";
import type { PlatformSnapshot, Post } from "./types";

const PUBLISH_URL =
  "https://creator.xiaohongshu.com/publish/publish?source=official&target=image";
const PUBLISH_VIDEO_URL =
  "https://creator.xiaohongshu.com/publish/publish?source=official&target=video";
const CREATOR_URL = "https://creator.xiaohongshu.com";
export const XHS_PROFILE_DIR = path.join(DATA_DIR, "xhs-profile");
export const SCREENSHOT_DIR = path.join(DATA_DIR, "publish-shots");

const publishingPosts = new Set<string>();

export function isPostPublishing(postId: string) {
  return publishingPosts.has(postId);
}

type XhsRuntime = {
  loggedIn: boolean | null;
  loginInProgress: boolean;
  loginContext: BrowserContext | null;
  publishing: boolean;
  syncing: boolean;
  chain: Promise<unknown>;
  lastError: string | null;
  lastCheckedAt: string | null;
};

const globalForXhs = globalThis as unknown as {
  __xhsRuntime?: XhsRuntime;
};

const runtime: XhsRuntime =
  globalForXhs.__xhsRuntime ??
  (globalForXhs.__xhsRuntime = {
    loggedIn: null,
    loginInProgress: false,
    loginContext: null,
    publishing: false,
    syncing: false,
    chain: Promise.resolve(),
    lastError: null,
    lastCheckedAt: null,
  });

let cachedBrowserPath: string | null | undefined;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function findBrowserPath(): string | null {
  if (cachedBrowserPath !== undefined) return cachedBrowserPath;

  const localAppData = process.env.LOCALAPPDATA || "";
  const candidates: string[] = [];
  if (process.env.XHS_BROWSER_PATH) candidates.push(process.env.XHS_BROWSER_PATH);

  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      path.join(localAppData, "Google\\Chrome\\Application\\chrome.exe"),
      path.join(localAppData, "Microsoft\\Edge\\Application\\msedge.exe")
    );
  } else if (process.platform === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    );
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge"
    );
  }

  cachedBrowserPath =
    candidates.find((candidate) => {
      try {
        return Boolean(candidate) && fs.existsSync(candidate);
      } catch {
        return false;
      }
    }) || null;
  return cachedBrowserPath;
}

export function hasXhsProfile() {
  return fs.existsSync(XHS_PROFILE_DIR);
}

function userAgent() {
  const chrome =
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
  if (process.platform === "darwin") {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${chrome}`;
  }
  if (process.platform === "linux") {
    return `Mozilla/5.0 (X11; Linux x86_64) ${chrome}`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${chrome}`;
}

async function launchContext(headless: boolean) {
  const executablePath = findBrowserPath();
  if (!executablePath) {
    throw new Error(
      "没有找到 Chrome 或 Edge 浏览器。请安装后重试，或设置环境变量 XHS_BROWSER_PATH 指向浏览器可执行文件。"
    );
  }
  fs.mkdirSync(XHS_PROFILE_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(XHS_PROFILE_DIR, {
    headless,
    executablePath,
    viewport: { width: 1440, height: 960 },
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    userAgent: userAgent(),
    ignoreDefaultArgs: ["--enable-automation"],
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-dev-shm-usage",
    ],
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined,
    });
  });
  context.setDefaultTimeout(30_000);
  return context;
}

async function closeContext(context: BrowserContext | null) {
  if (!context) return;
  try {
    await context.close();
  } catch {
    // ignore
  }
}

async function hasSessionCookies(context: BrowserContext) {
  try {
    const cookies = await context.cookies([CREATOR_URL]);
    return cookies.some(
      (cookie) =>
        Boolean(cookie.value) &&
        (cookie.name === "web_session" ||
          cookie.name === "galaxy_creator_session_id" ||
          cookie.name.toLowerCase().includes("web_session"))
    );
  } catch {
    return false;
  }
}

async function captureFailure(page: Page, post: Post) {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
    const file = path.join(SCREENSHOT_DIR, `${post.id}-${Date.now()}.png`);
    await page.screenshot({ path: file });
    console.error("[xhs] publish failed, screenshot saved to", file);
  } catch {
    // ignore screenshot failures
  }
}

export type XhsStatus = {
  loggedIn: boolean | null;
  loginInProgress: boolean;
  publishing: boolean;
  syncing: boolean;
  profileExists: boolean;
  browserPath: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
};

export function getXhsStatus(): XhsStatus {
  return {
    loggedIn: runtime.loggedIn,
    loginInProgress: runtime.loginInProgress,
    publishing: runtime.publishing,
    syncing: runtime.syncing,
    profileExists: hasXhsProfile(),
    browserPath: findBrowserPath(),
    lastError: runtime.lastError,
    lastCheckedAt: runtime.lastCheckedAt,
  };
}

export function isXhsPublishing() {
  return runtime.publishing || publishingPosts.size > 0;
}

export function isXhsLoginInProgress() {
  return runtime.loginInProgress;
}

export function isXhsSyncing() {
  return runtime.syncing;
}

async function loginPoll(context: BrowserContext) {
  const started = Date.now();
  let success = false;
  try {
    while (Date.now() - started < 10 * 60 * 1000) {
      if (runtime.loginContext !== context) return;
      const pages = context.pages();
      if (!pages.length) break;
      const page = pages[0];
      const url = page.url();
      const hasCookies = await hasSessionCookies(context);
      const text = await page
        .locator("body")
        .innerText({ timeout: 2000 })
        .catch(() => "");
      const loginUi = /(短信登录|扫码登录|登录即同意)/.test(text);
      const creatorUi =
        /(上传图文|发布笔记|填写标题|创作中心|笔记管理|数据中心)/.test(text);
      if (!url.includes("/login") && !loginUi && (hasCookies || creatorUi)) {
        success = true;
        break;
      }
      await sleep(2000);
    }
  } catch {
    // window closed by the user
  } finally {
    const isCurrent = runtime.loginContext === context;
    if (isCurrent) {
      runtime.loginContext = null;
      runtime.loginInProgress = false;
      runtime.loggedIn = success;
      runtime.lastCheckedAt = new Date().toISOString();
      if (success) {
        runtime.lastError = null;
        await sleep(1500);
      } else if (!runtime.lastError) {
        runtime.lastError = "登录窗口已关闭或等待超时，请重新登录";
      }
    }
    await closeContext(context);
  }
}

export async function startXhsLogin(): Promise<XhsStatus> {
  if (runtime.loginInProgress) return getXhsStatus();
  if (runtime.publishing || runtime.syncing) {
    throw new Error("正在发布或同步数据，请稍后再登录");
  }
  if (runtime.loginContext) {
    await closeContext(runtime.loginContext);
    runtime.loginContext = null;
  }

  runtime.loginInProgress = true;
  runtime.lastError = null;

  let context: BrowserContext;
  try {
    context = await launchContext(false);
  } catch (error) {
    runtime.loginInProgress = false;
    runtime.lastError = messageOf(error);
    throw error;
  }

  runtime.loginContext = context;
  const page = context.pages()[0] || (await context.newPage());
  try {
    await page.goto(PUBLISH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
  } catch (error) {
    runtime.lastError = `打开小红书登录页失败：${messageOf(error)}`;
  }

  void loginPoll(context);
  return getXhsStatus();
}

export async function checkXhsLogin(): Promise<XhsStatus> {
  if (runtime.loginInProgress) {
    throw new Error("登录窗口已打开，请先在浏览器里完成登录");
  }
  if (runtime.publishing || runtime.syncing) {
    throw new Error("正在发布或同步数据，请稍后再检测");
  }
  if (!hasXhsProfile()) {
    runtime.loggedIn = false;
    runtime.lastCheckedAt = new Date().toISOString();
    runtime.lastError = "还没有登录小红书";
    return getXhsStatus();
  }

  const context = await launchContext(true);
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto(PUBLISH_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await sleep(2500);
    const onLoginPage = page.url().includes("/login");
    const hasCookies = await hasSessionCookies(context);
    const text = await page
      .locator("body")
      .innerText({ timeout: 3000 })
      .catch(() => "");
    const loginUi = /(短信登录|扫码登录|登录即同意)/.test(text);
    const creatorUi =
      /(上传图文|发布笔记|填写标题|创作中心|笔记管理|数据中心)/.test(text);
    runtime.loggedIn =
      !onLoginPage && !loginUi && (hasCookies || creatorUi);
    runtime.lastCheckedAt = new Date().toISOString();
    runtime.lastError = runtime.loggedIn
      ? null
      : "登录已失效或尚未登录，请重新登录";
    return getXhsStatus();
  } catch (error) {
    runtime.lastError = messageOf(error);
    return getXhsStatus();
  } finally {
    await closeContext(context);
  }
}

export async function logoutXhs() {
  if (isXhsPublishing()) {
    throw new Error("正在自动发布，请稍后再退出登录");
  }
  if (runtime.loginContext) {
    await closeContext(runtime.loginContext);
    runtime.loginContext = null;
  }
  runtime.loginInProgress = false;
  runtime.loggedIn = false;
  runtime.lastError = null;
  runtime.lastCheckedAt = new Date().toISOString();
  try {
    fs.rmSync(XHS_PROFILE_DIR, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300,
    });
  } catch (error) {
    throw new Error(`清除登录信息失败：${messageOf(error)}`);
  }
}

async function dismissOverlays(page: Page) {
  for (const text of ["我知道了", "知道了", "稍后再说", "下次再说"]) {
    const button = page.getByRole("button", { name: text, exact: true }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click({ timeout: 2000 }).catch(() => {});
      await sleep(300);
    }
  }
}

async function waitForUploadedMedia(
  page: Page,
  expected: number,
  isVideoNote: boolean
) {
  const started = Date.now();
  const timeout = isVideoNote ? 300_000 : 180_000;
  const minimumWaitMs = 2000;
  const mediaLabel = isVideoNote ? "视频" : "图片";
  let readySince = 0;
  let lastState = "";
  console.log(`[xhs] waiting for ${expected} ${mediaLabel} to finish uploading`);

  while (Date.now() - started < timeout) {
    const state = await page
      .evaluate(({ expectedCount, video }) => {
        const isVisible = (element: Element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== "none" &&
            style.visibility !== "hidden"
          );
        };
        const bodyText = document.body.innerText || "";
        const previews = video
          ? Array.from(document.querySelectorAll("video")).filter(isVisible)
          : Array.from(
              document.querySelectorAll(".img-upload-area img.preview")
            ).filter(isVisible);
        const uploading = Array.from(
          document.querySelectorAll(".mask.uploading")
        ).filter(isVisible).length;
        const maskErrors = Array.from(
          document.querySelectorAll(".mask")
        )
          .filter(isVisible)
          .map((element) => (element.textContent || "").trim())
          .filter((text) => /(上传失败|处理失败|重新上传)/.test(text));
        const submit = document.querySelector("xhs-publish-btn");
        const previewsComplete =
          previews.length > 0 &&
          previews.every((element) => {
            if (element instanceof HTMLVideoElement) {
              return element.readyState >= 2;
            }
            const image = element as HTMLImageElement;
            return image.complete && image.naturalWidth > 0;
          });
        return {
          bodyError: /(上传失败|图片处理失败|视频处理失败)/.test(bodyText),
          maskErrors,
          previewCount: previews.length,
          previewsComplete,
          submitDisabled: submit?.getAttribute("submit-disabled") === "true",
          submitting: submit?.getAttribute("submit-loading") === "true",
          uploading,
          expectedCount,
        };
      }, { expectedCount: expected, video: isVideoNote })
      .catch(() => null);

    if (!state) {
      await sleep(500);
      continue;
    }

    lastState = `${state.previewCount}/${state.expectedCount} ${mediaLabel}，${
      state.uploading
    } 个仍在处理`;
    if (state.bodyError || state.maskErrors.length) {
      throw new Error(
        `${mediaLabel}上传失败，已停止发布：${
          state.maskErrors[0] || "小红书提示上传失败"
        }`
      );
    }

    const countReady = state.previewCount >= state.expectedCount;
    const allReady =
      countReady &&
      state.uploading === 0 &&
      state.previewsComplete &&
      !state.submitDisabled &&
      !state.submitting;

    if (allReady) {
      if (!readySince) readySince = Date.now();
      if (
        Date.now() - readySince >= 1500 &&
        Date.now() - started >= minimumWaitMs
      ) {
        console.log(
          `[xhs] ${mediaLabel}上传完成 ${state.previewCount}/${state.expectedCount}，耗时 ${
            Date.now() - started
          }ms`
        );
        return;
      }
    } else {
      readySince = 0;
    }
    await sleep(300);
  }

  throw new Error(
    `${mediaLabel}上传超时（${lastState || "没有检测到上传进度"}）。为避免只发出部分${mediaLabel}，已停止发布，请检查网络后重试`
  );
}

type AxButtonBox = {
  x: number;
  y: number;
  disabled: boolean;
  backendNodeId?: number;
};

async function findAccessibilityButton(
  page: Page,
  name: string,
  options: { timeoutMs?: number; requireEnabled?: boolean } = {}
): Promise<AxButtonBox | null> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    let cdp: Awaited<ReturnType<BrowserContext["newCDPSession"]>> | null = null;
    try {
      cdp = await page.context().newCDPSession(page);
      const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
        nodes: Array<Record<string, any>>;
      };
      const candidates = nodes.filter((node) => {
        const role = node.role?.value;
        const text = String(node.name?.value || "").trim();
        return (
          !node.ignored &&
          role === "button" &&
          text === name &&
          Boolean(node.backendDOMNodeId)
        );
      });
      for (const node of candidates.reverse()) {
        const disabled = Boolean(
          (node.properties as Array<any> | undefined)?.find(
            (property) => property.name === "disabled"
          )?.value?.value
        );
        if (options.requireEnabled && disabled) continue;
        try {
          const { model } = (await cdp.send("DOM.getBoxModel", {
            backendNodeId: node.backendDOMNodeId,
          })) as { model?: { border?: number[]; content?: number[] } };
          const quad = model?.border || model?.content;
          if (quad && quad.length >= 8) {
            const x = (quad[0] + quad[4]) / 2;
            const y = (quad[1] + quad[5]) / 2;
            if (x >= 0 && y >= 0) {
              return { x, y, disabled, backendNodeId: node.backendDOMNodeId };
            }
          }
        } catch {
          // node is not rendered
        }
      }
    } catch {
      // retry
    } finally {
      await cdp?.detach().catch(() => {});
    }
    if (Date.now() - started >= timeoutMs) break;
    await sleep(800);
  }
  return null;
}

async function clickAccessibilityButton(
  page: Page,
  name: string,
  timeoutMs = 20_000
) {
  const box = await findAccessibilityButton(page, name, {
    timeoutMs,
    requireEnabled: true,
  });
  if (!box) return false;

  if (box.backendNodeId) {
    let cdp: Awaited<ReturnType<BrowserContext["newCDPSession"]>> | null = null;
    try {
      cdp = await page.context().newCDPSession(page);
      const { object } = (await cdp.send("DOM.resolveNode", {
        backendNodeId: box.backendNodeId,
      })) as { object?: { objectId?: string } };
      if (object?.objectId) {
        await cdp.send("Runtime.callFunctionOn", {
          objectId: object.objectId,
          functionDeclaration: "function(){ this.click(); }",
        });
        console.log(`[xhs] clicked "${name}" via DOM`);
        return true;
      }
    } catch {
      // fall back to a coordinate click
    } finally {
      await cdp?.detach().catch(() => {});
    }
  }

  await page.mouse.click(box.x, box.y);
  console.log(
    `[xhs] clicked "${name}" at ${Math.round(box.x)},${Math.round(box.y)}`
  );
  return true;
}

const SUCCESS_TEXT_RE =
  /(发布成功|笔记已发布|笔记发布成功|提交成功|发布完成)/;
const SUCCESS_URL_RE =
  /(?:explore\/|discovery\/item\/|publish\/success|\/new\/note-manager)/i;
const LOGIN_URL_RE = /(?:login|passport|signin)/i;

async function waitForPublishResult(
  page: Page,
  isApiSuccess: () => boolean,
  timeout = 120_000
) {
  const started = Date.now();
  let lastAxCheck = 0;
  while (Date.now() - started < timeout) {
    const url = page.url();
    if (LOGIN_URL_RE.test(url)) {
      throw new Error("小红书登录已失效，请到设置里重新登录");
    }
    if (isApiSuccess()) return url;

    const text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    if (SUCCESS_TEXT_RE.test(text)) {
      return url;
    }
    if (!url.includes("/publish/publish")) {
      if (SUCCESS_URL_RE.test(url)) return url;
      throw new Error(
        `发布结果未知：页面跳转到 ${url}，请到小红书后台人工核对；不要直接点重试，避免重复发布`
      );
    }
    const errorLine = text
      .split(/\n+/)
      .map((line) => line.trim())
      .find((line) =>
        /(发布失败|上传失败|提交失败|网络异常|内容违规|请完善|不能为空|请勿频繁|敏感)/.test(
          line
        )
      );
    if (errorLine) {
      throw new Error(`小红书提示：${errorLine.slice(0, 160)}`);
    }

    if (Date.now() - lastAxCheck > 3000) {
      lastAxCheck = Date.now();
      let cdp: Awaited<ReturnType<BrowserContext["newCDPSession"]>> | null = null;
      try {
        cdp = await page.context().newCDPSession(page);
        const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
          nodes: Array<Record<string, any>>;
        };
        const names = nodes
          .filter((node) => !node.ignored)
          .map((node) => String(node.name?.value || ""));
        const joined = names.join(" ");
        if (/(发布成功|笔记已发布|笔记发布成功|提交成功|发布完成)/.test(joined)) {
          return url;
        }
        const axError = names.find((name) =>
          /(发布失败|上传失败|提交失败|网络异常|内容违规|请完善|不能为空|请勿频繁|敏感)/.test(
            name
          )
        );
        if (axError) {
          throw new Error(`小红书提示：${axError.slice(0, 160)}`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("小红书提示")) {
          throw error;
        }
      } finally {
        await cdp?.detach().catch(() => {});
      }
    }

    await sleep(800);
  }
  throw new Error(
    "等待发布结果超时。可能是图片仍在处理、触发了安全验证，或页面结构已更新。请查看 data/publish-shots 下的截图，并尝试切换为「显示浏览器窗口」后重试。"
  );
}

async function ensurePublishableVideo(
  asset: Post["images"][number]
): Promise<string> {
  const names = getImageFileNames(asset.id);
  if (!names) throw new Error("视频素材数据丢失，无法发布");
  const original = path.join(UPLOAD_DIR, names.filename);
  if (!fs.existsSync(original)) {
    throw new Error(`视频文件丢失：${names.originalName}`);
  }
  if (asset.kind === "video") return original;

  const output = path.join(UPLOAD_DIR, `${asset.id}.mp4`);
  if (fs.existsSync(output) && fs.statSync(output).size > 0) return output;

  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  console.log("[xhs] converting animated image to mp4", asset.id);
  await new Promise<void>((resolve, reject) => {
    const ffmpegProcess = spawn(
      ffmpeg,
      [
        "-y",
        "-i",
        original,
        "-c:v",
        "libx264",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        "scale=trunc(iw/2)*2:trunc(ih/2)*2",
        "-movflags",
        "+faststart",
        "-an",
        output,
      ],
      { windowsHide: true }
    );
    let stderr = "";
    ffmpegProcess.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });
    const timer = setTimeout(() => {
      ffmpegProcess.kill();
      reject(new Error("动图转视频超时，请换一个更短的动图"));
    }, 180_000);
    ffmpegProcess.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          `动图转视频失败，请确认本机已安装 ffmpeg：${messageOf(error)}`
        )
      );
    });
    ffmpegProcess.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(output)) {
        resolve();
      } else {
        reject(
          new Error(
            `动图转视频失败（ffmpeg ${code}）：${stderr.slice(-300)}`
          )
        );
      }
    });
  });
  return output;
}
async function doPublish(post: Post): Promise<string | null> {
  if (runtime.loginInProgress) {
    throw new Error("请先在设置里完成小红书登录");
  }
  if (!hasXhsProfile()) {
    throw new Error("还没有登录小红书，请先到设置里点「登录小红书」");
  }

  const latest = getPost(post.id);
  if (!latest) throw new Error("作品不存在或已被删除");
  if (latest.status === "published") {
    console.warn("[xhs] skip publish because post is already published", post.id);
    return null;
  }
  post = latest;

  if (!post.images.length) {
    throw new Error("这篇作品还没有素材，无法发布");
  }
  const contentErrors = validatePostContent({
    title: post.title,
    body: post.body,
    hashtags: post.hashtags,
  });
  if (contentErrors.length) {
    throw new Error(contentErrors.join("；"));
  }
  const videoAsset = post.images.find(
    (image) => image.kind === "video" || image.kind === "gif"
  );
  const isVideoNote = Boolean(videoAsset);
  if (isVideoNote && post.images.length !== 1) {
    throw new Error("视频/动图笔记只能使用 1 个素材，请先调整作品");
  }
  if (!isVideoNote && post.images.length > 18) {
    throw new Error("小红书一篇最多 18 张图，请先删减配图");
  }

  runtime.publishing = true;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    const settings = getSettings();
    context = await launchContext(settings.xhs_headless === "1");
    page = context.pages()[0] || (await context.newPage());

    const publishUrl = isVideoNote ? PUBLISH_VIDEO_URL : PUBLISH_URL;
    await page.goto(publishUrl, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await sleep(2500);

    if (page.url().includes("/login")) {
      runtime.loggedIn = false;
      throw new Error("小红书登录已失效，请到设置里重新登录");
    }

    const hasCookies = await hasSessionCookies(context);
    const initialText = await page
      .locator("body")
      .innerText({ timeout: 3000 })
      .catch(() => "");
    const loginUi = /(短信登录|扫码登录|登录即同意)/.test(initialText);
    if (loginUi) {
      runtime.loggedIn = false;
      throw new Error("小红书登录已失效，请到设置里重新登录");
    }

    const hasCreatorUi =
      /(上传图文|发布笔记|填写标题|创作中心)/.test(initialText) ||
      (await page.locator('input[type="file"]').count()) > 0;
    if (!hasCookies && !hasCreatorUi) {
      runtime.loggedIn = false;
      throw new Error("小红书登录已失效，请到设置里重新登录");
    }
    runtime.loggedIn = true;

    await dismissOverlays(page);

    const hasImageInput = async () =>
      page!.evaluate(() =>
        Array.from(
          document.querySelectorAll<HTMLInputElement>('input[type="file"]')
        ).some((input) => /\.(jpe?g|png|webp)/i.test(input.accept || ""))
      );

    if (!isVideoNote) {
      if (!(await hasImageInput())) {
        console.log("[xhs] image tab not active, trying tab fallback");
        await page.mouse.click(437, 103);
        await sleep(1500);
        await dismissOverlays(page);
      }
      if (!(await hasImageInput())) {
        throw new Error(
          "没有切换到「上传图文」页。小红书可能改版了发布页，请切换为显示浏览器窗口后重试。"
        );
      }
    }

    const files: string[] = [];
    if (isVideoNote && videoAsset) {
      files.push(await ensurePublishableVideo(videoAsset));
      console.log("[xhs] video asset ready", files[0]);
    } else {
      const ordered = [...post.images];
      if (post.cover) {
        const coverIndex = ordered.findIndex(
          (image) => image.id === post.cover!.id
        );
        if (coverIndex > 0) {
          const [cover] = ordered.splice(coverIndex, 1);
          ordered.unshift(cover);
        }
      }
      for (const image of ordered) {
        const names = getImageFileNames(image.id);
        if (!names) throw new Error("有一张配图的数据丢失，无法发布");
        const needsPreview =
          /heic|heif/i.test(names.mime) ||
          /\.(heic|heif)$/i.test(names.originalName);
        const filename =
          needsPreview && names.previewName ? names.previewName : names.filename;
        const filePath = path.join(UPLOAD_DIR, filename);
        if (!fs.existsSync(filePath)) {
          throw new Error(`配图文件丢失：${names.originalName}`);
        }
        files.push(filePath);
      }
    }

    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.first().waitFor({ state: "attached", timeout: 60_000 });
    let fileInput = fileInputs.first();
    let foundFileInput = false;
    const inputCount = await fileInputs.count();
    for (let index = 0; index < inputCount; index++) {
      const accept = await fileInputs.nth(index).getAttribute("accept");
      const matches = isVideoNote
        ? /(mp4|mov|m4v|webm|video)/i.test(accept || "")
        : /\.(jpe?g|png|webp)/i.test(accept || "");
      if (matches) {
        fileInput = fileInputs.nth(index);
        foundFileInput = true;
        break;
      }
    }
    if (!foundFileInput) {
      throw new Error(
        isVideoNote
          ? "没有找到视频上传输入框，小红书发布页可能已经改版"
          : "没有找到图片上传输入框，小红书发布页可能已经改版"
      );
    }
    await fileInput.setInputFiles(files);
    console.log(
      `[xhs] uploaded ${files.length} ${
        isVideoNote ? "video" : "image(s)"
      }, waiting for editor`
    );

    const titleInput = page.locator('input[placeholder*="标题"]:visible').first();
    await titleInput.waitFor({
      state: "visible",
      timeout: isVideoNote ? 300_000 : 180_000,
    });
    console.log("[xhs] editor ready");
    await waitForUploadedMedia(page, files.length, isVideoNote);
    await dismissOverlays(page);

    const title = post.title || "生活里的小美好";
    await titleInput.click();
    await titleInput.fill(title);

    const targetedEditor = page.locator(
      'div[contenteditable="true"][data-placeholder*="正文"]:visible'
    );
    const anyEditor = page.locator('div[contenteditable="true"]:visible');
    const hasEditor =
      (await targetedEditor.count()) > 0 || (await anyEditor.count()) > 0;
    if (!hasEditor) {
      throw new Error("没有找到正文编辑器，小红书发布页结构可能已经更新");
    }
    const bodyEditor = (await targetedEditor.count())
      ? targetedEditor.first()
      : anyEditor.first();
    await bodyEditor.waitFor({ state: "visible", timeout: 30_000 });
    await bodyEditor.click();
    await sleep(500);

    const tags = post.hashtags;
    const tagLine = tags.map((tag) => `#${tag}`).join(" ");
    const bodyText = post.body || "";
    const caption = tagLine ? `${bodyText}\n\n${tagLine}` : bodyText;
    await page.keyboard.insertText(caption);
    await sleep(1000);

    const editorText = await bodyEditor.innerText().catch(() => "");
    if (!editorText.trim()) {
      throw new Error("正文没有填写成功，已停止发布");
    }
    if (tags.length && !editorText.includes(tags[tags.length - 1])) {
      throw new Error("正文或标签没有完整写入编辑器，已停止发布");
    }
    console.log("[xhs] caption filled", editorText.length, "chars");

    const filledTitle = await titleInput.inputValue();
    if (!filledTitle.trim()) {
      throw new Error("标题没有填写成功，已停止发布");
    }

    await waitForUploadedMedia(page, files.length, isVideoNote);
    await dismissOverlays(page);

    let apiSuccess = false;
    let noteId: string | null = null;
    page.on("response", async (response) => {
      try {
        if (response.request().method() !== "POST") return;
        const url = response.url();
        if (!/(\/api\/|web_api)/.test(url) || !/(publish|note|create)/i.test(url)) {
          return;
        }
        if (!response.ok()) return;
        const json = (await response.json()) as {
          success?: boolean;
          code?: number;
          data?: { id?: string; note_id?: string; noteId?: string };
        };
        const data = json?.data;
        const id = data?.id || data?.note_id || data?.noteId;
        if (id) noteId = String(id);
        if (json?.success === true || json?.code === 0 || Boolean(id)) {
          apiSuccess = true;
          console.log("[xhs] publish api response ok", url, id || "");
        }
      } catch {
        // ignore non-JSON responses
      }
    });

    page.on("request", (request) => {
      if (request.method() !== "POST") return;
      const url = request.url();
      if (/(\/api\/|web_api)/.test(url) && /(note|publish|create)/i.test(url)) {
        console.log("[xhs] publish request:", url);
      }
    });

    await dismissOverlays(page);
    await sleep(800);

    const clicked = await clickAccessibilityButton(page, "发布", 90_000);
    if (clicked) {
      console.log("[xhs] publish button clicked");
    } else {
      const disabledButton = await findAccessibilityButton(page, "发布", {
        timeoutMs: 1000,
      });
      if (disabledButton?.disabled) {
        throw new Error(
          "「发布」按钮一直不可用，图片可能还没有上传完成，请稍后重试"
        );
      }
      const viewport = page.viewportSize();
      if (!viewport) {
        throw new Error("没有找到「发布」按钮，小红书发布页可能已经改版");
      }
      console.log(
        "[xhs] publish button not found in accessibility tree, using coordinate fallback"
      );
      await page.mouse.click(viewport.width / 2 + 30, viewport.height - 45);
    }

    await sleep(2500);
    for (const label of ["确认发布", "继续发布", "仍要发布", "确认"]) {
      if (await clickAccessibilityButton(page, label, 1500)) break;
      const confirm = page
        .getByRole("button", { name: label, exact: true })
        .first();
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click({ timeout: 5000 }).catch(() => {});
        break;
      }
    }

    const resultUrl = await waitForPublishResult(page, () => apiSuccess);
    await sleep(1000);
    try {
      fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, `${post.id}-${Date.now()}-success.png`),
      });
    } catch {
      // ignore
    }
    console.log("[xhs] publish finished, page:", resultUrl);
    if (noteId) {
      return `https://www.xiaohongshu.com/explore/${noteId}`;
    }
    const noteMatch = resultUrl.match(
      /(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/i
    );
    if (noteMatch) {
      return `https://www.xiaohongshu.com/explore/${noteMatch[1]}`;
    }
    console.warn("[xhs] publish succeeded but no note url was captured");
    return null;
  } catch (error) {
    const message = messageOf(error);
    if (page) await captureFailure(page, post);
    if (/登录|login/i.test(message)) runtime.loggedIn = false;
    runtime.lastError = message;
    throw new Error(message);
  } finally {
    runtime.publishing = false;
    await closeContext(context);
  }
}

export function publishPostToXhs(post: Post): Promise<string | null> {
  if (publishingPosts.has(post.id)) {
    return Promise.reject(new Error("这篇作品正在发布中，请不要重复提交"));
  }
  publishingPosts.add(post.id);
  const run = runtime.chain
    .then(
      () => doPublish(post),
      () => doPublish(post)
    )
    .finally(() => {
      publishingPosts.delete(post.id);
    });
  runtime.chain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function clickRangeButton(page: Page, label: string) {
  const locator = page.getByText(label, { exact: true });
  const count = await locator.count();
  for (let index = 0; index < count; index++) {
    const item = locator.nth(index);
    if (!(await item.isVisible().catch(() => false))) continue;
    const box = await item.boundingBox().catch(() => null);
    if (!box || box.width <= 0 || box.height <= 0) continue;
    await item.click({ timeout: 5000 }).catch(() => {});
    return true;
  }
  return false;
}

async function doSyncCreatorData(): Promise<PlatformSnapshot> {
  if (!hasXhsProfile()) {
    throw new Error("还没有登录小红书，请先到设置里登录");
  }

  let context: BrowserContext | null = null;
  try {
    context = await launchContext(true);
    const page = context.pages()[0] || (await context.newPage());
    const warnings: string[] = [];
    const click30 = async () => {
      for (const label of ["近30日", "近30天", "30日"]) {
        if (await clickRangeButton(page, label)) return true;
      }
      return false;
    };

    const open = async (url: string, waitMs: number) => {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await sleep(waitMs);
      if (page.url().includes("/login")) {
        runtime.loggedIn = false;
        throw new Error("小红书登录已失效，请到设置里重新登录");
      }
    };

    await open("https://creator.xiaohongshu.com/new/home", 4500);
    const homeText7 = await page.locator("body").innerText();
    if (/(短信登录|扫码登录|登录即同意)/.test(homeText7)) {
      runtime.loggedIn = false;
      throw new Error("小红书登录已失效，请到设置里重新登录");
    }
    runtime.loggedIn = true;

    const account = parseAccount(homeText7);
    const home7 = parseHomeMetrics(homeText7);

    if (!(await click30())) {
      await page.mouse.click(1056, 474);
    }
    await sleep(2500);
    const homeText30 = await page.locator("body").innerText();
    const home30 = parseHomeMetrics(homeText30);
    console.log("[xhs] data sync: home metrics read");

    await open("https://creator.xiaohongshu.com/statistics/account/v2", 4500);
    const accountText7 = await page.locator("body").innerText();
    const diagnosis = parseDiagnosis(accountText7);
    const view7 = parseViewMetrics(accountText7);

    if (!(await click30())) {
      await page.mouse.click(1342, 696);
    }
    await sleep(2500);
    const accountText30 = await page.locator("body").innerText();
    const view30 = parseViewMetrics(accountText30);
    console.log("[xhs] data sync: account + diagnosis read");

    let notes: PlatformSnapshot["notes"] = [];
    let notesTotal = 0;
    try {
      await open("https://creator.xiaohongshu.com/statistics/data-analysis", 5500);
      await page
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll("table")).some(
              (table) => table.querySelectorAll("tbody tr").length > 0
            ),
          { timeout: 10_000 }
        )
        .catch(() => {});
      const contentText = await page.locator("body").innerText();
      const rows = await page.evaluate(() => {
        const tables = Array.from(document.querySelectorAll("table")).map(
          (table) => {
            const rows = Array.from(table.querySelectorAll("tbody tr")).map(
              (row) =>
                Array.from(row.querySelectorAll("td")).map((cell) =>
                  (cell as HTMLElement).innerText.trim()
                )
            );
            const columns = rows[0]?.length || 0;
            return { rows, columns };
          }
        );
        tables.sort(
          (a, b) =>
            b.rows.length - a.rows.length || b.columns - a.columns
        );
        return tables[0]?.rows || ([] as string[][]);
      });
      notes = parseNotes(rows);
      notesTotal = parseNotesTotal(contentText) || notes.length;
      console.log("[xhs] data sync: notes read", notes.length);
      if (!notes.length) {
        warnings.push("笔记数据表没有解析出任何记录，可能是创作中心页面结构有更新");
      }
    } catch (error) {
      warnings.push(
        `笔记数据同步失败：${messageOf(error).slice(0, 200)}`
      );
      console.error("[xhs] data sync: notes failed", messageOf(error));
    }

    let fans = parseFans("");
    try {
      await open("https://creator.xiaohongshu.com/statistics/fans-data", 5000);
      const fansText = await page.locator("body").innerText();
      fans = parseFans(fansText);
      console.log("[xhs] data sync: fans read");
    } catch (error) {
      warnings.push(`粉丝画像同步失败：${messageOf(error).slice(0, 200)}`);
      console.error("[xhs] data sync: fans failed", messageOf(error));
    }

    let noteCount = 0;
    try {
      await open("https://creator.xiaohongshu.com/new/note-manager", 4500);
      noteCount = parseNoteCount(await page.locator("body").innerText());
      console.log("[xhs] data sync: note count", noteCount);
    } catch (error) {
      warnings.push(`笔记总数同步失败：${messageOf(error).slice(0, 200)}`);
      console.error("[xhs] data sync: note count failed", messageOf(error));
    }

    if (!notes.length && noteCount > 0) {
      warnings.push(
        `账号共有 ${noteCount} 篇笔记，但最近笔记明细解析为 0 条，请检查同步页面结构`
      );
    }

    const syncedAt = new Date().toISOString();
    return {
      syncedAt,
      account: {
        ...account,
        noteCount,
      },
      metrics: {
        "7": mergePlatformMetrics(home7, view7),
        "30": mergePlatformMetrics(home30, view30),
      },
      diagnosis,
      notes,
      notesTotal: notesTotal || notes.length,
      fans,
      warnings: Array.from(new Set(warnings)),
    };
  } finally {
    await closeContext(context);
  }
}

export function syncCreatorData(): Promise<PlatformSnapshot> {
  if (runtime.syncing) {
    return Promise.reject(new Error("正在同步数据，请稍候"));
  }
  if (runtime.publishing) {
    return Promise.reject(new Error("正在发布作品，请稍后同步"));
  }
  if (runtime.loginInProgress) {
    return Promise.reject(new Error("请先完成小红书登录"));
  }

  runtime.syncing = true;
  const run = runtime.chain.then(
    () => doSyncCreatorData(),
    () => doSyncCreatorData()
  );
  const tracked = run.finally(() => {
    runtime.syncing = false;
  });
  runtime.chain = tracked.then(
    () => undefined,
    () => undefined
  );
  return tracked;
}
