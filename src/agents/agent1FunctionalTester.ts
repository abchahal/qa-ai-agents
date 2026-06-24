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

Use ALL of this context to generate the RIGHT NUMBER of test scenarios — not a fixed count.

## How to decide the number of scenarios

Generate MORE scenarios when:
- The feature has many business rules (each rule = at least one scenario)
- Multiple API endpoints are involved (each endpoint needs happy + negative coverage)
- There are security-sensitive flows (auth, payments, personal data)
- The UI has many states (loading, error, empty, disabled, success)
- Edge cases are explicitly mentioned in the requirements

Generate FEWER scenarios when:
- The feature is simple with one clear flow
- Business rules are minimal
- Few UI elements are involved
- The feature is a minor variation of something already tested

## Minimum coverage rules (non-negotiable)
- At least 1 happy_path scenario
- At least 1 negative scenario
- At least 1 edge_case scenario
- If security is relevant — at least 1 security scenario
- If business rules exist — at least 1 per distinct rule
- If UI states are described — at least 1 ui_state scenario

## Scenario types to use
- happy_path: normal successful user flows
- negative: invalid inputs, wrong credentials, failures
- security: authentication, authorisation, injection attempts
- edge_case: empty fields, boundary values, max lengths
- ui_state: loading states, disabled buttons, error messages shown/hidden
- business_rule: domain-specific logic and constraints

## Quality over quantity
- Do NOT pad with redundant scenarios just to hit a number
- Do NOT merge two distinct behaviours into one scenario to reduce count
- Each scenario must test something meaningfully different
- Use specific values from the context (real field names, real endpoints, real business rules)
- Reference actual data-testid selectors from the input when available

Return ONLY a valid JSON array. No explanation. No markdown. No extra text.

- Keep each scenario concise — steps should be 1 sentence each, expected should be 1 sentence
- Do not over-explain — brevity is important for JSON size

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
  console.log('\n--- Agent 1: Functional Tester ---');

  // If called from pipeline, featureDescription already has full context.
  // If run standalone, try loading from input/ folder, fall back to the argument.
  const inputContext = process.argv[2] ? '' : loadInputContext();
  const finalInput = inputContext || featureDescription;

  console.log(`Input: ${finalInput.length > 80
    ? finalInput.slice(0, 80).replace(/\n/g, ' ') + '...'
    : finalInput
  }`);

  const raw = await callClaude(SYSTEM_PROMPT, finalInput);
  const scenarios = parseJSON<Scenario[]>(raw);

  console.log(`✓ Generated ${scenarios.length} scenarios:`);
  scenarios.forEach((s: Scenario) => console.log(`  [${s.type}] ${s.title}`));

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
      console.log('\n--- Full Output ---');
      console.log(JSON.stringify(result, null, 2));
      console.log(`\nTotal scenarios: ${result.length}`);
    })
    .catch((err: Error) => {
      console.error('Agent 1 failed:', err.message);
      process.exit(1);
    });
}