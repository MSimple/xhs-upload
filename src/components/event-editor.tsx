"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Modal, Spinner } from "@/components/ui";
import { useToast } from "@/components/toast";
import { api } from "@/lib/client";
import { addDays, todayStr } from "@/lib/utils";
import type { Event } from "@/lib/types";

type EventForm = {
  name: string;
  startDate: string;
  endDate: string;
  topicsText: string;
  quota: string;
  publishTime: string;
  minImages: string;
  minBody: string;
  collectionForm: string;
  collectionUrl: string;
  countsWeekly: boolean;
  internal: boolean;
  officialAssets: boolean;
  brief: string;
  note: string;
};

function emptyForm(): EventForm {
  const today = todayStr();
  return {
    name: "",
    startDate: today,
    endDate: addDays(today, 1),
    topicsText: "",
    quota: "1",
    publishTime: "21:30",
    minImages: "6",
    minBody: "50",
    collectionForm: "",
    collectionUrl: "",
    countsWeekly: false,
    internal: false,
    officialAssets: false,
    brief: "",
    note: "",
  };
}

function toForm(event: Event): EventForm {
  return {
    name: event.name,
    startDate: event.startDate,
    endDate: event.endDate,
    topicsText: event.requiredTopics.join(" "),
    quota: String(event.quota),
    publishTime: event.publishTime,
    minImages: String(event.minImages),
    minBody: String(event.minBody),
    collectionForm: event.collectionForm,
    collectionUrl: event.collectionUrl,
    countsWeekly: event.countsWeekly,
    internal: event.internal,
    officialAssets: event.officialAssets,
    brief: event.brief,
    note: event.note,
  };
}

