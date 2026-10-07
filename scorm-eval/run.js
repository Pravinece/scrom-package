// Automated eval harness — the actual answer to "how do we know this is valid,"
// not a chat transcript skim. Three probe types, each checked against ground
// truth the extraction pipeline already produced (or, for coverage, a small
// hand-curated list — see plan Stage 5).
const fs = require("fs");
const path = require("path");

const API_BASE = process.env.SCORM_CHAT_API_BASE || "http://localhost:" + (process.env.PORT || 8787);
const COURSE_CONTENT_PATH = path.join(__dirname, "..", "scorm-extract", "out", "course-content.json");
const OUT_DIR = path.join(__dirname, "out");

// Topics genuinely absent from this course/domain — used to check the
// backend doesn't hallucinate coverage of things that aren't there.
const KNOWN_ABSENT_TOPICS = [
  "crude oil desalting procedure",
  "SCADA cybersecurity requirements",
  "employee annual leave policy",
  "marine vessel ballast water treatment",
];

const CLAUSE_RE = /\b(?:Cl\.?|Clause)\s?\d+(?:\.\d+){1,3}\b|\bappendix-?\s?\d+\b/gi;

async function askApi(question) {
  const res = await fetch(`${API_BASE}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, history: [] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function normalize(s) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function buildAnswerKeyProbes(courseContent) {
  const probes = [];
  for (const scene of courseContent.scenes) {
    const section = scene.inferredLabel || scene.id;
    for (const slide of scene.slides) {
      for (const interaction of slide.interactions) {
        if (!interaction.correctOptionText) continue;
        probes.push({
          kind: "answer-key",
          question: `In the course section "${section}", what is the correct answer to the question on the slide titled "${slide.title}" (id ${slide.id})? Answer with just the option text.`,
          expectedSubstring: interaction.correctOptionText,
          meta: { slideId: slide.id, section },
        });
      }
    }
  }
  return probes;
}

function buildClauseProbes(courseContent) {
  const clauses = new Set();
  for (const scene of courseContent.scenes) {
    for (const slide of scene.slides) {
      const matches = slide.text.match(CLAUSE_RE) || [];
      matches.forEach((m) => clauses.add(m.trim()));
    }
  }
  return [...clauses].map((clause) => ({
    kind: "clause-grounding",
    question: `What does ${clause} actually say in the reference document? Quote it.`,
    expectedClause: clause,
    meta: { clause },
  }));
}

function buildCoverageProbes(courseContent) {
  const covered = [];
  for (const scene of courseContent.scenes) {
    for (const slide of scene.slides) {
      const m = slide.text.match(/[A-Z][a-zA-Z/ ]{6,40}tank/);
      if (m) covered.push(m[0].trim());
    }
  }
  const coveredSample = [...new Set(covered)].slice(0, 4);
  const probes = coveredSample.map((topic) => ({
    kind: "coverage",
    question: `Is "${topic}" covered anywhere in this course? Answer yes or no and say where.`,
    expectCovered: true,
    meta: { topic },
  }));
  for (const topic of KNOWN_ABSENT_TOPICS) {
    probes.push({
      kind: "coverage",
      question: `Is "${topic}" covered anywhere in this course? Answer yes or no.`,
      expectCovered: false,
      meta: { topic },
    });
  }
  return probes;
}

function scoreAnswerKey(probe, result) {
  const ok = normalize(result.answer).includes(normalize(probe.expectedSubstring));
  return { ok, detail: ok ? "answer contains expected option text" : `expected to contain "${probe.expectedSubstring}"` };
}

function scoreClauseGrounding(probe, result) {
  const citedReference = (result.citations || []).some((c) => c.sourceType === "reference");
  // Compare only the numeric identifier - the course says "Cl 3.3.5", the
  // model may reasonably write "Clause 3.3.5"; a strict string match on the
  // "Cl"/"Clause" prefix produces false failures on correct answers.
  const clauseNumber = normalize(probe.expectedClause.replace(/^(Cl\.?|Clause)\s?/i, ""));
  const mentionsClause = normalize(result.answer).includes(clauseNumber);
  const ok = citedReference && mentionsClause;
  return {
    ok,
    detail: ok
      ? `citedReference=${citedReference}, mentionsClause=${mentionsClause}`
      : `citedReference=${citedReference}, mentionsClause=${mentionsClause} — a "no" here can also mean the model correctly reported the clause doesn't exist verbatim in the manual (a real citation mismatch worth checking by hand, not necessarily a retrieval bug)`,
  };
}

