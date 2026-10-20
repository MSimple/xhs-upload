"use client";

import { mutate as globalMutate } from "swr";

export async function api<T = unknown>(
  url: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers:
      init?.body instanceof FormData
        ? init?.headers
        : {
            "Content-Type": "application/json",
            ...(init?.headers || {}),
          },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `请求失败 (${res.status})`
    );
  }
  return data as T;
}

function notifyApiError(message: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<string>("studio:api-error", { detail: message })
  );
}

export async function fetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data as { error?: string }).error || `请求失败 (${res.status})`;
    notifyApiError(message);
    throw new Error(message);
  }
  return data as T;
}

export function refreshAll() {
  return globalMutate(
    (key) => typeof key === "string" && key.startsWith("/api/"),
    undefined,
    { revalidate: true }
  );
}

type PreviewResult = {
  blob: Blob | null;
  thumbBlob: Blob | null;
  width: number;
  height: number;
};

export type MediaKind = "image" | "video" | "gif";

export type MediaPreviewResult = PreviewResult & {
  kind: MediaKind;
  duration: number;
  error?: string;
};

export function detectMediaKind(file: File): MediaKind {
  const name = file.name.toLowerCase();
  if (file.type === "image/gif" || name.endsWith(".gif")) return "gif";
  if (
    file.type.startsWith("video/") ||
    /\.(mp4|mov|m4v|webm)$/.test(name)
  ) {
    return "video";
  }
  return "image";
}

async function renderThumb(
  source: CanvasImageSource,
  width: number,
  height: number
): Promise<Blob | null> {
  if (!width || !height) return null;
  const max = 480;
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.82)
  );
}

async function makeVideoPreview(file: File): Promise<MediaPreviewResult> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("读取视频信息超时")),
        20_000
      );
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error("无法读取视频信息"));
      };
      video.load();
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekAt = duration > 0.6 ? Math.min(0.3, duration / 2) : 0;
    if (seekAt > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1500);
        video.onseeked = () => {
          clearTimeout(timer);
          resolve();
        };
        video.currentTime = seekAt;
      });
    }
    const originalWidth = video.videoWidth;
    const originalHeight = video.videoHeight;
    if (!originalWidth || !originalHeight) {
      throw new Error("视频没有可用的画面");
    }
    const max = 1600;
    const scale = Math.min(
      1,
      max / Math.max(originalWidth, originalHeight)
    );
    const width = Math.round(originalWidth * scale);
    const height = Math.round(originalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86)
    );
    if (!blob) throw new Error("无法生成视频封面");
    const thumbBlob = await renderThumb(video, originalWidth, originalHeight);
    return {
      blob,
      thumbBlob,
      width: originalWidth,
      height: originalHeight,
      kind: "video",
      duration,
    };
  } catch (error) {
    return {
      blob: null,
      thumbBlob: null,
      width: 0,
      height: 0,
      kind: "video",
      duration: 0,
      error: error instanceof Error ? error.message : "无法读取视频",
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export async function makeMediaPreview(
  file: File
): Promise<MediaPreviewResult> {
  const kind = detectMediaKind(file);
  if (kind === "video") return makeVideoPreview(file);
  const preview = await makePreview(file);
  return { ...preview, kind, duration: 0 };
}

export async function makePreview(file: File): Promise<PreviewResult> {
  try {
    const bitmap = await createImageBitmap(file);
    const originalWidth = bitmap.width;
    const originalHeight = bitmap.height;
    const max = 1600;
    const scale = Math.min(1, max / Math.max(originalWidth, originalHeight));
    const width = Math.round(originalWidth * scale);
    const height = Math.round(originalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.86)
    );
    const thumbBlob = await renderThumb(bitmap, originalWidth, originalHeight);
    bitmap.close();
    return { blob, thumbBlob, width: originalWidth, height: originalHeight };
  } catch {
    return { blob: null, thumbBlob: null, width: 0, height: 0 };
  }
}

export async function analyzeImages(
  ids: string[],
  onProgress?: (done: number, total: number) => void
): Promise<{ ok: number; failed: number; mock: number }> {
  const queue = [...ids];
  const total = queue.length;
  let done = 0;
  let ok = 0;
  let failed = 0;
  let mock = 0;

  const worker = async () => {
    while (queue.length) {
      const id = queue.shift();
      if (!id) break;
      try {
        const result = await api<{ mock?: boolean }>(
          `/api/images/${id}/analyze`,
          { method: "POST" }
        );
        ok++;
        if (result.mock) mock++;
      } catch {
        failed++;
      } finally {
        done++;
        onProgress?.(done, total);
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(2, total) }, () => worker())
  );
  return { ok, failed, mock };
}

export async function downloadPostExport(postId: string) {
  const res = await fetch(`/api/posts/${postId}/export`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error || `导出失败 (${res.status})`
    );
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download =
    res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ||
    "xhs-post.zip";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