export function EventEditorDialog({
  open,
  onClose,
  event,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  event?: Event | null;
  onSaved?: (event: Event) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [announcement, setAnnouncement] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(event ? toForm(event) : emptyForm());
    setAnnouncement("");
    setWarnings([]);
  }, [open, event]);

  function patch<K extends keyof EventForm>(key: K, value: EventForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function parseAnnouncement() {
    if (!announcement.trim()) {
      toast("先把群公告粘贴进来", "error");
      return;
    }
    setParsing(true);
    try {
      const res = await api<{
        event: {
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
          warnings: string[];
        };
      }>("/api/events/parse", {
        method: "POST",
        body: JSON.stringify({ text: announcement }),
      });
      const parsed = res.event;
      setForm({
        name: parsed.name,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        topicsText: parsed.requiredTopics.join(" "),
        quota: String(parsed.quota),
        publishTime: parsed.publishTime || "21:30",
        minImages: String(parsed.minImages),
        minBody: String(parsed.minBody),
        collectionForm: parsed.collectionForm,
        collectionUrl: parsed.collectionUrl,
        countsWeekly: parsed.countsWeekly,
        internal: parsed.internal,
        officialAssets: parsed.officialAssets,
        brief: parsed.brief,
        note: "",
      });
      setWarnings(parsed.warnings || []);
      toast("已识别活动信息，请确认后保存", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "识别失败", "error");
    } finally {
      setParsing(false);
    }
  }

  async function save() {
    if (!form.name.trim()) {
      toast("活动名称不能为空", "error");
      return;
    }
    if (!form.startDate || !form.endDate) {
      toast("请填写活动开始和结束日期", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        requiredTopics: form.topicsText
          .split(/[\s#，,、]+/)
          .map((topic) => topic.trim().replace(/^#+/, ""))
          .filter(Boolean),
        quota: Number(form.quota) || 1,
        publishTime: form.publishTime || "21:30",
        minImages: Number(form.minImages) || 6,
        minBody: Number(form.minBody) || 50,
        collectionForm: form.collectionForm,
        collectionUrl: form.collectionUrl,
        countsWeekly: form.countsWeekly,
        internal: form.internal,
        officialAssets: form.officialAssets,
        brief: form.brief,
        note: form.note,
      };
      const res = await api<{ event: Event }>(
        event ? `/api/events/${event.id}` : "/api/events",
        {
          method: event ? "PATCH" : "POST",
          body: JSON.stringify(payload),
        }
      );
      toast(event ? "活动已更新" : "活动已创建", "success");
      onSaved?.(res.event);
      onClose();
    } catch (error) {
      toast(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      size="lg"
      title={event ? "编辑活动" : "新建临时活动"}
      subtitle="可以手动填写，也可以直接粘贴群公告自动识别"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="btn-secondary btn-sm">
            取消
          </button>
          <button onClick={save} disabled={saving} className="btn-primary btn-sm">
            {saving ? <Spinner size={14} /> : null}
            {event ? "保存修改" : "创建活动"}
          </button>
        </div>
      }
    >
      <div className="space-y-5 p-5 sm:p-6">
        {!event && (
          <div className="rounded-2xl border border-brand/20 bg-brand-soft/30 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-brand">
              <Sparkles size={15} /> 粘贴群公告，自动识别
            </div>
            <textarea
              value={announcement}
              onChange={(event) => setAnnouncement(event.target.value)}
              rows={4}
              aria-label="群公告原文"
              placeholder="把 @所有人 的活动公告整段粘贴到这里，会自动识别活动名、日期、话题、篇数、收集表等…"
              className="field resize-y text-xs"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={parseAnnouncement}
                disabled={parsing || !announcement.trim()}
                className="btn-secondary btn-sm"
              >
                {parsing ? <Spinner size={13} /> : <Sparkles size={13} />}
                {parsing ? "正在识别…" : "自动识别"}
              </button>
              <span className="text-[10px] text-muted">
                识别后仍要人工确认，尤其是日期和话题
              </span>
            </div>
            {warnings.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
                {warnings.map((warning) => (
                  <li key={warning}>· {warning}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">活动名称</label>
            <input
              value={form.name}
              onChange={(event) => patch("name", event.target.value)}
              className="field"
              placeholder="例如：Power Day 理想汽车电动技术发布会"
            />
          </div>
          <div>
            <label className="label">开始日期</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(event) => patch("startDate", event.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">结束日期</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(event) => patch("endDate", event.target.value)}
              className="field"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">必带话题（空格分开，不带 #）</label>
            <input
              value={form.topicsText}
              onChange={(event) => patch("topicsText", event.target.value)}
              className="field"
              placeholder="理想自研电池 理想i6"
            />
          </div>
          <div>
            <label className="label">周期内篇数</label>
            <input
              type="number"
              min={1}
              max={10}
              value={form.quota}
              onChange={(event) => patch("quota", event.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">建议发布时间</label>
            <input
              type="time"
              value={form.publishTime}
              onChange={(event) => patch("publishTime", event.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">最少配图</label>
            <input
              type="number"
              min={1}
              max={9}
              value={form.minImages}
              onChange={(event) => patch("minImages", event.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">正文最少字数</label>
            <input
              type="number"
              min={1}
              max={1000}
              value={form.minBody}
              onChange={(event) => patch("minBody", event.target.value)}
              className="field"
            />
          </div>
          <div>
            <label className="label">收集表名称</label>
            <input
              value={form.collectionForm}
              onChange={(event) => patch("collectionForm", event.target.value)}
              className="field"
              placeholder="2026 Power Day"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">收集表链接（可选）</label>
            <input
              value={form.collectionUrl}
              onChange={(event) => patch("collectionUrl", event.target.value)}
              className="field font-mono text-xs"
              placeholder="https://..."
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="flex cursor-pointer items-start gap-2 rounded-2xl border border-line bg-white p-3 text-xs">
            <input
              type="checkbox"
              checked={form.countsWeekly}
              onChange={(event) => patch("countsWeekly", event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#c81e3a]"
            />
            <span>
              <span className="block font-medium">计入周上限</span>
              <span className="mt-0.5 block text-[10px] text-muted">
                默认不占常驻活动周上限
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-2xl border border-line bg-white p-3 text-xs">
            <input
              type="checkbox"
              checked={form.internal}
              onChange={(event) => patch("internal", event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#c81e3a]"
            />
            <span>
              <span className="block font-medium">内部活动</span>
              <span className="mt-0.5 block text-[10px] text-muted">
                提示不要外传截图
              </span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-2xl border border-line bg-white p-3 text-xs">
            <input
              type="checkbox"
              checked={form.officialAssets}
              onChange={(event) =>
                patch("officialAssets", event.target.checked)
              }
              className="mt-0.5 h-4 w-4 accent-[#c81e3a]"
            />
            <span>
              <span className="block font-medium">官方素材需二创</span>
              <span className="mt-0.5 block text-[10px] text-muted">
                发布前提醒，不做自动判定
              </span>
            </span>
          </label>
        </div>

        <div>
          <label className="label">活动说明 / 公告原文（可选）</label>
          <textarea
            value={form.brief}
            onChange={(event) => patch("brief", event.target.value)}
            rows={4}
            className="field resize-y text-xs"
            placeholder="自动识别会填入公告全文，AI 写活动稿时会参考它"
          />
        </div>
        <div>
          <label className="label">内部备注（可选）</label>
          <input
            value={form.note}
            onChange={(event) => patch("note", event.target.value)}
            className="field"
            placeholder="例如：群里要求今晚发，收集表选 2026 Power Day"
          />
        </div>
      </div>
    </Modal>
  );
}
