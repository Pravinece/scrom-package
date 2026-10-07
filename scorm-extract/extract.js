#!/usr/bin/env node
// Orchestrator: SCORM/Storyline package -> course-content.json,
// reference-docs.json, verification-report.json. Generic - nothing here is
// hardcoded to the IMMPP course beyond the universal Storyline chrome list
// in lib/clean.js.

const fs = require("fs");
const path = require("path");

const { parseManifest } = require("./lib/manifest.js");
const { loadGlobalProvideData, parseCourseStructure } = require("./lib/storyline-data.js");
const { extractSlideTexts } = require("./lib/slide-text.js");
const { cleanCorpus } = require("./lib/clean.js");
const { findAttachments } = require("./lib/attachments.js");
const { extractPdfText } = require("./lib/pdf-text.js");
const { selectNarrationClips, transcribeClips, MIN_NARRATION_MS } = require("./lib/transcribe.js");

function parseArgs(argv) {
  const args = { scormRoot: ".", outDir: path.join(__dirname, "out"), transcribe: false, whisperModel: "medium" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--transcribe") args.transcribe = true;
    else if (a === "--whisper-model") args.whisperModel = argv[++i];
    else if (a === "--out") args.outDir = argv[++i];
    else if (!a.startsWith("--")) args.scormRoot = a;
  }
  return args;
}

