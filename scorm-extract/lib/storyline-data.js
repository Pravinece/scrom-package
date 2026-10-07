const fs = require("fs");
const vm = require("vm");

/**
 * Storyline's HTML5 export wraps every data file as:
 *   window.globalProvideData('<kind>', '<JSON string, real JS string-literal escaping>');
 * The payload is a JS string literal, not raw JSON, so a hand-rolled unescaper
 * is fragile (backslashes, unicode escapes, etc.). Running the real file
 * through a sandboxed VM and letting the JS engine parse its own string
 * literal is robust to all of that, and works unchanged for data.js, frame.js,
 * paths.js and every per-slide file - they all use the same wrapper.
 */
function loadGlobalProvideData(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8").replace(/^﻿/, "");
  let captured = null;
  const sandbox = {
    window: {
      globalProvideData(_kind, jsonStr) {
        captured = JSON.parse(jsonStr);
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(raw, sandbox, { filename: filePath, timeout: 5000 });
  if (captured === null) {
    throw new Error(`globalProvideData was never called while evaluating ${filePath}`);
  }
  return captured;
}

/**
 * Walk data.js's scene/slide tree and each slide's multiple-choice
 * interactions, resolving which choice is marked correct.
 *
 * Returns { courseId, scenes: [{ id, title, order, slides: [{ id, title,
 * order, interactions: [{ id, type, maxPoints, choices: [{id, lmstext}],
 * correctChoiceIds: [id, ...] }] }] }] }
 */
function parseCourseStructure(dataJsPathOrObject) {
  const data = typeof dataJsPathOrObject === "string" ? loadGlobalProvideData(dataJsPathOrObject) : dataJsPathOrObject;
  // isMessageScene marks Storyline's built-in infra scenes (resume prompt,
  // "you've lost connection" error) - not real course content in any project.
  const scenes = (data.scenes || [])
    .filter((scene) => !scene.isMessageScene)
    .map((scene, sceneOrder) => ({
      id: scene.id,
      title: stripHtml(scene.title),
      order: sceneOrder,
      slides: (scene.slides || []).map((slide, slideOrder) => ({
        id: slide.id,
        title: stripHtml(slide.title),
        order: slideOrder,
        interactions: extractInteractions(slide),
      })),
    }));
  return { courseId: data.courseId, projectId: data.projectId, scenes };
}

function extractInteractions(slide) {
  const interactions = slide.interactions || [];
  return interactions.map((interaction) => {
    const choices = (interaction.choices || []).map((c) => ({
      id: c.id,
      lmstext: c.lmstext ?? null,
    }));
    const correctChoiceIds = new Set();
    for (const answer of interaction.answers || []) {
      if (answer.status !== "correct") continue;
      collectChoiceIds(answer.evaluate, correctChoiceIds);
    }
    return {
      id: interaction.id,
      type: interaction.type || null,
      maxPoints: interaction.maxpoints ?? null,
      choices,
      correctChoiceIds: [...correctChoiceIds],
    };
  });
}

// answers[].evaluate.statements[] holds {kind:"equals", choiceid: "choices.<id>"}
// (or nested boolean-groups for multi-select); walk it generically rather than
// assuming a fixed shape.
function collectChoiceIds(node, out) {
  if (!node || typeof node !== "object") return;
  if (typeof node.choiceid === "string") {
    const id = node.choiceid.startsWith("choices.") ? node.choiceid.slice("choices.".length) : node.choiceid;
    out.add(id);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((v) => collectChoiceIds(v, out));
    else if (value && typeof value === "object") collectChoiceIds(value, out);
  }
}

function stripHtml(s) {
  if (typeof s !== "string") return s;
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

module.exports = { loadGlobalProvideData, parseCourseStructure };
