import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.XHS_DATA_DIR || path.join(process.cwd(), "data");
const uploadDir = path.join(dataDir, "uploads");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const db = new DatabaseSync(path.join(dataDir, "studio.db"));

const rows = db
  .prepare(
    "SELECT id, filename, preview_name, thumb_name FROM images WHERE thumb_name IS NULL"
  )
  .all();

let created = 0;
let skipped = 0;
for (const row of rows) {
  const sourceName = row.preview_name || row.filename;
  const source = path.join(uploadDir, String(sourceName));
  const outputName = `${row.id}_thumb.jpg`;
  const output = path.join(uploadDir, outputName);
  if (!fs.existsSync(source)) {
    skipped++;
    console.warn("[thumb] source missing", source);
    continue;
  }
  const result = spawnSync(
    ffmpeg,
    [
      "-y",
      "-i",
      source,
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-2",
      "-q:v",
      "4",
      output,
    ],
    { windowsHide: true, timeout: 60_000 }
  );
  if (result.status === 0 && fs.existsSync(output)) {
    db.prepare("UPDATE images SET thumb_name = ? WHERE id = ?").run(
      outputName,
      row.id
    );
    created++;
  } else {
    skipped++;
    console.warn(
      "[thumb] failed",
      row.id,
      String(result.stderr || result.error || "").slice(-200)
    );
  }
}

db.close();
console.log(`[thumb] created ${created}, skipped ${skipped}`);
