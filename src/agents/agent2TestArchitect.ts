import { callClaude, parseJSON } from '../utils/claude.js';
import { Scenario, LayerPlan } from '../types/types.js';

const SYSTEM_PROMPT = `You are a test architect who understands the test pyramid.

Given a list of test scenarios, assign each one to the correct test layer:
- unit: pure logic, no UI, no network — functions, calculations, validators
- api: HTTP endpoints, request/response contracts, status codes, headers
- component: a single UI component rendered in isolation (React Testing Library style)
- e2e: full user journey through the real browser (Playwright)

Rules:
- Prefer lower layers (unit > api > component > e2e) when possible
- Only assign e2e if the scenario genuinely needs a real browser
- Every scenario must be assigned — no skipping
- Return ONLY a valid JSON array. No explanation. No markdown.

JSON schema:
[
  {
    "scenarioId": "S001",
    "layer": "e2e",
    "reason": "One sentence justification"
  }
]`;
export async function runTestArchitect(scenarios: Scenario[]): Promise<LayerPlan[]> {
  console.log('Agent 2: Assigning test layers...');
  const input = JSON.stringify(scenarios, null, 2);
  const raw = await callClaude(SYSTEM_PROMPT, input);
  const assignments = parseJSON<{ scenarioId: string; layer: LayerPlan['layer']; reason: string }[]>(raw);

  const layerPlan: LayerPlan[] = assignments.map(a => ({
    ...a,
    scenario: scenarios.find(s => s.id === a.scenarioId)!,
  }));

  console.log(`Agent 2: Assigned ${layerPlan.length} scenarios to layers`);
  return layerPlan;
}

// ── Quick test ───────────────────────────────────────────────────────
const isMain = process.argv[1].includes('agent2TestArchitect');
if (isMain) {
  const sampleScenarios: Scenario[] = [
    { id: 'S001', type: 'happy_path', title: 'Successful login', steps: ['Enter email', 'Enter password', 'Click login'], expected: 'User is redirected to dashboard' },
    { id: 'S002', type: 'negative', title: 'Login with wrong password', steps: ['Enter email', 'Enter wrong password', 'Click login'], expected: 'Error message shown' },
    { id: 'S003', type: 'security', title: 'SQL injection in email field', steps: ['Enter SQL in email field', 'Submit form'], expected: 'Input is rejected or sanitised' },
  ];
  runTestArchitect(sampleScenarios)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(console.error);
}