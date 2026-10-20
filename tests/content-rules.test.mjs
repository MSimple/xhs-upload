import test from "node:test";
import assert from "node:assert/strict";
import {
  charLength,
  hashtagLine,
  isValidDateString,
  isValidMonthString,
  isValidTimeString,
  normalizeHashtags,
  publishedBodyLimit,
  validatePostContent,
  XHS_BODY_MAX,
  XHS_HASHTAGS_MAX,
  XHS_TITLE_MAX,
} from "../src/lib/content-rules.ts";

test("date validation rejects impossible dates", () => {
  assert.equal(isValidDateString("2026-10-20"), true);
  assert.equal(isValidDateString("2026-02-30"), false);
  assert.equal(isValidDateString("2026-13-01"), false);
  assert.equal(isValidDateString("2026-1-1"), false);
  assert.equal(isValidDateString("abc"), false);
});

test("time and month validation", () => {
  assert.equal(isValidTimeString("00:00"), true);
  assert.equal(isValidTimeString("23:59"), true);
  assert.equal(isValidTimeString("24:00"), false);
  assert.equal(isValidTimeString("9:30"), false);
  assert.equal(isValidMonthString("2026-10"), true);
  assert.equal(isValidMonthString("2026-13"), false);
});

test("hashtags are deduplicated, cleaned and capped", () => {
  const tags = normalizeHashtags(["#生活", "生活", " 咖啡 ", "", 1]);
  assert.deepEqual(tags, ["生活", "咖啡", "1"]);
  const long = Array.from({ length: 15 }, (_, index) => `tag${index}`);
  assert.equal(normalizeHashtags(long).length, XHS_HASHTAGS_MAX);
});

test("content limits align with publish limits", () => {
  assert.equal(charLength("😀a"), 2);
  const tags = ["理想i6", "我的智系车"];
  assert.equal(hashtagLine(tags), "#理想i6 #我的智系车");
  const limit = publishedBodyLimit(tags);
  assert.ok(limit < XHS_BODY_MAX);
  assert.equal(
    validatePostContent({
      title: "a".repeat(XHS_TITLE_MAX + 1),
      body: "正文",
      hashtags: [],
    }).length > 0,
    true
  );
  assert.deepEqual(
    validatePostContent({ title: "标题", body: "正文", hashtags: tags }),
    []
  );
  assert.equal(
    validatePostContent({
      title: "标题",
      body: "字".repeat(limit + 1),
      hashtags: tags,
    }).some((error) => error.includes("超过小红书")),
    true
  );
});