// Options appear on-screen right after this line as a short contiguous run;
// this stops before button labels and the (separately handled) hint block.
const OPTION_NOISE = new Set([
  "submit", "hint", "name :", "continue", "try again", "yes", "no", "exit",
  "notes", "menu", "help", "pdf", "revisit",
]);
function isOptionNoise(t) {
  const low = t.toLowerCase();
  if (OPTION_NOISE.has(low)) return true;
  if (/^%_player\./.test(t)) return true;
  if (/^\d{1,3}$/.test(t)) return true;
  if (/^\/\d{1,3}$/.test(t)) return true;
  if (/^\d{1,3}\^%\^$/.test(t)) return true;
  // Reference/citation lines, not answer options - without this a slide
  // whose real options are a numeric-entry field rather than button choices
  // (no on-screen option text at all) can have the heuristic grab the SOP
  // link that follows as a fake "option", presenting a URL as the answer.
  if (/^https?:\/\//i.test(t)) return true;
  if (/^refer\b/i.test(t)) return true;
  if (/click the pdf/i.test(t)) return true;
  // A lone punctuation fragment (stray "(" / ")" left over from a table
  // header split apart, as seen in Level 03's intro slide) is never a real
  // answer option.
  if (t.trim().length <= 2 && !/[a-z0-9]/i.test(t)) return true;
  // A question stem, not an option - most slides place it before the anchor
  // phrase, but at least one (Level 03 Q9) places it after, which without
  // this check gets counted as a fake option and pushes the real last
  // option out of the collected set.
  if (/\?\s*$/.test(t.trim())) return true;
  return false;
}

/**
 * Best-effort: locate the N answer-option texts for an interaction by
 * scanning forward from "Select the correct answer..." and collecting the
 * next N non-chrome lines. Heuristic (Risk 2 in the plan) - spot-checked
 * against the real IQCM clause 3.3.5 table for one question and matched.
 *
 * `boilerplateSet` is the corpus-wide auto-detected boilerplate (lines
 * repeated across most slides - nav tooltips, stray template blocks): a
 * slide with no real discrete option text (e.g. a numeric-entry question
 * Storyline still models as "multiplechoice") has nothing valid to find
 * after the anchor, and without this filter the scan runs past the real
 * content into that boilerplate and reports it as if it were an answer.
 */
function resolveOptionTexts(rawTexts, expectedCount, boilerplateSet) {
  // Wording varies by course - IMMPP says "correct answer", another package
  // seen in practice says "correct option" - anchor on the stable part of
  // the phrase rather than a word choice that isn't actually universal.
  const anchorIdx = rawTexts.findIndex((t) => /select the correct/i.test(t));
  if (anchorIdx === -1 || expectedCount <= 0) return null;
  const candidates = [];
  for (let i = anchorIdx + 1; i < rawTexts.length && candidates.length < expectedCount; i++) {
    const t = rawTexts[i];
    if (isOptionNoise(t)) continue;
    // boilerplateSet keys are normalized (no \r/\n, collapsed whitespace) -
    // match candidates the same way, or a raw "...tunnel?\n" never matches
    // its normalized boilerplate entry and slips through.
    const normalized = t.replace(/\r|\n/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    if (boilerplateSet.has(normalized)) continue;
    candidates.push(t);
  }
  return candidates.length === expectedCount ? candidates : null;
}

// Falls back when no line repeats often enough within a scene to serve as
// its label (common in a single-scene, no-section-header course like the
// CWS package) - without this, callers were falling back to the scene's
// raw Storyline id, an opaque internal string with no business being shown
// to an SME.
function inferSceneLabel(sceneSlides, cleanedById, { courseTitle, totalScenes, sceneOrder }) {
  const lineFreq = new Map();
  for (const slide of sceneSlides) {
    const lines = (cleanedById.get(slide.id) || "").split(" | ").filter(Boolean);
    for (const line of new Set(lines)) lineFreq.set(line, (lineFreq.get(line) || 0) + 1);
  }
  // A line repeated across most of a scene's slides is usually a section
  // header - but quiz feedback ("That's correct!", "That's not quite
  // right.") and MCQ instruction fragments ("Select the correct option and
  // click", "The options are:") repeat just as often on an assessment
  // scene and aren't headers. Each pattern here was found by inspecting a
  // real scene where the naive frequency pick chose one of these instead
  // of falling through to the ordinal fallback.
  const NON_TITLE_PATTERNS = [/!\s*$/, /^that['’]?s\b/i, /select the correct/i, /:\s*$/];
  let best = null;
  for (const [line, count] of lineFreq.entries()) {
    if (count < Math.ceil(sceneSlides.length / 2)) continue;
    if (NON_TITLE_PATTERNS.some((re) => re.test(line.trim()))) continue;
    if (!best || count > best.count || (count === best.count && line.length < best.line.length)) {
      best = { line, count };
    }
  }
  if (best) return best.line;
  if (totalScenes === 1) return courseTitle || "Course";
  return `Section ${sceneOrder + 1}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const scormRoot = path.resolve(args.scormRoot);
  fs.mkdirSync(args.outDir, { recursive: true });

  console.log(`[extract] SCORM root: ${scormRoot}`);
  const manifest = parseManifest(scormRoot);
  console.log(`[extract] course title: ${manifest.title}`);

  const dataJsPath = path.join(scormRoot, "html5", "data", "js", "data.js");
  const rawCourseData = loadGlobalProvideData(dataJsPath);
  const structure = parseCourseStructure(rawCourseData);

  const slideJsDir = path.join(scormRoot, "html5", "data", "js");
  const allSlides = [];
  for (const scene of structure.scenes) for (const slide of scene.slides) allSlides.push({ scene, slide });

  console.log(`[extract] ${structure.scenes.length} scenes, ${allSlides.length} slides — reading on-screen text...`);

  const rawTextsBySlide = new Map();
  const missingSlideFiles = [];
  for (const { slide } of allSlides) {
    const jsPath = path.join(slideJsDir, `${slide.id}.js`);
    if (!fs.existsSync(jsPath)) {
      missingSlideFiles.push(slide.id);
      rawTextsBySlide.set(slide.id, []);
      continue;
    }
    rawTextsBySlide.set(slide.id, extractSlideTexts(jsPath));
  }

  // Boilerplate cleanup, corpus-wide - run first: the auto-detected
  // boilerplate set also gates answer-option resolution below.
  const { cleanedSlides, report: cleanReport } = cleanCorpus(
    allSlides.map(({ slide }) => ({ id: slide.id, texts: rawTextsBySlide.get(slide.id) }))
  );
  const cleanedById = new Map(cleanedSlides.map((s) => [s.id, s.text]));
  const boilerplateSet = new Set(cleanReport.autoDetectedBoilerplateLines.map((b) => b.text.toLowerCase()));

  // Resolve MCQ answer keys against on-screen option order.
  let mcqTotal = 0, mcqResolved = 0;
  const optionsBySlideInteraction = new Map(); // slideId -> interactionId -> resolved texts[]
  for (const { slide } of allSlides) {
    const raw = rawTextsBySlide.get(slide.id);
    for (const interaction of slide.interactions) {
      if (interaction.type !== "multiplechoice" || !interaction.choices.length) continue;
      mcqTotal++;
      const resolved = resolveOptionTexts(raw, interaction.choices.length, boilerplateSet);
      if (resolved) {
        mcqResolved++;
        const key = `${slide.id}:${interaction.id}`;
        optionsBySlideInteraction.set(key, resolved);
      }
    }
  }

  // Narration clips: always select+catalog; only actually transcribe if --transcribe.
  const narrationClips = selectNarrationClips(rawCourseData, scormRoot, MIN_NARRATION_MS);
  const totalNarrationMs = narrationClips.reduce((a, c) => a + c.durationMs, 0);
  console.log(`[extract] ${narrationClips.length} narration clips found (${(totalNarrationMs / 60000).toFixed(1)} min total)`);

  let transcriptResults = [];
  if (args.transcribe) {
    console.log(`[extract] transcribing with whisper --model ${args.whisperModel} (this can take a while)...`);
    const transcriptDir = path.join(args.outDir, "transcripts");
    transcriptResults = transcribeClips(narrationClips, transcriptDir, { model: args.whisperModel });
    const ok = transcriptResults.filter((r) => r.ok).length;
    console.log(`[extract] transcription done: ${ok}/${transcriptResults.length} succeeded`);
  } else {
    console.log(`[extract] --transcribe not passed; skipping narration transcription for this run`);
  }
  const transcriptByUrl = new Map(transcriptResults.filter((r) => r.ok).map((r) => [r.url, r.text]));
  const clipsByUrl = new Map(narrationClips.map((c) => [c.url, c]));
  const slideIdToTranscript = new Map();
  for (const [url, text] of transcriptByUrl.entries()) {
    for (const slideId of clipsByUrl.get(url).slideIds) slideIdToTranscript.set(slideId, { text, sourceUrl: url });
  }

  // Reference PDFs.
  const attachments = findAttachments(scormRoot, manifest.declaredFiles);
  console.log(`[extract] ${attachments.length} reference attachment(s) found: ${attachments.map((a) => a.relPath).join(", ") || "(none)"}`);
  const referenceDocs = [];
  for (const att of attachments) {
    if (att.ext !== ".pdf") {
      referenceDocs.push({ relPath: att.relPath, unsupportedFormat: att.ext, pages: [] });
      continue;
    }
    console.log(`[extract] extracting text: ${att.relPath}`);
    const pdf = await extractPdfText(att);
    referenceDocs.push(pdf);
    if (pdf.likelyScanned) {
      console.log(`[extract]   WARNING: ${att.relPath} looks scanned (avg ${pdf.avgCharsPerPage} chars/page) — needs OCR, not usable as-is`);
    }
  }

  // Assemble course-content.json
  const scenesOut = structure.scenes.map((scene) => {
    const label = inferSceneLabel(scene.slides, cleanedById, {
      courseTitle: manifest.title,
      totalScenes: structure.scenes.length,
      sceneOrder: scene.order,
    });
    return {
      id: scene.id,
      inferredLabel: label,
      order: scene.order,
      slides: scene.slides.map((slide) => {
        const narration = slideIdToTranscript.get(slide.id) || null;
        return {
          id: slide.id,
          title: slide.title,
          order: slide.order,
          text: cleanedById.get(slide.id) || "",
          narrationTranscript: narration?.text || null,
          narrationSource: narration?.sourceUrl || null,
          interactions: slide.interactions.map((interaction) => {
            const resolvedTexts = optionsBySlideInteraction.get(`${slide.id}:${interaction.id}`) || null;
            const correctIdx = resolvedTexts
              ? interaction.choices.findIndex((c) => interaction.correctChoiceIds.includes(c.id))
              : -1;
            return {
              id: interaction.id,
              type: interaction.type,
              maxPoints: interaction.maxPoints,
              optionCount: interaction.choices.length,
              resolvedOptionTexts: resolvedTexts,
              correctOptionIndex: correctIdx >= 0 ? correctIdx : null,
              correctOptionText: correctIdx >= 0 && resolvedTexts ? resolvedTexts[correctIdx] : null,
              answerResolution: resolvedTexts ? "position-heuristic" : "unresolved",
            };
          }),
        };
      }),
    };
  });

  const courseContent = {
    meta: {
      title: manifest.title,
      courseId: rawCourseData.courseId,
      scormRoot,
      extractedAt: new Date().toISOString(),
    },
    scenes: scenesOut,
  };

  fs.writeFileSync(path.join(args.outDir, "course-content.json"), JSON.stringify(courseContent, null, 2));
  fs.writeFileSync(path.join(args.outDir, "reference-docs.json"), JSON.stringify({ documents: referenceDocs }, null, 2));

  // Verification report
  const declaredSlideJsCount = fs
    .readdirSync(slideJsDir)
    .filter((f) => f.endsWith(".js") && !["data.js", "frame.js", "paths.js"].includes(f)).length;

  const report = {
    generatedAt: new Date().toISOString(),
    slides: {
      rawSlideFilesOnDisk: declaredSlideJsCount,
      slidesInCourseStructure: allSlides.length,
      missingSlideFiles,
    },
    boilerplateCleanup: cleanReport,
    answerKey: {
      totalMultipleChoiceInteractions: mcqTotal,
      resolvedAgainstOnScreenText: mcqResolved,
      unresolved: mcqTotal - mcqResolved,
    },
    referenceDocuments: referenceDocs.map((d) => ({
      relPath: d.relPath,
      totalPages: d.totalPages ?? null,
      avgCharsPerPage: d.avgCharsPerPage ?? null,
      likelyScanned: d.likelyScanned ?? null,
      unsupportedFormat: d.unsupportedFormat ?? null,
    })),
    narration: {
      minNarrationMs: MIN_NARRATION_MS,
      clipsFound: narrationClips.length,
      totalNarrationMinutes: +(totalNarrationMs / 60000).toFixed(1),
      transcribed: args.transcribe,
      transcriptionResults: args.transcribe
        ? transcriptResults.map((r) => ({ url: r.url, slideIds: r.slideIds, durationMs: r.durationMs, ok: r.ok, error: r.error, chars: r.text?.length }))
        : null,
      // Whisper transcribes the AUDIO track only - it does no analysis of
      // the video frames. Confirmed with a real clip in this course: a
      // diagram showing the pipe's product order (HSD -> PCK -> MS) was
      // never spoken aloud, so it's absent from every transcript despite
      // being real, load-bearing course content. Closing this needs frame
      // sampling + OCR/vision analysis - not built; every package with
      // narration clips carries this same blind spot until it is.
      visualContentNotCaptured: narrationClips.length > 0
        ? "Text, diagrams, and labels that appear only visually in a video's frames (not spoken, not a separate Storyline text object) are not extracted by this pipeline. Whisper transcribes audio only."
        : null,
    },
  };
  fs.writeFileSync(path.join(args.outDir, "verification-report.json"), JSON.stringify(report, null, 2));

  console.log(`[extract] wrote course-content.json, reference-docs.json, verification-report.json to ${args.outDir}`);
  console.log(`[extract] answer key resolved: ${mcqResolved}/${mcqTotal} MCQs`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
