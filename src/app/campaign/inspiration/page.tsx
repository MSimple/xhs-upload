"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Aperture,
  ArrowLeft,
  Camera,
  Check,
  Copy,
  Lightbulb,
  MapPin,
  Package,
  Quote,
  RefreshCw,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { EmptyState, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api, fetcher, refreshAll } from "@/lib/client";
import { cn } from "@/lib/utils";
import type { ShotIdea } from "@/lib/types";

type Coverage = {
  category: string;
  count: number;
  hint: string;
  missing: boolean;
};

type InspirationResponse = {
  campaign: string;
  city: string;
  configured: boolean;
  ideas: ShotIdea[];
  coverage: Coverage[];
  gaps: string[];
  categories: string[];
  hints: Record<string, string>;
  imageCount: number;
  warnings?: string[];
  mock?: boolean;
  created?: ShotIdea[];
};

function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
  }
  legacyCopy(text);
  return Promise.resolve();
}

function legacyCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } finally {
    document.body.removeChild(area);
  }
}

function checklistText(ideas: ShotIdea[], campaign: string) {
  const lines = [`【${campaign} · 拍摄清单】`, ""];
  ideas.forEach((idea, index) => {
    lines.push(
      `${index + 1}. [${idea.category}] ${idea.title}${
        idea.done ? "（已拍）" : ""
      }`
    );
    if (idea.location) lines.push(`   地点：${idea.location}`);
    if (idea.subject) lines.push(`   拍什么：${idea.subject}`);
    if (idea.composition) lines.push(`   机位：${idea.composition}`);
    if (idea.lighting) lines.push(`   光线：${idea.lighting}`);
    if (idea.props) lines.push(`   道具：${idea.props}`);
    if (idea.caption) lines.push(`   文案切入：${idea.caption}`);
    lines.push("");
  });
  return lines.join("\n");
}

function priorityStyle(priority: number) {
  if (priority === 1) return "bg-red-50 text-red-600 border-red-100";
  if (priority === 3) return "bg-stone-100 text-stone-500 border-stone-200";
  return "bg-amber-50 text-amber-700 border-amber-100";
}

