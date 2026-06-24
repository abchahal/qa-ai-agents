import { callClaude } from "../utils/claude.js";
import { LayerPlan, TestResult } from "../types/types.js";
import fs from "fs";
import path from "path";

// ── System prompt: Page Object ────────────────────────────────────────
const PAGE_OBJECT_PROMPT = `You are a Playwright TypeScript expert who writes Page Object Model classes.

Given a test scenario and its context, generate a TypeScript Page Object class.

Rules:
- Class name must match the feature (e.g. LoginPage, CartPage, CheckoutPage)
- Constructor accepts: constructor(private page: Page) {}
- Group all selectors as private readonly properties at the top using getByTestId()
- Each selector must map to a data-testid value from the scenario context
- Write one public async method per user action (e.g. addToCart(), applyDiscount())
- Methods should return void or a meaningful value (e.g. getCartCount(): Promise<number>)
- Do NOT write any test assertions inside the Page Object — only actions and getters
- Import only: import { Page } from '@playwright/test';
- Return ONLY the raw TypeScript code. No explanation. No markdown fences.

Example structure:
import { Page } from '@playwright/test';

export class CartPage {
  private readonly addToCartBtn = this.page.getByTestId('add-to-cart-btn');
  private readonly cartCountBadge = this.page.getByTestId('cart-count-badge');

  constructor(private page: Page) {}

  async addToCart(): Promise<void> {
    await this.addToCartBtn.click();
  }

  async getCartCount(): Promise<number> {
    const text = await this.cartCountBadge.textContent();
    return parseInt(text ?? '0', 10);
  }
}`;

// ── System prompt: Spec file ──────────────────────────────────────────
const SPEC_FILE_PROMPT = `You are a Playwright TypeScript test engineer who writes clean spec files using the Page Object Model.

Given a test scenario and its Page Object class, write a Playwright spec file.

Rules:
- Import { test, expect } from '@playwright/test'
- Import the Page Object class from '../pages/PageName'
- Instantiate the Page Object inside each test: const cartPage = new CartPage(page)
- Use ONLY the Page Object methods — never call page.getByTestId() directly in the spec
- Each test must match exactly one scenario step sequence
- Assertions use expect() — assert the outcome, not just that actions ran
- Use descriptive test names that match the scenario title exactly
- Always navigate to the correct URL at the start: await page.goto('http://localhost:3000/...')
- Return ONLY the raw TypeScript code. No explanation. No markdown fences.

Example structure:
import { test, expect } from '@playwright/test';
import { CartPage } from '../pages/CartPage';

test('Add item to cart successfully', async ({ page }) => {
  const cartPage = new CartPage(page);
  await page.goto('http://localhost:3000/products/prod_001');
  await cartPage.addToCart();
  expect(await cartPage.getCartCount()).toBe(1);
});`;

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
