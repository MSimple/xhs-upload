import { NextResponse } from "next/server";
import { generateShotIdeas, getAiConfig } from "@/lib/ai";
import {
  clearShotIdeas,
  getSettings,
  insertShotIdeas,
  listImages,
  listShotIdeas,
  saveSettings,
} from "@/lib/db";
import { fail, readJson } from "@/lib/api";
import {
  CATEGORY_HINTS,
  SHOT_CATEGORIES,
  analyzeShotCoverage,
  isShotCategory,
  pickCuratedShotIdeas,
} from "@/lib/shot-ideas";

export const runtime = "nodejs";
export const maxDuration = 300;

function currentCampaign() {
  const settings = getSettings();
  return {
    settings,
    campaign: (settings.campaign_name || "").trim(),
    city: settings.campaign_city || "",
  };
}

function summary() {
  const { campaign, city } = currentCampaign();
  const images = listImages();
  const coverage = analyzeShotCoverage(images).sort(
    (a, b) => a.count - b.count
  );
  return {
    campaign,
    city,
    configured: getAiConfig().enabled,
    ideas: listShotIdeas(campaign),
    coverage,
    gaps: coverage.filter((item) => item.missing).map((item) => item.category),
    categories: SHOT_CATEGORIES,
    hints: CATEGORY_HINTS,
    imageCount: images.length,
  };
}

export async function GET() {
  try {
    return NextResponse.json(summary());
  } catch (error) {
    return fail(error, 500);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readJson<{
      count?: number;
      category?: string;
      city?: string;
      focus?: string;
      replace?: boolean;
    }>(request);

    const { settings, campaign } = currentCampaign();
    if (!campaign) return fail("请先在创作营里设置活动名称");

    const count = Math.min(12, Math.max(1, Number(body.count) || 8));
    const category =
      body.category && isShotCategory(body.category) ? body.category : undefined;
    const city = (body.city ?? settings.campaign_city ?? "").trim().slice(0, 20);

    if (city !== settings.campaign_city) {
      saveSettings({ campaign_city: city });
    }
    if (body.replace) {
      clearShotIdeas(campaign);
    }

    const existingIdeas = listShotIdeas(campaign);
    const images = listImages();
    const coverage = analyzeShotCoverage(images).sort(
      (a, b) => a.count - b.count
    );
    const gaps = coverage
      .filter((item) => item.missing)
      .map((item) => item.category);
    const existingSummaries = images
      .filter((image) => image.analysis || image.summary)
      .slice(0, 40)
      .map((image) => image.analysis?.summary || image.summary || "")
      .filter(Boolean);
    const existingTitles = existingIdeas.map((idea) => idea.title);

    const config = getAiConfig();
    const warnings: string[] = [];
    let mock = !config.enabled;
    let ideas;

    try {
      const result = await generateShotIdeas(config, settings, {
        campaign,
        city,
        count,
        category,
        focus: body.focus?.trim().slice(0, 200),
        existingSummaries,
        existingTitles,
        gaps,
      });
      ideas = result.ideas;
      mock = result.mock;
    } catch (error) {
      warnings.push(
        `AI 生成失败，已改用内置灵感库：${
          error instanceof Error ? error.message : String(error)
        }`
      );
      ideas = pickCuratedShotIdeas({
        count,
        category,
        city,
        existingTitles,
      });
      mock = true;
    }

    const saved = insertShotIdeas(
      campaign,
      ideas.map((idea) => ({
        ...idea,
        source: mock ? "curated" : "ai",
      }))
    );

    return NextResponse.json({
      ...summary(),
      created: saved,
      warnings,
      mock,
    });
  } catch (error) {
    return fail(error, 502);
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { campaign } = currentCampaign();
    const target = (searchParams.get("campaign") || campaign).trim();
    if (!target) return fail("活动名称为空");
    clearShotIdeas(target);
    return NextResponse.json(summary());
  } catch (error) {
    return fail(error, 500);
  }
}
