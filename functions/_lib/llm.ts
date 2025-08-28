/// <reference lib="es2020" />
// LLM provider abstraction for good-faith scoring.
// Falls back to throwing so caller can decide heuristic fallback.

interface EnvAny { [k: string]: any }
const envAny: EnvAny = (globalThis as any).process?.env || {};

export interface GoodFaithScoreResult {
  score: number;            // 0..1
  label: string;            // categorical label
  rationale?: string;       // brief explanation
  flags?: string[];         // optional issue flags
  provider: string;         // 'openai'
}

const OPENAI_API_KEY = envAny.OPENAI_API_KEY || envAny.OPEN_API_KEY; // support both naming styles
const GOOD_FAITH_MODEL = envAny.GOOD_FAITH_MODEL || 'gpt-4o-mini';
const OPENAI_TIMEOUT_MS = Number(envAny.OPENAI_TIMEOUT_MS || 12000);

// Basic deterministic label mapping fallback if model omits label
function mapLabel(score: number): string {
  if (score >= 0.80) return 'constructive';
  if (score >= 0.65) return 'mostly constructive';
  if (score >= 0.50) return 'mixed';
  if (score >= 0.35) return 'questionable';
  return 'hostile';
}

export async function getGoodFaithScoreLLM(content: string): Promise<GoodFaithScoreResult> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY missing');
  const truncated = content.slice(0, 4000);
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const body = {
      model: GOOD_FAITH_MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are an impartial assistant that evaluates whether a discussion message is written in good faith. Return ONLY valid JSON with fields: score (0..1), label (string), rationale (short constructive feedback), flags (array of short machine-friendly slugs identifying issues like ad_hominem, sarcasm, hostility, unsupported_claim). Keep rationale <= 240 chars. If text is empty set score=0 and label="hostile".' },
        { role: 'user', content: truncated }
      ],
      response_format: { type: 'json_object' }
    };
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
    const json = await resp.json();
    const raw = json?.choices?.[0]?.message?.content;
    if (!raw) throw new Error('Empty LLM content');
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { throw new Error('Invalid JSON from model'); }
    const scoreNum = Number(parsed.score);
    if (!(scoreNum >= 0 && scoreNum <= 1)) throw new Error('Score out of range');
    const label = typeof parsed.label === 'string' && parsed.label.trim() ? parsed.label.trim().toLowerCase() : mapLabel(scoreNum);
    const rationale = typeof parsed.rationale === 'string' ? parsed.rationale.trim().slice(0, 500) : undefined;
    const flags = Array.isArray(parsed.flags) ? parsed.flags.filter((f: any) => typeof f === 'string').slice(0, 12) : undefined;
    return { score: scoreNum, label, rationale, flags, provider: 'openai' };
  } finally {
    clearTimeout(to);
  }
}
