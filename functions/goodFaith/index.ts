/// <reference lib="es2020" />
// Serverless function to (stub) score a post for good-faith argumentation.
// Replace the stubbed scoring logic with a real LLM API call (OpenAI, Anthropic, etc.)
// expected request body: { postId: string, content: string }

interface ScoreResponse {
  good_faith_score: number; // 0..1
  good_faith_label: string;
  rationale?: string;
}

function heuristicScore(content: string): ScoreResponse {
  const lower = content.toLowerCase();
  let score = 0.5;
  if (/(thank|appreciate)/.test(lower)) score += 0.1;
  if (/(evidence|source|reference)/.test(lower)) score += 0.15;
  if (/(idiot|stupid|hate)/.test(lower)) score -= 0.3;
  if (/(I understand|I see your point|you might be right)/.test(lower)) score += 0.1;
  score = Math.max(0, Math.min(1, score));
  let label = 'neutral';
  if (score >= 0.75) label = 'constructive';
  else if (score >= 0.6) label = 'mostly constructive';
  else if (score <= 0.3) label = 'hostile';
  else if (score <= 0.45) label = 'questionable';
  return { good_faith_score: score, good_faith_label: label, rationale: 'Heuristic placeholder score.' };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const { postId, content } = body as { postId?: string; content?: string };
    if (typeof content !== 'string' || !content.trim()) {
      return new Response(JSON.stringify({ error: 'content required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const scored = heuristicScore(content);
    return new Response(JSON.stringify({ ...scored, postId: postId || null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
