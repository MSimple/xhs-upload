"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import {
  CheckCircle2,
  Database,
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Monitor,
  PlugZap,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { Spinner, Tabs } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, fetcher } from "@/lib/client";
import { cn, formatBytes } from "@/lib/utils";
import type { Settings } from "@/lib/types";

type SettingsResponse = {
  settings: Settings;
  hasApiKey: boolean;
  configured: boolean;
};

type HealthResponse = {
  node: { version: string; ok: boolean; required: string };
  ffmpeg: { path: string; ok: boolean; version: string; error: string };
  ai: { configured: boolean; hasKey: boolean };
  storage: {
    dataDir: string;
    dbBytes: number;
    walBytes: number;
    uploadBytes: number;
  };
  auth: { required: boolean };
};

const PRESETS = [
  {
    name: "DeepSeek",
    desc: "官方直连 · deepseek-flash",
    base: "https://api.deepseek.com/v1",
    vision: "deepseek-flash",
    text: "deepseek-flash",
  },
  {
    name: "通义千问",
    desc: "国内直连 · 视觉理解",
    base: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    vision: "qwen-vl-max",
    text: "qwen-plus",
  },
  {
    name: "智谱 GLM",
    desc: "国内直连 · 视觉理解",
    base: "https://open.bigmodel.cn/api/paas/v4",
    vision: "glm-4v-plus",
    text: "glm-4-plus",
  },
  {
    name: "OpenAI",
    desc: "需要可访问网络",
    base: "https://api.openai.com/v1",
    vision: "gpt-4o-mini",
    text: "gpt-4o-mini",
  },
];

