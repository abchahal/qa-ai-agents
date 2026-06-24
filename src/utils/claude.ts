import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

const USE_OLLAMA = process.env.USE_OLLAMA === 'true';

let ollamaClient: OpenAI | null = null;
let anthropicClient: Anthropic | null = null;
let currentModel: string;

if (USE_OLLAMA) {
  ollamaClient = new OpenAI({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
  });
  currentModel = process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
  console.log(`Using Ollama local model: ${currentModel}`);
} else {
  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  currentModel = 'claude-haiku-4-5-20251001'; //other model - use claude-sonnet-4-6, for more advanced reasoning 
  console.log(`Using Claude API: ${currentModel}`);
}

export async function callClaude(systemPrompt: string, userMessage: string): Promise<string> {
  if (USE_OLLAMA) {
    const response = await ollamaClient!.chat.completions.create({
      model: currentModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.1,
    });
    return response.choices[0].message.content ?? '';
  } else {
    const response = await anthropicClient!.messages.create({
      model: currentModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = response.content[0];
    if (block.type !== 'text') throw new Error('Unexpected non-text response from Anthropic');
    return block.text;
  }
}

export function parseJSON<T = unknown>(raw: string): T {
  const fenced = raw.match(/```json\n?([\s\S]*?)\n?```/);
  if (fenced) return JSON.parse(fenced[1]);

  const bare = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (bare) return JSON.parse(bare[1]);

  throw new Error(`No valid JSON found in response.\nRaw output: ${raw.slice(0, 300)}`);
}
