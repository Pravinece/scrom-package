const fs = require("fs");
const path = require("path");
const { getOpenAIClient, getSearchClient, getConfig } = require("../config/index.js");

const TOP_K = 8;
const CLAUSE_TOP_K = 3;
const EXTRACT_ROOT = path.join(__dirname, "..", "..", "scorm-extract", "out");
const CLAUSE_RE = /\b(?:Cl\.?|Clause)\s?\d+(?:\.\d+){1,3}\b|\bappendix-?\s?\d+\b/gi;

const SYSTEM_INSTRUCTIONS = `You are a warm, knowledgeable tutor for this course, having a real spoken conversation with a learner who wants to understand the material without clicking through the original slides. Your reply will be read aloud by a text-to-speech voice, so write the way a person actually talks, not the way a document reads.

You'll be given retrieved passages from the course itself (on-screen text, transcribed narration, and its own quiz questions and answers) and, when the package includes them, the reference documents the course is based on. Use them to make sure what you say is actually correct - but never mention them as "passages," "sources," or "the course content" out loud, and never write a bracketed citation, a file name, or a slide id. A learner doesn't care where the answer technically came from.

How to answer:
- Short and conversational. Two to four sentences is normal; only go longer if the learner clearly wants to go deeper.
- Plain spoken sentences only - no markdown, no asterisks, no bullet points, no headings. This gets read aloud.
- If something isn't covered in the material, say so simply and naturally ("that's not really covered here") - you can still help from general knowledge if it's genuinely useful, just say plainly that it's beyond this course.
- If asked to quiz the learner or explain something, act like a real tutor: ask a follow-up, check understanding, use a quick example.
- A course and the documents it's based on sometimes use different names for the same thing (e.g. one industry term standing in for another) - treat them as the same thing rather than pointing out the naming difference.

Stay accurate to the real material - you're helping someone actually learn it, not just sounding smooth.`;

const knownSlideIdsCache = new Map();

function loadKnownSlideIds(packageId) {
  if (knownSlideIdsCache.has(packageId)) return knownSlideIdsCache.get(packageId);
  const p = path.join(EXTRACT_ROOT, packageId, "course-content.json");
  const ids = new Set();
  if (fs.existsSync(p)) {
    const course = JSON.parse(fs.readFileSync(p, "utf-8"));
    for (const scene of course.scenes) for (const slide of scene.slides) ids.add(slide.id);
  }
  knownSlideIdsCache.set(packageId, ids);
  return ids;
}

async function askQuestion({ question, history = [], packageId }) {
  const openaiClient = getOpenAIClient();
  const searchClient = getSearchClient();
  const config = getConfig();

  const turns = Array.isArray(history)
    ? history.filter((t) => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    : [];

  const embedRes = await openaiClient.embeddings.create({
    model: config.openai.embeddingDeployment,
    input: [question],
  });
  const queryVector = embedRes.data[0].embedding;

  async function searchByType(sourceType) {
    const results = await searchClient.search("", {
      vectorSearchOptions: {
        queries: [{ kind: "vector", vector: queryVector, fields: ["contentVector"], kNearestNeighborsCount: TOP_K }],
      },
      filter: `packageId eq '${packageId}' and sourceType eq '${sourceType}'`,
      select: ["id", "text", "sourceType", "docName", "locator"],
      top: TOP_K,
    });
    const out = [];
    for await (const r of results.results) out.push({ score: r.score, ...r.document });
    return out;
  }

  const knownSlideIds = loadKnownSlideIds(packageId);
  const mentionedSlideIds = [...knownSlideIds].filter((id) => question.includes(id));
  const idLookups = await Promise.all(
    mentionedSlideIds.map(async (id) => {
      const results = await searchClient.search("", {
        filter: `id eq '${packageId}__course_${id}'`,
        select: ["id", "text", "sourceType", "docName", "locator"],
        top: 1,
      });
      const out = [];
      for await (const r of results.results) out.push({ score: 999, ...r.document });
      return out;
    })
  );

  const [coursePassages, referencePassages] = await Promise.all([
    searchByType("course"),
    searchByType("reference"),
  ]);
  coursePassages.push(...idLookups.flat());

  const clauseNumbers = new Set();
  for (const p of coursePassages) {
    for (const m of p.text.match(CLAUSE_RE) || []) clauseNumbers.add(m.replace(/^(Cl\.?|Clause)\s?/i, "").trim());
  }
  const clauseSearches = await Promise.all(
    [...clauseNumbers].map(async (clause) => {
      const results = await searchClient.search(clause, {
        filter: `packageId eq '${packageId}' and sourceType eq 'reference'`,
        select: ["id", "text", "sourceType", "docName", "locator"],
        top: CLAUSE_TOP_K,
      });
      const out = [];
      for await (const r of results.results) out.push({ score: r.score, ...r.document, matchedClause: clause });
      return out;
    })
  );

  const byId = new Map();
  for (const p of [...coursePassages, ...referencePassages, ...clauseSearches.flat()]) {
    if (!byId.has(p.id) || byId.get(p.id).score < p.score) byId.set(p.id, p);
  }
  const passages = [...byId.values()].sort((a, b) => b.score - a.score);

  const contextBlock = passages.map((p) => `[${p.sourceType}: ${p.locator}]\n${p.text}`).join("\n\n---\n\n");

  const messages = [
    { role: "system", content: SYSTEM_INSTRUCTIONS },
    ...turns.slice(-10),
    { role: "user", content: `Retrieved passages:\n\n${contextBlock}\n\n---\n\nQuestion: ${question}` },
  ];

  const completion = await openaiClient.chat.completions.create({
    model: config.openai.chatDeployment,
    messages,
    temperature: 0.4,
    max_tokens: 220,
  });

  const answer = completion.choices[0]?.message?.content || "";
  return {
    answer,
    citations: passages.map((p) => ({ sourceType: p.sourceType, docName: p.docName, locator: p.locator, score: p.score })),
  };
}

module.exports = { askQuestion };