export default function InspirationPage() {
  const toast = useToast();
  const { data, isLoading, mutate } = useSWR<InspirationResponse>(
    "/api/campaign/inspiration",
    fetcher,
    { revalidateOnFocus: false }
  );

  const [city, setCity] = useState("");
  const [cityTouched, setCityTouched] = useState(false);
  const [category, setCategory] = useState("");
  const [count, setCount] = useState("8");
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  useEffect(() => {
    if (data && !cityTouched) setCity(data.city || "");
  }, [data, cityTouched]);

  const ideas = useMemo(() => data?.ideas || [], [data]);
  const pending = ideas.filter((idea) => !idea.done);
  const done = ideas.length - pending.length;
  const gaps = data?.gaps || [];

  async function generate() {
    setBusy(true);
    setWarnings([]);
    try {
      const res = await api<InspirationResponse>("/api/campaign/inspiration", {
        method: "POST",
        body: JSON.stringify({
          count: Number(count),
          category: category || undefined,
          city,
          focus: focus.trim() || undefined,
        }),
      });
      setWarnings(res.warnings || []);
      await mutate(res, { revalidate: false });
      await refreshAll();
      toast(
        res.created?.length
          ? `已加入 ${res.created.length} 条拍摄任务${
              res.mock ? "（内置灵感库）" : ""
            }`
          : "没有新增任务，换个重点再试",
        res.created?.length ? "success" : "error"
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "生成失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(idea: ShotIdea) {
    try {
      await api(`/api/campaign/inspiration/${idea.id}`, {
        method: "PATCH",
        body: JSON.stringify({ done: !idea.done }),
      });
      await mutate();
    } catch (error) {
      toast(error instanceof Error ? error.message : "操作失败", "error");
    }
  }

  async function remove(idea: ShotIdea) {
    try {
      await api(`/api/campaign/inspiration/${idea.id}`, { method: "DELETE" });
      await mutate();
    } catch (error) {
      toast(error instanceof Error ? error.message : "删除失败", "error");
    }
  }

  async function clearAll() {
    if (!window.confirm("清空当前活动的全部拍摄任务？")) return;
    try {
      await api("/api/campaign/inspiration", { method: "DELETE" });
      await mutate();
      setWarnings([]);
      toast("已清空拍摄清单", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "清空失败", "error");
    }
  }

  async function copyAll() {
    if (!ideas.length) return;
    try {
      await copyText(checklistText(ideas, data?.campaign || "拍摄清单"));
      toast("拍摄清单已复制，可以发到手机里照着拍", "success");
    } catch {
      toast("复制失败，请手动选择文本", "error");
    }
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-24 rounded-3xl" />
        <div className="skeleton h-40 rounded-3xl" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="skeleton h-64 rounded-3xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/campaign"
            className="mb-2 inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
          >
            <ArrowLeft size={12} /> 返回创作营
          </Link>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-brand">
            Shot List
          </p>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight sm:text-[34px]">
            拍什么
          </h1>
          <p className="mt-1 text-sm text-muted">
            {data.campaign} · 按清单拍，一组 6-9 张就能写成一篇
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/library?campaign=1" className="btn-secondary">
            <Upload size={15} /> 拍完去上传
          </Link>
          <button
            onClick={copyAll}
            disabled={!ideas.length}
            className="btn-primary"
          >
            <Copy size={15} /> 复制清单
          </button>
        </div>
      </header>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.25fr_1fr]">
        <section className="card p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="section-title">素材缺口</h2>
              <p className="mt-0.5 text-xs text-muted">
                根据 {data.imageCount} 张素材的摘要粗略统计，优先补 0 张的分类。
              </p>
            </div>
            <span className="chip">
              <Camera size={12} /> {pending.length} 条待拍
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.coverage.map((item) => (
              <span
                key={item.category}
                title={item.hint}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px]",
                  item.missing
                    ? "border-brand/30 bg-brand-soft/60 text-brand"
                    : "border-line bg-white text-muted"
                )}
              >
                {item.category} · {item.count}
              </span>
            ))}
          </div>
          {gaps.length > 0 ? (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-brand">
              <Lightbulb size={13} className="mt-0.5 shrink-0" />
              优先补拍：{gaps.slice(0, 5).join("、")}
              {gaps.length > 5 ? ` 等 ${gaps.length} 个分类` : ""}
              。缺得越多，越容易拍出一组完整故事。
            </p>
          ) : (
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-emerald-600">
              <Check size={13} className="mt-0.5 shrink-0" />
              分类覆盖得比较全，接下来优先补「同场景不同机位」和细节特写。
            </p>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="section-title">一组图的拍摄顺序</h2>
          <ol className="mt-3 space-y-1.5 text-[11px] leading-relaxed text-muted">
            <li>1. 门头或门店环境，交代「我在哪」</li>
            <li>2. 车头 / 侧面 / 车尾，建立外观印象</li>
            <li>3. 内饰和空间，回答「坐进去怎么样」</li>
            <li>4. 家庭 / 试驾 / 补能，给出真实使用场景</li>
            <li>5. 一个细节特写，让画面有记忆点</li>
            <li>6. 夜景或收尾空镜，留一点余味</li>
            <li>7. 至少 6 张成组，车辆内容过半，再补 50 字以上文案</li>
          </ol>
        </section>
      </div>

      <section className="card mb-5 p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">生成拍摄任务</h2>
            <p className="mt-0.5 text-xs text-muted">
              {data.configured
                ? "会结合账号人设、现有素材和缺口来生成。"
                : "当前是演示模式，使用内置的理想汽车拍摄灵感库。"}
            </p>
          </div>
          <span className="chip">
            <Sparkles size={12} className="text-brand" />
            {data.configured ? "AI 拍摄编导" : "内置灵感库"}
          </span>
        </div>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory("")}
            className={cn(
              "chip transition",
              !category && "border-brand/30 bg-brand-soft/60 text-brand"
            )}
          >
            不限分类
          </button>
          {data.categories.map((item) => (
            <button
              key={item}
              onClick={() => setCategory(item)}
              className={cn(
                "chip transition",
                category === item &&
                  "border-brand/30 bg-brand-soft/60 text-brand"
              )}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_auto]">
          <div>
            <label className="label">拍摄城市</label>
            <input
              value={city}
              onChange={(event) => {
                setCityTouched(true);
                setCity(event.target.value);
              }}
              placeholder="例如：杭州"
              className="field"
            />
          </div>
          <div>
            <label className="label">这次想拍什么（可选）</label>
            <input
              value={focus}
              onChange={(event) => setFocus(event.target.value)}
              placeholder="例如：家庭出行 / 只拍门店 / 想要夜景"
              className="field"
            />
          </div>
          <div>
            <label className="label">生成数量</label>
            <select
              value={count}
              onChange={(event) => setCount(event.target.value)}
              className="field"
            >
              {[6, 8, 10, 12].map((value) => (
                <option key={value} value={value}>
                  {value} 条
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={generate}
              disabled={busy}
              className="btn-primary w-full sm:w-auto"
            >
              {busy ? <Spinner size={15} /> : <Sparkles size={15} />}
              {busy ? "正在生成…" : "生成一批"}
            </button>
            {ideas.length > 0 && (
              <button
                onClick={clearAll}
                disabled={busy}
                className="btn-ghost btn-sm text-muted"
              >
                <Trash2 size={14} /> 清空
              </button>
            )}
          </div>
        </div>

        {warnings.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-2xl bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-700">
            {warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>· {warning}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="mb-3 flex items-center justify-between text-[11px] text-muted">
        <span>
          {ideas.length} 条任务 · {done} 条已拍 · {pending.length} 条待拍
        </span>
        <button
          onClick={() => mutate()}
          className="flex items-center gap-1 hover:text-ink"
        >
          <RefreshCw size={12} /> 刷新
        </button>
      </div>

      {ideas.length ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ideas.map((idea) => (
            <article
              key={idea.id}
              className={cn(
                "card p-4 transition sm:p-5",
                idea.done && "border-emerald-200 bg-emerald-50/30"
              )}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggle(idea)}
                  aria-label={idea.done ? "标记为未拍" : "标记为已拍"}
                  className={cn(
                    "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                    idea.done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-line bg-white text-transparent hover:border-brand/40"
                  )}
                >
                  <Check size={12} strokeWidth={3} />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="chip">{idea.category}</span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px]",
                        priorityStyle(idea.priority)
                      )}
                    >
                      P{idea.priority}
                    </span>
                    <span className="text-[10px] text-muted">
                      {idea.source === "ai" ? "AI 生成" : "灵感库"}
                    </span>
                  </div>
                  <h3
                    className={cn(
                      "mt-2 text-[15px] font-medium leading-snug",
                      idea.done && "text-muted line-through"
                    )}
                  >
                    {idea.title}
                  </h3>
                </div>
                <button
                  onClick={() => remove(idea)}
                  aria-label="删除"
                  className="rounded-full p-1.5 text-muted transition hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <dl className="mt-3 space-y-2 text-[11px] leading-relaxed text-muted">
                <Row icon={<MapPin size={12} />} label="地点" value={idea.location} />
                <Row icon={<Camera size={12} />} label="拍什么" value={idea.subject} />
                <Row
                  icon={<Aperture size={12} />}
                  label="机位"
                  value={idea.composition}
                />
                <Row icon={<Sun size={12} />} label="光线" value={idea.lighting} />
                <Row icon={<Package size={12} />} label="道具" value={idea.props} />
                <Row
                  icon={<Quote size={12} />}
                  label="文案切入"
                  value={idea.caption}
                />
              </dl>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="还没有拍摄任务"
          description="点「生成一批」，会按理想汽车门店、外观、内饰、家庭、试驾和夜景等分类，给你一份能直接照着拍的清单。"
          action={
            <button onClick={generate} disabled={busy} className="btn-primary btn-sm">
              {busy ? <Spinner size={14} /> : <Sparkles size={14} />} 生成第一批
            </button>
          }
          icon={<Camera size={20} />}
        />
      )}

      <p className="mt-5 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted">
        <Lightbulb size={12} className="mt-0.5 shrink-0" />
        活动要求图文至少 6 张图 + 50 字，一次拍 6-9 张最稳；图片实拍率需 ≥80%，车辆相关内容至少占一半，全部用手机实拍，不用官方图/渲染图/AI 图。清单里的门店、价格和配置以实际门店为准；拍摄时注意不要拍到其他顾客的正脸和车牌，也不要边开车边拍。
      </p>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="flex w-[4.5rem] shrink-0 items-start gap-1.5 text-muted/80">
        <span className="mt-0.5">{icon}</span>
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-ink/75">{value}</dd>
    </div>
  );
}