export default function SettingsPage() {
  const toast = useToast();
  const { data, mutate } = useSWR<SettingsResponse>("/api/settings", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: health } = useSWR<HealthResponse>("/api/health", fetcher, {
    revalidateOnFocus: false,
  });
  const { data: auth } = useSWR<{ required: boolean; authenticated: boolean }>(
    "/api/auth/status",
    fetcher,
    { revalidateOnFocus: false }
  );

  const [form, setForm] = useState<Settings | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"ai" | "persona" | "environment">("ai");
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const hydrated = useRef(false);
  const formRef = useRef<Settings | null>(null);
  const dirtyRef = useRef(false);
  const changeVersion = useRef(0);
  const saveChain = useRef<Promise<unknown>>(Promise.resolve());
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hydrated.current || !data?.settings) return;
    hydrated.current = true;
    setForm(data.settings);
    setHasKey(data.hasApiKey);
  }, [data]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    if (!dirty || !form) return;
    const timer = setTimeout(() => {
      void saveNow(false);
    }, 500);
    return () => clearTimeout(timer);
    // saveNow is intentionally read through the latest render closure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty]);

  useEffect(() => {
    const flush = () => {
      const current = formRef.current;
      if (!dirtyRef.current || !current) return;
      const payload: Partial<Settings> = { ...current };
      delete payload.ai_api_key;
      try {
        void fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        });
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      flush();
    };
  }, []);

  if (!form) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size={24} className="text-brand" />
      </div>
    );
  }

  function update<K extends keyof Settings>(field: K, value: Settings[K]) {
    changeVersion.current += 1;
    setForm((prev) => (prev ? { ...prev, [field]: value } : prev));
    setDirty(true);
    setSaveState("idle");
  }

  function applyPreset(preset: (typeof PRESETS)[number]) {
    update("ai_base_url", preset.base);
    update("ai_vision_model", preset.vision);
    update("ai_text_model", preset.text);
    setTestResult(null);
    toast(`已填入 ${preset.name} 的默认配置`, "info");
  }

  function enqueueSave<T>(task: () => Promise<T>): Promise<T> {
    const run = saveChain.current.then(task, task);
    saveChain.current = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  async function performSave(includeKey: boolean) {
    const current = formRef.current;
    if (!current) return;
    const version = changeVersion.current;
    if (savedTimer.current) {
      clearTimeout(savedTimer.current);
      savedTimer.current = null;
    }
    setSaveState("saving");
    setSaveError("");
    try {
      const payload: Partial<Settings> = { ...current };
      const key = keyInput.trim();
      if (includeKey && key) {
        payload.ai_api_key = key;
      } else {
        delete payload.ai_api_key;
      }
      const res = await api<SettingsResponse>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      if (includeKey && key) {
        setKeyInput("");
      }
      setHasKey(res.hasApiKey);
      if (version === changeVersion.current) setDirty(false);
      setSaveState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2200);
      void mutate();
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "自动保存失败");
    }
  }

  function saveNow(includeKey = false) {
    return enqueueSave(() => performSave(includeKey));
  }

  async function testConnection() {
    if (!form) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api<{
        reply: string;
        model: string;
        visionReply?: string;
        visionError?: string;
      }>("/api/ai/test", {
        method: "POST",
        body: JSON.stringify({
          baseUrl: form.ai_base_url,
          apiKey: keyInput,
          model: form.ai_text_model,
        }),
      });
      const visionOk = !res.visionError;
      setTestResult({
        ok: visionOk,
        text: `文本模型回复「${res.reply}」；${
          visionOk
            ? `视觉模型正常（${form.ai_vision_model}）`
            : `视觉模型失败：${res.visionError}`
        }`,
      });
      toast(
        visionOk ? "文本和视觉模型连接成功" : "文本模型正常，视觉模型连接失败",
        visionOk ? "success" : "error"
      );
    } catch (error) {
      setTestResult({
        ok: false,
        text: error instanceof Error ? error.message : "连接失败",
      });
      toast("连接失败，请检查配置", "error");
    } finally {
      setTesting(false);
    }
  }

  async function clearKey() {
    if (!window.confirm("清除已保存的 API Key？清除后将回到演示模式。")) return;
    setClearing(true);
    try {
      await enqueueSave(() =>
        api<SettingsResponse>("/api/settings", {
          method: "PUT",
          body: JSON.stringify({ clearApiKey: true }),
        })
      );
      setHasKey(false);
      setKeyInput("");
      setTestResult(null);
      setSaveState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2200);
      void mutate();
      toast("已清除 API Key", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    } finally {
      setClearing(false);
    }
  }

  async function logoutAccess() {
    if (!window.confirm("退出当前访问令牌？下次进入需要重新输入。")) return;
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  }

  const enabled = form.ai_enabled === "1";
  const configured = hasKey && enabled;

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
            Settings
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-[34px]">
            设置
          </h1>
          <p className="mt-1 text-sm text-muted">
            配置 AI 模型和内容人设，修改后自动保存。
          </p>
        </div>
        <div
          aria-live="polite"
          title={saveError || undefined}
          className="flex h-10 items-center gap-2 rounded-full border border-line bg-white px-4 text-xs shadow-soft"
        >
          {saveState === "saving" && (
            <>
              <Spinner size={13} className="text-brand" />
              <span className="text-muted">自动保存中…</span>
            </>
          )}
          {saveState === "saved" && (
            <>
              <CheckCircle2 size={14} className="text-emerald-600" />
              <span className="text-emerald-700">已自动保存</span>
            </>
          )}
          {saveState === "error" && (
            <>
              <TriangleAlert size={14} className="text-red-500" />
              <span className="text-red-600">自动保存失败</span>
              <button
                onClick={() => saveNow(Boolean(keyInput.trim()))}
                className="font-medium text-red-600 underline underline-offset-2"
              >
                重试
              </button>
            </>
          )}
          {saveState === "idle" && (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
              <span className="text-muted">修改后自动保存</span>
            </>
          )}
        </div>
      </header>

      <Tabs
        className="mb-5"
        value={tab}
        onChange={(value) =>
          setTab(value as "ai" | "persona" | "environment")
        }
        items={[
          { value: "ai", label: "AI 模型" },
          { value: "persona", label: "内容人设" },
          { value: "environment", label: "环境与数据" },
        ]}
      />

      <div
        className={cn(
          "grid grid-cols-1 gap-5",
          tab === "ai" && "xl:grid-cols-[1.3fr_.7fr]"
        )}
      >
        <div
          className={cn(
            "space-y-5",
            tab === "environment" && "hidden"
          )}
        >
          <section className={cn("card p-5 sm:p-6", tab !== "ai" && "hidden")}>
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand">
                <Wand2 size={17} />
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold">AI 模型服务</h2>
                <p className="text-[11px] text-muted">
                  使用 OpenAI 兼容接口，图片识别需要支持视觉的模型
                </p>
              </div>
            </div>

            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PRESETS.map((preset) => {
                const active = form.ai_base_url === preset.base;
                return (
                  <button
                    key={preset.name}
                    onClick={() => applyPreset(preset)}
                    className={cn(
                      "rounded-2xl border p-3 text-left transition",
                      active
                        ? "border-brand/30 bg-brand-soft/40"
                        : "border-line bg-white hover:border-ink/15 hover:bg-paper/40"
                    )}
                  >
                    <p className="text-sm font-medium">{preset.name}</p>
                    <p className="mt-0.5 text-[10px] text-muted">{preset.desc}</p>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">Base URL</label>
                <input
                  aria-label="Base URL" value={form.ai_base_url}
                  onChange={(event) => update("ai_base_url", event.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="field font-mono text-xs"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="label mb-0">API Key</label>
                  {hasKey && (
                    <button
                      onClick={clearKey}
                      disabled={clearing}
                      className="text-[10px] text-red-500 hover:underline"
                    >
                      清除已保存的 Key
                    </button>
                  )}
                </div>
                <div className="relative">
                  <KeyRound
                    size={14}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
                  />
                  <input
                    type={showKey ? "text" : "password"}
                    aria-label="API Key" value={keyInput}
                    onChange={(event) => setKeyInput(event.target.value)}
                    onBlur={() => {
                      if (keyInput.trim()) void saveNow(true);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (keyInput.trim()) void saveNow(true);
                      }
                    }}
                    placeholder={
                      hasKey ? "已配置 · 留空保持不变" : "粘贴你的 API Key"
                    }
                    className="field pl-9 pr-10 font-mono text-xs"
                    autoComplete="off"
                  />
                  <button
                    onClick={() => setShowKey((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                    aria-label={showKey ? "隐藏" : "显示"}
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="mt-1.5 flex items-center gap-1 text-[10px] text-muted">
                  <ShieldCheck size={11} />
                  Key 只保存在本机 data 数据库；按回车或离开输入框自动保存。
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">图片识别模型（视觉）</label>
                  <input
                    aria-label="图片识别模型" value={form.ai_vision_model}
                    onChange={(event) =>
                      update("ai_vision_model", event.target.value)
                    }
                    placeholder="qwen-vl-max"
                    className="field font-mono text-xs"
                  />
                </div>
                <div>
                  <label className="label">文案生成模型（文本）</label>
                  <input
                    aria-label="文案生成模型" value={form.ai_text_model}
                    onChange={(event) =>
                      update("ai_text_model", event.target.value)
                    }
                    placeholder="qwen-plus"
                    className="field font-mono text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-line bg-paper/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">启用 AI</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    关闭后使用内置演示数据，适合先体验流程
                  </p>
                </div>
                <button
                  onClick={() =>
                    update("ai_enabled", enabled ? "0" : "1")
                  }
                  className={cn(
                    "relative h-6 w-11 shrink-0 rounded-full transition",
                    enabled ? "bg-brand" : "bg-line"
                  )}
                  aria-label="切换 AI 开关"
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
                      enabled ? "left-[22px]" : "left-0.5"
                    )}
                  />
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={testConnection}
                  disabled={testing}
                  className="btn-secondary btn-sm"
                >
                  {testing ? <Spinner size={14} /> : <PlugZap size={14} />}
                  测试连接
                </button>
                {testResult && (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-[11px]",
                      testResult.ok ? "text-emerald-600" : "text-red-500"
                    )}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 size={13} />
                    ) : (
                      <TriangleAlert size={13} />
                    )}
                    {testResult.text}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section
            className={cn(
              "card p-5 sm:p-6",
              tab !== "persona" && "hidden"
            )}
          >
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Sparkles size={17} />
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold">内容人设</h2>
                <p className="text-[11px] text-muted">
                  这些信息会注入生成提示词，决定文案的语气和视角
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">账号人设 / 内容方向</label>
                <textarea
                  aria-label="账号人设" value={form.persona}
                  onChange={(event) => update("persona", event.target.value)}
                  rows={3}
                  className="field resize-none leading-relaxed"
                  placeholder="例如：生活方式分享博主，喜欢咖啡、旅行和城市漫步"
                />
              </div>
              <div>
                <label className="label">语言风格</label>
                <input
                  aria-label="语言风格" value={form.tone}
                  onChange={(event) => update("tone", event.target.value)}
                  className="field"
                  placeholder="真诚、松弛、有点小幽默"
                />
              </div>
              <div>
                <label className="label">账号签名（会在合适时自然融入正文）</label>
                <input
                  aria-label="账号签名" value={form.signature}
                  onChange={(event) => update("signature", event.target.value)}
                  className="field"
                  placeholder="关注我，一起收集生活里的小确幸 ✨"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">默认发布时间</label>
                  <input
                    type="time"
                    aria-label="默认发布时间" value={form.default_time}
                    onChange={(event) =>
                      update("default_time", event.target.value)
                    }
                    className="field"
                  />
                </div>
                <div>
                  <label className="label">每天发布篇数</label>
                  <select
                    aria-label="每天发布篇数" value={form.posts_per_day}
                    onChange={(event) =>
                      update("posts_per_day", event.target.value)
                    }
                    className="field"
                  >
                    <option value="1">1 篇 / 天</option>
                    <option value="2">2 篇 / 天</option>
                    <option value="3">3 篇 / 天</option>
                  </select>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className={cn("space-y-5", tab === "persona" && "hidden")}>
          <section
            className={cn(
              "card overflow-hidden",
              tab !== "ai" && "hidden"
            )}
          >
            <div
              className={cn(
                "p-5",
                configured ? "bg-emerald-50/60" : "bg-amber-50/60"
              )}
            >
              <p className="flex items-center gap-2 text-sm font-medium">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    configured ? "bg-emerald-500" : "bg-amber-500"
                  )}
                />
                {configured ? "AI 已配置" : "演示模式"}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                {configured
                  ? "图片识别与文案生成会调用你配置的模型服务，产生相应费用。"
                  : "未填写 API Key 或已关闭 AI，上传的图片会生成示例分析。"}
              </p>
            </div>
            <div className="space-y-2.5 p-5 text-[11px] text-muted">
              <p className="flex items-center justify-between gap-2">
                <span>API Key</span>
                <span className={hasKey ? "text-emerald-600" : ""}>
                  {hasKey ? "已保存" : "未配置"}
                </span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span>视觉模型</span>
                <span className="truncate font-mono text-ink/70">
                  {form.ai_vision_model || "—"}
                </span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span>文本模型</span>
                <span className="truncate font-mono text-ink/70">
                  {form.ai_text_model || "—"}
                </span>
              </p>
            </div>
          </section>

          <section
            className={cn("card p-5", tab !== "environment" && "hidden")}
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              <Monitor size={15} className="text-muted" /> 环境状态
            </p>
            {health ? (
              <ul className="mt-3 space-y-2 text-[11px] leading-relaxed">
                <li className="flex items-center justify-between gap-2">
                  <span className="text-muted">Node.js</span>
                  <span className={health.node.ok ? "text-emerald-600" : "text-red-500"}>
                    {health.node.version}
                    {health.node.ok ? "" : `（需要 ${health.node.required}）`}
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span className="text-muted">ffmpeg</span>
                  <span
                    className={cn(
                      "max-w-[11rem] truncate text-right",
                      health.ffmpeg.ok ? "text-emerald-600" : "text-red-500"
                    )}
                    title={health.ffmpeg.version || health.ffmpeg.error}
                  >
                    {health.ffmpeg.ok
                      ? health.ffmpeg.version || "可用"
                      : "未找到"}
                  </span>
                </li>
                                <li className="flex items-center justify-between gap-2">
                  <span className="text-muted">数据库 / 上传</span>
                  <span className="text-ink/70">
                    {formatBytes(health.storage.dbBytes + health.storage.walBytes)} /{" "}
                    {formatBytes(health.storage.uploadBytes)}
                  </span>
                </li>
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-muted">正在检查运行环境…</p>
            )}
            {health?.ffmpeg && !health.ffmpeg.ok && (
              <p className="mt-2 text-[10px] leading-relaxed text-red-500">
                视频/动图/GIF 和部分 HEIC 预览会依赖 ffmpeg，请安装后重启服务。
              </p>
            )}
            {auth?.required && (
              <button
                onClick={logoutAccess}
                className="btn-ghost btn-sm mt-3 text-red-500 hover:bg-red-50 hover:text-red-600"
              >
                <LogOut size={13} /> 退出访问令牌
              </button>
            )}
          </section>

          <section
            className={cn("card p-5", tab !== "environment" && "hidden")}
          >
            <p className="flex items-center gap-2 text-sm font-medium">
              <Database size={15} className="text-muted" /> 本地数据
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              数据库和图片都保存在项目下的 <code className="rounded bg-paper px-1 py-0.5 font-mono text-[10px]">data/</code>{" "}
              目录：<code className="font-mono text-[10px]">studio.db</code> 记录作品与排期，
              <code className="font-mono text-[10px]">uploads/</code> 保存原图。
            </p>
            <ul className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-muted">
              <li>· 迁移或备份时，复制整个 data 目录即可</li>
            </ul>
          </section>

        </div>
      </div>
    </div>
  );
}
