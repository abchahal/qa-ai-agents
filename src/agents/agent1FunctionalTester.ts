import { callClaude, parseJSON } from '../utils/claude.js';
import { Scenario } from '../types/types.js';
import fs from 'fs';
import path from 'path';

const SYSTEM_PROMPT = `You are a senior QA engineer specialising in test scenario design.

You will receive a feature context that may include:
- Feature requirements and description
- Business rules and constraints
- API endpoint details
- UI element selectors (data-testid attributes)
- Source code of the feature
- Existing tests for reference

Use ALL of this context to generate the RIGHT NUMBER of test scenarios.

## How to decide the number of scenarios
Generate MORE scenarios when:
- The feature has many distinct business rules (each rule = at least one scenario)
- Multiple API endpoints are involved (each needs happy + negative coverage)
- Security-sensitive flows exist (auth, payments, personal data)
- The UI has many distinct states (loading, error, empty, disabled, success)

Generate FEWER scenarios when:
- The feature is simple with one clear flow
- Business rules are minimal
- Scenarios would be repetitive variations of each other

## Quality gate — before finalising your list, ask yourself:
- Does each scenario test something MEANINGFULLY DIFFERENT from the others?
- Am I padding with minor variations just to increase count?
- Would a senior QA engineer approve each scenario as worth automating?
- Maximum 15 scenarios for most features — only exceed this if genuinely justified

## Minimum coverage rules (non-negotiable)
- At least 1 happy_path scenario
- At least 1 negative scenario  
- At least 1 edge_case scenario
- If security is relevant — at least 1 security scenario
- If business rules exist — 1 per DISTINCT rule only
- If UI states are described — 1 per DISTINCT state only

## Scenario types
- happy_path: normal successful user flows
- negative: invalid inputs, wrong credentials, failures
- security: authentication, authorisation, injection attempts
- edge_case: empty fields, boundary values, max lengths
- ui_state: loading states, disabled buttons, error messages shown/hidden
- business_rule: domain-specific logic and constraints

## Quality over quantity
- Do NOT pad with redundant scenarios to hit a higher number
- Do NOT create multiple happy_path scenarios for the same flow with trivial differences
- Each scenario must test something a separate test case is genuinely needed for
- Use specific values from the context (real field names, real endpoints, real business rules)
- Reference actual data-testid selectors from the input when available
- Keep each scenario concise — steps should be 1 sentence each, expected 1 sentence

Return ONLY a valid JSON array. No explanation. No markdown. No extra text.

JSON schema:
[
  {
    "id": "S001",
    "type": "happy_path",
    "title": "Short descriptive title",
    "steps": ["Step 1 description", "Step 2 description"],
    "expected": "What should happen"
  }
]`;

// ── Load input context from input/ folder ─────────────────────────────
function loadInputContext(): string {
  const inputDir = 'input';
  let context = '';

  const featurePath = path.join(inputDir, 'feature.md');
  if (fs.existsSync(featurePath)) {
    context += `## Feature Requirements\n${fs.readFileSync(featurePath, 'utf8')}\n\n`;
  }

  const sourcePath = path.join(inputDir, 'source.ts');
  if (fs.existsSync(sourcePath)) {
    context += `## Source Code\n\`\`\`ts\n${fs.readFileSync(sourcePath, 'utf8')}\n\`\`\`\n\n`;
  }

  const apiPath = path.join(inputDir, 'api-contract.json');
  if (fs.existsSync(apiPath)) {
    context += `## API Contract\n\`\`\`json\n${fs.readFileSync(apiPath, 'utf8')}\n\`\`\`\n\n`;
  }

  const existingTestsPath = path.join(inputDir, 'referenceTests.ts');
  if (fs.existsSync(existingTestsPath)) {
    context += `## Existing Tests\n\`\`\`ts\n${fs.readFileSync(existingTestsPath, 'utf8')}\n\`\`\`\n\n`;
  }

  return context.trim();
}

// ── Main agent function ───────────────────────────────────────────────
export async function runFunctionalTester(featureDescription: string): Promise<Scenario[]> {
  console.error('\n--- Agent 1: Functional Tester ---');

  // If called from pipeline, featureDescription already has full context.
  // If run standalone, try loading from input/ folder, fall back to the argument.
  const inputContext = process.argv[2] ? '' : loadInputContext();
  const finalInput = inputContext || featureDescription;

  console.error(`Input: ${finalInput.length > 80
    ? finalInput.slice(0, 80).replace(/\n/g, ' ') + '...'
    : finalInput
  }`);

  const raw = await callClaude(SYSTEM_PROMPT, finalInput);
  const scenarios = parseJSON<Scenario[]>(raw);

  console.error(`✓ Generated ${scenarios.length} scenarios:`);
  scenarios.forEach((s: Scenario) => console.error(`  [${s.type}] ${s.title}`));

  return scenarios;
}

// ── Standalone test: run this file directly ───────────────────────────
// npx ts-node src/agents/agent1FunctionalTester.ts
// npx ts-node src/agents/agent1FunctionalTester.ts "your feature here"
const isMain = process.argv[1]?.includes('agent1FunctionalTester');
if (isMain) {
  const cliFeature: string = process.argv[2] ?? 'User login with email and password, with a remember me checkbox';

  runFunctionalTester(cliFeature)
    .then((result: Scenario[]) => {
      console.error('\n--- Full Output ---');
      console.error(JSON.stringify(result, null, 2));
      console.error(`\nTotal scenarios: ${result.length}`);
    })
    .catch((err: Error) => {
      console.error('Agent 1 failed:', err.message);
      process.exit(1);
    });
}