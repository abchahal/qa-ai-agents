import { callClaude, parseJSON } from '../utils/claude.js';
import { TestResult, ReviewReport } from '../types/types.js';

const SYSTEM_PROMPT = `You are a strict Playwright test code reviewer with high standards.

Audit the provided Playwright test files against these criteria:

## Scoring rubric — start at 100, deduct points

HIGH severity issues (deduct 15 points each):
- Missing assertions after actions (action with no expect())
- Assertions on abstracted values that hide DOM state
- No direct locator assertions on critical UI elements
- Test passes without actually verifying the expected outcome

MEDIUM severity issues (deduct 8 points each):
- Hardcoded credentials in test files
- Hardcoded localhost URLs instead of baseURL
- Test depends on external preconditions not set up in the test
- Authentication not using storageState or fixtures
- Test isolation concerns (shared state between tests)

LOW severity issues (deduct 3 points each):
- Minor naming inconsistencies
- Missing comments on complex setup steps
- Could use a more specific selector

## What you are checking

1. ASSERTION QUALITY (most important)
   - Every action must have a corresponding assertion
   - Assertions must validate actual DOM state
   - expect() calls must reference real locator values
   - Page object method calls must be followed by assertions on their return values

2. SELECTOR QUALITY
   - getByTestId = excellent
   - getByRole / getByLabel = good
   - CSS class selectors = flag as medium
   - XPath or nth-child = flag as high

3. TEST ISOLATION
   - No hardcoded credentials
   - No assumptions about pre-existing state
   - Each test sets up its own preconditions

4. PLAYWRIGHT BEST PRACTICES
   - Relative URLs using baseURL
   - No hardcoded waits (page.waitForTimeout)
   - Proper async/await usage
   - storageState for authenticated tests

5. COVERAGE
   - Does the test actually cover what the scenario described?
   - Are the assertions meaningful or just checking visibility?

Return ONLY valid JSON. No explanation. No markdown.

JSON schema:
{
  "overallScore": 72,
  "issueCount": { "high": 2, "medium": 3, "low": 2 },
  "issues": [
    {
      "file": "filename.spec.ts",
      "line": "approximate line or general",
      "issue": "Specific description of the problem",
      "severity": "high",
      "fix": "Exact suggestion for how to fix this specific issue"
    }
  ],
  "suggestions": [
    "Actionable improvement with a concrete code example"
  ],
  "summary": "2-3 sentence honest assessment of overall test quality"
}`;

export async function runCodeReviewer(testResults: TestResult[]): Promise<ReviewReport> {
  console.error('Agent 4: Reviewing test quality...');
  const input = testResults.map(r => `// FILE: ${r.file}\n${r.code}`).join('\n\n---\n\n');
  const raw = await callClaude(SYSTEM_PROMPT, input);
  const report = parseJSON<ReviewReport>(raw);
  console.error(`Agent 4: Review complete. Score: ${report.overallScore}/100`);
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
    .then(result => console.error(JSON.stringify(result, null, 2)))
    .catch(console.error);
}