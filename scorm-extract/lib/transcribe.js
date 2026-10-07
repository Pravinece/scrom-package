const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Below this, a clip is almost certainly a reused UI stinger ("Good attempt!",
// "Time's up!") rather than narration - duration is a generic signal (works
// for any Storyline export), unlike matching specific filenames.
const MIN_NARRATION_MS = 6000;

const WHISPER_BIN = process.env.WHISPER_BIN || "whisper";

/**
 * Build slideId -> {videos, audios} using data.js's slideMap (per-slide
 * asset ids) + assetLib (asset id -> file url/duration/kind). Generic: no
 * per-course filenames.
 */
function mapSlideMedia(courseData) {
  const assetLib = courseData.assetLib || {};
  const byId = (id) => assetLib[id];
  const map = new Map();

  for (const ref of courseData.slideMap?.slideRefs || []) {
    if (ref.type !== "slide") continue;
    const slideId = ref.id.includes(".") ? ref.id.split(".").pop() : ref.id;
    const videos = [];
    const audios = [];
    for (const assetId of ref.assetIds || []) {
      const asset = byId(assetId);
      if (!asset || typeof asset.url !== "string") continue;
      if (/\.mp4$/i.test(asset.url)) videos.push(asset);
      else if (/\.mp3$/i.test(asset.url)) audios.push(asset);
    }
    if (videos.length || audios.length) map.set(slideId, { videos, audios });
  }
  return map;
}

/**
 * Dedupe by file url (many clips are reused across slides - generic feedback
 * stingers especially), filter to real narration length, and record which
 * slides each clip belongs to.
 */
function selectNarrationClips(courseData, scormRoot, minDurationMs = MIN_NARRATION_MS) {
  const slideMedia = mapSlideMedia(courseData);
  const byUrl = new Map();

  for (const [slideId, media] of slideMedia.entries()) {
    for (const asset of [...media.videos, ...media.audios]) {
      if ((asset.duration || 0) < minDurationMs) continue; // filtered as likely non-narration
      const existing = byUrl.get(asset.url);
      if (existing) {
        existing.slideIds.push(slideId);
      } else {
        byUrl.set(asset.url, {
          url: asset.url,
          absPath: path.join(scormRoot, asset.url),
          durationMs: asset.duration || 0,
          kind: /\.mp4$/i.test(asset.url) ? "video" : "audio",
          slideIds: [slideId],
        });
      }
    }
  }
  return [...byUrl.values()];
}

/**
 * Run Whisper on one clip. Whisper's Python CLI decodes audio/video itself
 * (shells to ffmpeg internally), so no separate extraction step is needed.
 */
function transcribeClip(clip, outDir, { model = "medium", language = "en" } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.basename(clip.absPath, path.extname(clip.absPath));
  const txtPath = path.join(outDir, `${base}.txt`);
  // Resume support: a killed/interrupted run shouldn't re-transcribe clips it
  // already finished - each clip's .txt is written as soon as it completes,
  // independent of whether the whole batch finishes.
  if (fs.existsSync(txtPath)) {
    const cached = fs.readFileSync(txtPath, "utf-8").trim();
    if (cached) return { text: cached, txtPath, cached: true };
  }
  const result = spawnSync(
    WHISPER_BIN,
    [clip.absPath, "--model", model, "--language", language, "--output_format", "txt", "--output_dir", outDir, "--fp16", "False"],
    {
      encoding: "utf-8",
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" },
      maxBuffer: 1024 * 1024 * 64,
    }
  );
  if (result.status !== 0) {
    throw new Error(`whisper failed on ${clip.url}: ${(result.stderr || "").slice(-2000)}`);
  }
  const text = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, "utf-8").trim() : "";
  return { text, txtPath, cached: false };
}

/**
 * Transcribe a batch of clips sequentially (CPU-bound; parallel Whisper
 * processes would just contend for the same cores). Returns per-clip
 * success/failure so the verification report can show exactly what was
 * transcribed vs. skipped and why.
 */
function transcribeClips(clips, outDir, opts = {}) {
  const results = [];
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const startedAt = Date.now();
    try {
      const { text, cached } = transcribeClip(clip, outDir, opts);
      console.log(`[transcribe] ${i + 1}/${clips.length} ${cached ? "(cached) " : ""}${clip.url} (${Date.now() - startedAt}ms)`);
      results.push({ url: clip.url, slideIds: clip.slideIds, durationMs: clip.durationMs, ok: true, text, cached: !!cached, tookMs: Date.now() - startedAt });
    } catch (err) {
      console.log(`[transcribe] ${i + 1}/${clips.length} FAILED ${clip.url}: ${err.message}`);
      results.push({ url: clip.url, slideIds: clip.slideIds, durationMs: clip.durationMs, ok: false, error: err.message, tookMs: Date.now() - startedAt });
    }
  }
  return results;
}

module.exports = { mapSlideMedia, selectNarrationClips, transcribeClip, transcribeClips, MIN_NARRATION_MS };
