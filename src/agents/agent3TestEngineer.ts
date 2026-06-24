import { callClaude } from "../utils/claude.js";
import { LayerPlan, TestResult } from "../types/types.js";
import fs from "fs";
import path from "path";

// ── System prompt: Page Object ────────────────────────────────────────
const PAGE_OBJECT_PROMPT = `You are a Playwright TypeScript expert who writes Page Object Model classes.

Given a test scenario and its context, generate a TypeScript Page Object class.

## Strict rules for Page Objects

SELECTORS — use this priority order:
1. page.getByTestId('selector') — always first choice
2. page.getByRole('button', { name: 'Login' }) — second choice  
3. page.getByLabel('Email') — for form inputs
4. page.getByText('exact text') — for text content
5. NEVER use CSS class selectors, XPath, or nth-child

METHODS — each method must:
- Be async and return a meaningful value when queried (not just void)
- Perform ONE logical action only
- Never contain assertions — assertions belong in spec files only
- Return typed values for getter methods (Promise<string>, Promise<number>, Promise<boolean>)

GETTERS — always expose raw locator text for assertions:
- getText methods: return await this.element.textContent() ?? ''
- getCount methods: return parseInt(await this.badge.textContent() ?? '0', 10)
- isVisible methods: return await this.element.isVisible()
- Expose these so spec files can assert directly on the values

NEVER hide assertion data inside the page object.
The spec file must be able to call expect() on values returned from your methods.

Import only: import { Page } from '@playwright/test';
Return ONLY raw TypeScript code. No explanation. No markdown fences.

Example of CORRECT getter that allows direct assertion:
async getCartCount(): Promise<number> {
  return parseInt(await this.cartCountBadge.textContent() ?? '0', 10);
}
// Spec can then do: expect(await cartPage.getCartCount()).toBe(2)

Example of CORRECT text getter:
async getErrorMessage(): Promise<string> {
  return await this.errorMsg.textContent() ?? '';
}
// Spec can then do: expect(await cartPage.getErrorMessage()).toContain('Invalid')`;

//System prompt: Spec file generation ─────────────────────────────────
const SPEC_FILE_PROMPT = `You are a Playwright TypeScript test engineer who writes clean, maintainable spec files.

Given a test scenario and its Page Object class, write a complete Playwright spec file.

## Critical rules — violations will cause test failures

IMPORTS:
- import { test, expect } from '@playwright/test'
- import the Page Object from '../pages/PageClassName'

SETUP:
- Use baseURL from config — NEVER hardcode localhost URLs
- Use await page.goto('/relative-path') with relative paths only
- For tests requiring authentication, use storageState fixtures — never hardcode credentials
- Declare credentials as constants from environment: const email = process.env.TEST_EMAIL ?? 'test@example.com'

ASSERTIONS — this is the most important rule:
- ALWAYS assert on actual values returned from page object methods
- ALWAYS use expect() on real DOM values — never trust that a method ran without asserting its result
- Correct: expect(await cartPage.getCartCount()).toBe(1)
- Correct: expect(await cartPage.getErrorMessage()).toContain('Invalid discount')
- Correct: expect(await cartPage.isCheckoutButtonVisible()).toBe(false)
- Wrong: await cartPage.addToCart() with no assertion after
- Wrong: calling a method and assuming it worked without checking

DIRECT LOCATOR ASSERTIONS when returning raw values:
- For critical UI elements, add direct assertions alongside page object calls:
  expect(page.getByTestId('cart-count-badge')).toHaveText('1')
- This makes it explicit what DOM element is being validated

TEST ISOLATION:
- Each test must be completely independent
- Set up all preconditions explicitly inside the test
- Never rely on state from a previous test
- If a user needs items in their cart — add them in the test setup, not as a precondition assumption

STRUCTURE per test:
1. Navigate to the correct page
2. Set up any required preconditions explicitly
3. Perform the action being tested
4. Assert the outcome with expect()
5. Assert on actual DOM values, not just method return values

Return ONLY raw TypeScript code. No explanation. No markdown fences.

## CRITICAL — Direct DOM assertions rule

For visibility checks — NEVER do this:
expect(await cartPage.isCartItemVisible()).toBe(true)

ALWAYS do this instead:
await expect(page.getByTestId('cart-item-prod_001')).toBeVisible()

For text/count checks — NEVER do this:
expect(await cartPage.getCartCount()).toBe(2)

ALWAYS do this instead:
await expect(page.getByTestId('cart-count-badge')).toHaveText('2')

For input value checks — NEVER do this:
expect(await cartPage.getQuantityValue()).toBe('3')

ALWAYS do this instead:
await expect(page.getByTestId('quantity-input-prod_001')).toHaveValue('3')

## The rule in plain English
Use page object methods ONLY for ACTIONS (clicking, filling, navigating).
Use Playwright locators DIRECTLY for all ASSERTIONS.
Never call a page object method inside an expect() call.`;

