import { callClaude, parseJSON } from '../utils/claude.js';
import { Scenario, LayerPlan } from '../types/types.js';

const SYSTEM_PROMPT = `You are a test architect who deeply understands the test pyramid and cost of test maintenance.

Given a list of test scenarios, assign each one to the correct test layer.

## Layer definitions — be strict about these

UNIT (cheapest, fastest — prefer this when possible):
- Pure business logic with no UI or network dependency
- Input validation rules (email format, password length)
- Price calculations, discount logic
- Data transformation functions
- No browser, no HTTP calls

API (fast, reliable — use for anything involving HTTP):
- Any scenario that tests an endpoint directly
- Request/response contracts and status codes
- Authentication token handling
- Error responses from the server
- Data persistence verification via API response
- Prefer API over E2E when the scenario does not require visual UI verification

COMPONENT (UI in isolation — use sparingly):
- A single UI component rendered without a real backend
- Visual states: loading spinner, error message display, empty state
- Client-side validation feedback (inline error messages)
- Only when the scenario is purely about how a UI element looks/behaves in isolation

E2E (slowest, most expensive — only when absolutely necessary):
- Full user journeys that MUST go through a real browser AND real backend together
- Session persistence across page refreshes
- Cross-page navigation flows
- localStorage/sessionStorage interactions that affect UI
- Scenarios where the integration between frontend and backend is the thing being tested
- MAXIMUM 20% of total scenarios should be E2E

## Decision rules
- If a scenario can be tested at a lower layer — always assign the lower layer
- API over E2E unless the test genuinely requires browser rendering
- Component over E2E unless the test genuinely requires a real backend
- Unit over everything if it is pure logic

## Common mistakes to avoid
- Do NOT assign login flows to E2E if they can be tested via API
- Do NOT assign error message display to E2E if it can be a component test
- Do NOT assign API contract tests to E2E just because they involve the UI

Return ONLY a valid JSON array. No explanation. No markdown.

JSON schema:
[
  {
    "scenarioId": "S001",
    "layer": "e2e",
    "reason": "One sentence justification explaining why a lower layer is not sufficient"
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