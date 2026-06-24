import { callClaude, parseJSON } from '../utils/claude.js';
import { TestResult, ReviewReport } from '../types/types.js';

const SYSTEM_PROMPT = `You are a senior Playwright test code reviewer.
Audit the provided Playwright test files against these criteria:

1. SELECTOR QUALITY
   - data-testid selectors = best (score high)
   - role selectors = good
   - CSS class selectors = mediocre (flag it)
   - XPath or nth-child selectors = bad (flag as high severity)

2. ASSERTION QUALITY
   - Must assert the actual outcome, not just that a click happened
   - expect(page).toHaveURL() for navigation
   - expect(locator).toBeVisible() for UI elements
   - expect(locator).toHaveText() for content
   - Flagging tests that only click without asserting anything

3. TEST ISOLATION
   - Each test should work independently
   - No shared state or order dependency

4. PLAYWRIGHT BEST PRACTICES
   - Use await on all Playwright actions
   - Use getByRole/getByTestId not $ or querySelector
   - Avoid hardcoded waits (page.waitForTimeout)

5. COVERAGE
   - Does the test actually cover what the scenario described?

Return ONLY valid JSON. No explanation. No markdown.

JSON schema:
{
  "overallScore": 85,
  "issueCount": { "high": 1, "medium": 2, "low": 1 },
  "issues": [
    {
      "file": "filename.spec.js",
      "line": "approximate line or 'general'",
      "issue": "Clear description of the problem",
      "severity": "high"
    }
  ],
  "suggestions": [
    "Actionable improvement suggestion"
  ],
  "summary": "2-3 sentence overall assessment"
}`;

export async function runCodeReviewer(testResults: TestResult[]): Promise<ReviewReport> {
  console.log('Agent 4: Reviewing test quality...');
  const input = testResults.map(r => `// FILE: ${r.file}\n${r.code}`).join('\n\n---\n\n');
  const raw = await callClaude(SYSTEM_PROMPT, input);
  const report = parseJSON<ReviewReport>(raw);
  console.log(`Agent 4: Review complete. Score: ${report.overallScore}/100`);
  return report;
}

// ── Quick test ───────────────────────────────────────────────────────
const isMain = process.argv[1].includes('agent4CodeReviewer');
if (isMain) {
  const sampleResults = [
    {
      file: 'S001_successful_login.spec.js',
      status: 'pass' as const,
      passCount: 1,
      failCount: 0,
      code: `import { test, expect } from '@playwright/test';

test('Successful login', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.getByTestId('email-input').fill('user@example.com');
  await page.getByTestId('password-input').fill('password123');
  await page.getByTestId('login-btn').click();
  await expect(page).toHaveURL('http://localhost:3000/dashboard');
  await expect(page.getByTestId('welcome-message')).toBeVisible();
});`,
    },
  ];
  runCodeReviewer(sampleResults)
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(console.error);
}