// ── Helper: build a safe filename ─────────────────────────────────────
function safeName(title: string): string {
  return title
    .replace(/[^a-z0-9]/gi, "_")
    .replace(/_+/g, "_")
    .toLowerCase();
}

// ── Helper: extract Page Object class name from generated code ────────
function extractClassName(code: string): string {
  const match = code.match(/export class (\w+)/);
  return match ? match[1] : "PageObject";
}

// ── Main agent function ───────────────────────────────────────────────
export async function runTestEngineer(
  layerPlan: LayerPlan[],
): Promise<TestResult[]> {
  console.log("\n--- Agent 3: Test Engineer (POM mode) ---");

  const e2eScenarios = layerPlan.filter((lp) => lp.layer === "e2e");
  const otherCount = layerPlan.length - e2eScenarios.length;

  console.log(`Writing POM tests for ${e2eScenarios.length} e2e scenarios`);
  if (otherCount > 0) {
    console.log(
      `Skipping ${otherCount} non-e2e scenarios (unit/api/component)`,
    );
  }

  if (e2eScenarios.length === 0) {
    console.log("No e2e scenarios to generate tests for.");
    return [];
  }

  // Create output folder structure
  const pagesDir = path.join("output", "pages");
  const testsDir = path.join("output", "tests");
  if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
  if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true });

  const results: TestResult[] = [];

  for (const plan of e2eScenarios) {
    if (!plan.scenario) {
      console.warn(
        `  ⚠ Skipping ${plan.scenarioId} — no scenario data attached`,
      );
      continue;
    }

    console.log(`\n  [${plan.scenarioId}] ${plan.scenario.title}`);

    const scenarioContext = JSON.stringify(plan, null, 2);

    // ── Step 1: Generate the Page Object ───────────────────────────
    console.log(`  ↳ Generating Page Object...`);
    const pageObjectCode = await callClaude(
      PAGE_OBJECT_PROMPT,
      scenarioContext,
    );

    const cleanPageObject = pageObjectCode
      .replace(/^```[a-z]*\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();

    const className = extractClassName(cleanPageObject);
    const pageFileName = `${className}.ts`;
    const pageFilePath = path.join(pagesDir, pageFileName);

    // Only write the page object if it doesn't already exist
    // (multiple scenarios may share the same page)
    fs.writeFileSync(pageFilePath, cleanPageObject, "utf8");
    console.log(`  ↳ Page Object saved: output/pages/${pageFileName}`);

    // ── Step 2: Generate the spec file using the Page Object ────────
    console.log(`  ↳ Generating spec file...`);
    const specPromptInput = `
Scenario:
${scenarioContext}

Page Object class (already written — import and use this):
\`\`\`typescript
${cleanPageObject}
\`\`\`
`;
    const specCode = await callClaude(SPEC_FILE_PROMPT, specPromptInput);

    const cleanSpec = specCode
      .replace(/^```[a-z]*\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();

    const specFileName = `${plan.scenarioId}_${safeName(plan.scenario.title)}.spec.ts`;
    const specFilePath = path.join(testsDir, specFileName);
    fs.writeFileSync(specFilePath, cleanSpec, "utf8");
    console.log(`  ↳ Spec saved: output/tests/${specFileName}`);

    results.push({
      scenarioId: plan.scenarioId,
      title: plan.scenario.title,
      layer: plan.layer,
      file: specFileName,
      filePath: specFilePath,
      pageObjectFile: pageFileName,
      pageObjectPath: pageFilePath,
      status: "generated",
      code: cleanSpec,
      pageObjectCode: cleanPageObject,
    });
  }

  console.log(`\n✓ Agent 3 complete`);
  console.log(`  Page Objects → output/pages/`);
  console.log(`  Spec files   → output/tests/`);
  console.log(
    `  Total files  → ${results.length * 2} (${results.length} pages + ${results.length} specs)`,
  );

  return results;
}
