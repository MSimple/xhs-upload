"use client";

import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, Sparkles } from "lucide-react";
import { Spinner } from "@/components/ui";

export default function LoginPage() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [required, setRequired] = useState(true);
  const [error, setError] = useState("");
  const [next, setNext] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setNext(params.get("next") || "/");
    fetch("/api/auth/status")
      .then((res) => res.json())
      .then((data: { required?: boolean; authenticated?: boolean }) => {
        const need = Boolean(data.required);
        setRequired(need);
        setReady(true);
        if (!need) {
          window.location.replace("/");
        } else if (data.authenticated) {
          window.location.replace(params.get("next") || "/");
        }
      })
      .catch(() => {
        setReady(true);
      });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "登录失败");
      window.location.replace(next || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={24} className="text-brand" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-[2rem] border border-line bg-white p-7 shadow-lift sm:p-9">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand text-white shadow-[0_10px_24px_-10px_rgba(200,30,58,0.9)]">
            <Sparkles size={20} />
          </span>
          <div>
            <p className="font-display text-xl font-semibold tracking-tight">
              薯光工坊
            </p>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted">
              Xiaohongshu Studio
            </p>
          </div>
        </div>

        <div className="mt-7 flex items-start gap-2.5 rounded-2xl border border-brand/20 bg-brand-soft/50 px-4 py-3 text-xs leading-relaxed text-brand">
          <LockKeyhole size={15} className="mt-0.5 shrink-0" />
          <p>
            {required
              ? "这个工作台保存着小红书登录状态和发布权限，需要通过访问令牌才能进入。"
              : "当前未启用访问令牌，只能在本机访问。"}
          </p>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="access-token">
              访问令牌
            </label>
            <div className="relative">
              <KeyRound
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
              />
              <input
                id="access-token"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                className="field pl-10 font-mono"
                placeholder="输入 XHS_ACCESS_TOKEN"
                autoFocus
                autoComplete="current-password"
              />
            </div>
          </div>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !token.trim()}
            className="btn-primary w-full"
          >
            {busy ? <Spinner size={15} /> : <LockKeyhole size={15} />}
            {busy ? "正在验证…" : "进入工作台"}
          </button>
        </form>

        <p className="mt-5 text-[11px] leading-relaxed text-muted">
          令牌在服务启动时通过环境变量 <code className="rounded bg-paper px-1 py-0.5 font-mono text-[10px]">XHS_ACCESS_TOKEN</code>{" "}
          配置，不会写入数据库。忘记后可以修改环境变量并重启服务。
        </p>
      </div>
    </div>
  );
}