function scoreCoverage(probe, result) {
  const answer = result.answer.toLowerCase();
  const saysYes = /\byes\b/.test(answer) || /is covered/.test(answer);
  const saysNo = /\bno\b/.test(answer) || /not covered|not found|couldn'?t find|no mention/.test(answer);
  const ok = probe.expectCovered ? saysYes && !saysNo : saysNo && !saysYes;
  return { ok, detail: `saysYes=${saysYes}, saysNo=${saysNo}, expected=${probe.expectCovered}` };
}

const SCORERS = { "answer-key": scoreAnswerKey, "clause-grounding": scoreClauseGrounding, coverage: scoreCoverage };

async function runProbes(probes, { limit } = {}) {
  const sample = limit ? probes.slice(0, limit) : probes;
  const results = [];
  for (let i = 0; i < sample.length; i++) {
    const probe = sample[i];
    process.stdout.write(`\r[eval] ${probe.kind}: ${i + 1}/${sample.length}`);
    try {
      const result = await askApi(probe.question);
      const scored = SCORERS[probe.kind](probe, result);
      results.push({ ...probe, ok: scored.ok, detail: scored.detail, answer: result.answer, citations: result.citations });
    } catch (err) {
      results.push({ ...probe, ok: false, detail: `request failed: ${err.message}` });
    }
  }
  process.stdout.write("\n");
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : undefined;

  const health = await fetch(`${API_BASE}/health`).catch(() => null);
  if (!health || !health.ok) {
    console.error(`[eval] backend not reachable at ${API_BASE} — start it with \`npm run api\` first`);
    process.exit(1);
  }

  const courseContent = JSON.parse(fs.readFileSync(COURSE_CONTENT_PATH, "utf-8"));

  const answerKeyProbes = buildAnswerKeyProbes(courseContent);
  const clauseProbes = buildClauseProbes(courseContent);
  const coverageProbes = buildCoverageProbes(courseContent);

  console.log(`[eval] probes: ${answerKeyProbes.length} answer-key, ${clauseProbes.length} clause-grounding, ${coverageProbes.length} coverage`);

  const answerKeyResults = await runProbes(answerKeyProbes, { limit });
  const clauseResults = await runProbes(clauseProbes, { limit });
  const coverageResults = await runProbes(coverageProbes, { limit });

  const all = [...answerKeyResults, ...clauseResults, ...coverageResults];
  const summary = {};
  for (const kind of Object.keys(SCORERS)) {
    const group = all.filter((r) => r.kind === kind);
    const passed = group.filter((r) => r.ok).length;
    summary[kind] = { total: group.length, passed, rate: group.length ? +(passed / group.length).toFixed(3) : null };
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = { generatedAt: new Date().toISOString(), summary, results: all };
  fs.writeFileSync(path.join(OUT_DIR, "eval-report.json"), JSON.stringify(report, null, 2));

  console.log("\n[eval] summary:");
  for (const [kind, s] of Object.entries(summary)) {
    console.log(`  ${kind}: ${s.passed}/${s.total} (${s.rate === null ? "n/a" : (s.rate * 100).toFixed(1) + "%"})`);
  }
  console.log(`[eval] full report: ${path.join(OUT_DIR, "eval-report.json")}`);
}

main().catch((err) => {
  console.error("[eval] failed:", err);
  process.exit(1);
});
