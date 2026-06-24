import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const USE_OLLAMA = process.env.USE_OLLAMA === 'true';

// ── Clients ───────────────────────────────────────────────────────────
const anthropic = USE_OLLAMA
  ? null
  : new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ollama = USE_OLLAMA
  ? new OpenAI({ baseURL: 'http://localhost:11434/v1', apiKey: 'ollama' })
  : null;

const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';

// ── Model tiers ───────────────────────────────────────────────────────
export const MODEL = {
  FAST: 'claude-haiku-4-5-20251001',   // $1/$5 per MTok  — classification, JSON
  SMART: 'claude-sonnet-4-6',          // $3/$15 per MTok — code generation
} as const;

export type ModelTier = typeof MODEL[keyof typeof MODEL];

console.log(`Using ${USE_OLLAMA ? `Ollama: ${OLLAMA_MODEL}` : 'Claude API'}`);

// ── Main call function ────────────────────────────────────────────────
export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  model: ModelTier = MODEL.FAST
): Promise<string> {
  if (USE_OLLAMA) {
    const response = await ollama!.chat.completions.create({
      model: OLLAMA_MODEL,
      temperature: 0.1,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });
    return response.choices[0].message.content ?? '';
  } else {
    console.log(`  → Model: ${model === MODEL.FAST ? 'Haiku 4.5' : 'Sonnet 4.6'}`);
    const response = await anthropic!.messages.create({
      model,
      max_tokens: 8192,               // ← increased from 4096
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected response type from Claude API');
    return block.text;
  }
}

// ── JSON parser with fallback recovery ───────────────────────────────
export function parseJSON<T>(raw: string): T {

  // Attempt 1 — clean ```json ... ``` fenced block
  const fenced = raw.match(/```json\n?([\s\S]*?)\n?```/);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]) as T;
    } catch {
      console.warn('  ⚠ Fenced JSON parse failed — trying next method');
    }
  }

  // Attempt 2 — bare JSON array or object
  const bare = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (bare) {
    try {
      return JSON.parse(bare[1]) as T;
    } catch {
      console.warn('  ⚠ Bare JSON parse failed — trying recovery');
    }
  }

  // Attempt 3 — recover truncated JSON array
  // Finds the last complete object and closes the array
  const arrayStart = raw.indexOf('[');
  if (arrayStart !== -1) {
    const truncated = raw.slice(arrayStart);
    const lastComplete = truncated.lastIndexOf('},');
    if (lastComplete !== -1) {
      const recovered = truncated.slice(0, lastComplete + 1) + ']';
      try {
        const result = JSON.parse(recovered) as T;
        console.warn('  ⚠ JSON was truncated — recovered partial response');
        return result;
      } catch {
        console.warn('  ⚠ Recovery attempt failed — trying object fallback');
      }
    }
  }

  // Attempt 4 — recover truncated JSON object
  const objectStart = raw.indexOf('{');
  if (objectStart !== -1) {
    const truncated = raw.slice(objectStart);
    const lastComplete = truncated.lastIndexOf('",');
    if (lastComplete !== -1) {
      const recovered = truncated.slice(0, lastComplete + 1) + '"}';
      try {
        const result = JSON.parse(recovered) as T;
        console.warn('  ⚠ JSON object was truncated — recovered partial response');
        return result;
      } catch {
        console.warn('  ⚠ Object recovery failed');
      }
    }
  }

  // All attempts failed — throw with useful debug info
  throw new Error(
    `Failed to parse JSON after 4 attempts.\n` +
    `Raw response length: ${raw.length} chars\n` +
    `First 300 chars: ${raw.slice(0, 300)}\n` +
    `Last 300 chars: ${raw.slice(-300)}`
  );
}