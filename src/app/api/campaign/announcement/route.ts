import { NextResponse } from "next/server";
import { getSettings, saveSettings } from "@/lib/db";
import { fail, readJson } from "@/lib/api";

export const runtime = "nodejs";

type AnnouncementLink = { label: string; url: string };

function parseLinks(text: string): AnnouncementLink[] {
  const links: AnnouncementLink[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const matches = line.match(/https?:\/\/[^\s]+/g);
    if (!matches) continue;
    for (const raw of matches) {
      const url = raw.replace(/[，。；、）)\]]+$/g, "");
      if (seen.has(url)) continue;
      seen.add(url);
      const label =
        line
          .replace(raw, "")
          .replace(/^[\s\-*•·]+/, "")
          .replace(/^\d+[.、)]\s*/, "")
          .replace(/^[：:\s]+/, "")
          .replace(/[\s:：]+$/g, "")
          .slice(0, 40) || "收集表";
      links.push({ label, url });
    }
  }
  return links;
}

function announcement() {
  const settings = getSettings();
  let links: AnnouncementLink[] = [];
  try {
    const parsed = JSON.parse(settings.campaign_announcement_links || "[]");
    if (Array.isArray(parsed)) links = parsed;
  } catch {
    links = [];
  }
  return {
    raw: settings.campaign_announcement_raw,
    links,
    month: settings.campaign_announcement_month,
    at: settings.campaign_announcement_at,
  };
}

export async function GET() {
  try {
    return NextResponse.json({ announcement: announcement() });
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{ text?: string }>(request);
    const text = String(body.text || "").trim().slice(0, 20000);
    if (!text) return fail("请先粘贴群公告内容");
    const links = parseLinks(text);
    const monthMatch = text.match(/(\d{1,2})\s*月/);
    const month = monthMatch ? `${Number(monthMatch[1])}月` : "";
    const at = new Date().toISOString();
    saveSettings({
      campaign_announcement_raw: text,
      campaign_announcement_links: JSON.stringify(links),
      campaign_announcement_month: month,
      campaign_announcement_at: at,
    });
    return NextResponse.json({
      announcement: { raw: text, links, month, at },
    });
  } catch (error) {
    return fail(error, 500);
  }
}
