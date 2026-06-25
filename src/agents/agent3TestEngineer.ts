import { callClaude, MODEL } from "../utils/claude.js";
import { LayerPlan, TestResult } from "../types/types.js";
import fs from "fs";
import path from "path";

// ── System prompt: Page Object ────────────────────────────────────────
const PAGE_OBJECT_PROMPT = `You are a Playwright TypeScript expert who writes Page Object Model classes.

## STRICT RULES

SELECTORS — priority order:
1. this.page.getByTestId('selector') — always first choice
2. this.page.getByRole('button', { name: 'text' }) — second choice
3. this.page.getByLabel('label text') — for form inputs
4. NEVER use CSS selectors, XPath, or nth-child

METHODS — three types only:

TYPE 1 — ACTION methods (void return):
async addToCart(): Promise<void> {
  await this.addToCartBtn.click();
}
async fillDiscountCode(code: string): Promise<void> {
  await this.discountInput.fill(code);
  await this.applyDiscountBtn.click();
}

TYPE 2 — NAVIGATION methods (void return):
async goToCart(): Promise<void> {
  await this.page.goto('/cart');
}

TYPE 3 — UTILITY methods (for shared logic only):
// If a pure function is needed by multiple spec files — put it in the Page Object:
validateLoginForm(email: string, password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!email || email.trim() === '') errors.push('Email is required');
  if (!password || password.trim() === '') errors.push('Password is required');
  return { valid: errors.length === 0, errors };
}
// NEVER copy the same function into two spec files
// NEVER define helper functions inside a spec file
// If a function appears in more than one spec — it belongs in the Page Object or a shared utils file

CLASS NAMING — name after the PAGE or COMPONENT, not the scenario:
- CartPage      — for anything on the cart page
- CheckoutPage  — for anything on the checkout page
- ProductPage   — for anything on the product detail page
- LoginPage     — for anything on the login page
- SearchPage    — for anything on the search page
- NEVER name after a scenario: AddToCartPage, CartPersistsPage — WRONG
- Multiple scenarios will import and reuse the same Page Object

## FORBIDDEN in Page Objects — never create these, no exceptions:
- Boolean return methods: isVisible(), isEnabled(), hasError(), isLoaded()
- Text getter methods: getText(), getMessage(), getErrorText()
- Number getter methods: getCount(), getQuantity(), getTotal()
- Locator getter methods: getCartCountBadge(), getCheckoutButton(), getErrorMessage()
- Verification methods: verifyCart(), assertTotal(), checkVisible(), validateItems(), confirmMerge()
- Any method that starts with: verify*, assert*, check*, validate*, confirm*, get*, is*, has*
- Any method that returns a value or Locator for assertion purposes
- Any async method that awaits a DOM value and returns it

WRONG — this leaks a locator out of the POM and hides the testId from the spec:
async getCartCountBadge(): Promise<Locator> {
  return this.page.getByTestId('cart-count-badge');
}
// In spec: const badge = await cartPage.getCartCountBadge(); await expect(badge).toHaveText('1');
// The spec now doesn't know what 'cart-count-badge' is — breaks readability and debuggability.

RIGHT — assert directly in the spec using the testId:
// In spec: await expect(page.getByTestId('cart-count-badge')).toHaveText('1');

Page objects do ACTIONS only:
- Clicking buttons
- Filling inputs
- Navigating to pages
- Submitting forms

Assertions belong in spec files only — directly on DOM locators using page.getByTestId()

## WHY — spec files must assert directly on DOM locators, not on values
returned from page object methods. If the page object returns a value,
the spec file loses the ability to assert on the actual DOM state.

CONSTRUCTOR — always exactly this:
constructor(private page: Page) {}

IMPORTS — always exactly this:
import { Page } from '@playwright/test';

Return ONLY raw TypeScript code. No explanation. No markdown fences.`;

//System prompt: Spec file generation ─────────────────────────────────
const SPEC_FILE_PROMPT = `You are a Playwright TypeScript test engineer who writes clean, strict spec files.

Given a test scenario and its Page Object class, write a complete Playwright spec file.

## HARD RULES — read these first, they override everything else

## RULE 1 — One layer per file, strictly enforced

Each spec file belongs to exactly one layer: unit | api | component.
Never mix layers in the same file.

- unit      → no fixtures. Pure function calls + expect() only. No page, no request, no mount.
- api       → { request } fixture only. HTTP calls + status/body assertions only. No page, no mount.
            → NEVER import or instantiate a Page Object class in an API test. POM = browser only.
            → NEVER use page.goto(), page.waitForResponse(), or any browser interaction.
            → Assert only on: res.status(), res.json(), res.headers(). Nothing else.
- component → { mount, page } fixtures only. Mounted component + DOM assertions only. No request.

If the scenario needs a browser AND a real backend together — it is E2E.
Do not write it. Return an empty file with a comment: // E2E — handled at SIT/UAT level.

Layer determines imports, fixtures, and assertion style.
Wrong layer = wrong test. Recheck scenario metadata before writing a single line.

## LAYER SELF-CHECK — run this before writing any code

1. What is the layer in the scenario metadata? (unit / api / component)
2. api layer      → Does my test body contain any POM class or page.goto()? → DELETE IT.
3. component layer → Am I about to read the POM class? → STOP. Ignore the POM entirely.
4. component layer → Is my reason for skipping "component source not provided"? → WRONG. Derive import from pageName and write the test.
5. component layer → Is my reason for skipping "POM uses page.goto()"? → WRONG. POM is irrelevant for component tests.
6. component layer → Does my test call mount()? → If not, rewrite it until it does.
7. E2E decision   → Can I state a reason OTHER than POM/import/source not available? → If not — it is NOT E2E. Write the component test.
8. Any layer      → Does every action have a direct assertion immediately after it? → If not, add one.


## RULE 2 — Test title and test body must describe the same thing

The title is a contract. The body must fulfil it exactly.

- Title mentions a UI element   → body must interact with that element via page or mount
- Title mentions an API contract → body must use request fixture only, no page
- Title mentions a user action  → body must perform that action through the UI, not via API

If you cannot make the body match the title — rewrite the title to match what the body actually tests.
Never write a test titled "displays empty cart message" whose body never touches the DOM.
Never write a test titled "update quantity via input field" whose body only calls request.patch().

## RULE 2A — Client-side validation must never depend on an API mock to pass

Client-side validation fires BEFORE any network request is made.
If you are testing email format, password length, empty fields, or input constraints —
the API should NEVER be called. Do not mock it. Do not route it.

WRONG — mocking API to test client-side validation:
await page.route('/api/auth/login', route =>
  route.fulfill({ status: 400, body: JSON.stringify({ error: 'Invalid email' }) })
);
const component = await mount(<LoginPage />);
await component.getByTestId('email-input').fill('invalidemail');
await component.getByTestId('login-btn').click();
await expect(component.getByTestId('email-error')).toBeVisible();
// WRONG — the error could be coming from the mocked API, not client-side validation

CORRECT — test client-side validation without any API mock:
const component = await mount(<LoginPage />);
await component.getByTestId('email-input').fill('invalidemail'); // no @ symbol
await component.getByTestId('login-btn').click();
await expect(component.getByTestId('email-error')).toBeVisible();
await expect(component.getByTestId('email-error')).toContainText('valid email');
// No route mock — if the error appears, it came from client-side validation only

// OPTIONAL — also assert the API was NOT called:
let apiCalled = false;
await page.route('/api/auth/login', route => {
  apiCalled = true;
  route.continue();
});
await component.getByTestId('login-btn').click();
expect(apiCalled).toBe(false); // client-side validation blocked the request

## RULE 3 — Assert directly on DOM locators, never on abstracted values

Every test that has { page } or { mount } in its fixture MUST end with a DOM assertion.
If your test has no await expect(page.getByTestId(...)) — it is incomplete. Add one.

Never:
- Assert on a variable from a POM method: const count = await cartPage.getCount()
- Assert on an API response inside a UI test: expect(body.items.length).toBe(1)
- Use a wait helper as your final line: await cartPage.waitForCartBadgeToUpdate()
- Use page.reload() to verify reactivity — it proves nothing about live UI updates
- Use page.waitForResponse() as a substitute for a locator assertion:
  WRONG: await page.waitForResponse('/api/cart');  // proves network fired, not DOM updated
  RIGHT: await expect(page.getByTestId('cart-count-badge')).toHaveText('1');  // proves DOM updated
- Assert a mock fulfilled correctly without also asserting the DOM reacted to it:
  await page.route('/api/cart', route => route.fulfill({ status: 200, body: '{}' }));
  // WRONG if you stop here — the mock fired but did the UI actually update?
  await expect(page.getByTestId('cart-count-badge')).toHaveText('1'); // THIS is required

Always — one assertion per action, DOM only:
await cartPage.addToCart('prod_001');
await expect(page.getByTestId('cart-count-badge')).toHaveText('1');  // direct DOM — required
await expect(page.getByTestId('subtotal')).toHaveText('$25.98');     // downstream — required

await cartPage.removeFromCart('prod_001');
await expect(page.getByTestId('cart-item-prod_001')).not.toBeVisible(); // DOM — required

Assertion values must exactly match what the test actions produced:
- Added same product twice → assert '2' not '1'
- Price rendered as '$25.98' → assert '$25.98' not '2598' not 25.98
- Format unknown → use regex: /\$[\d,]+\.\d{2}/



## RULE 4 — One test per scenario, all assertions inside it

Never split one scenario across multiple test blocks.
Stack every assertion for that scenario inside a single test function.
One scenario ID = exactly one test() call. Count your test() calls before returning — if you have more than one, merge them.
Never write two tests that call the same endpoint with the same input and assert different fields.

Wrong:
test('POST /api/cart returns 400', ...)            // asserts status only
test('POST /api/cart returns error body', ...)     // asserts body only — same call, split

Correct:
test('POST /api/cart/checkout returns 400 with error body when cart is empty', async ({ request }) => {
  const res = await request.post('/api/cart/checkout');
  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body).toHaveProperty('message');
  expect(body.message).toContain('empty');
  expect(body).toHaveProperty('error');
});



## RULE 5 — State setup in beforeEach only, never mid-test

API calls are allowed only in beforeEach for state setup — never inside a test body alongside UI actions.
Every precondition setup call must assert it succeeded.
Never hardcode IDs and assume they exist — always create them via API first.

Correct:
test.beforeEach(async ({ request }) => {
  const productRes = await request.post('/api/test-data/products', {
    data: { id: 'prod_001', price: 25.98, stock: 10 }
  });
  expect(productRes.status()).toBe(201);       // assert setup succeeded
  await request.delete('/api/cart');           // clean state
});

test('shows correct cart count', async ({ page }) => {
  await page.goto('/cart');
  await expect(page.getByTestId('cart-count-badge')).toHaveText('1'); // UI only — no API calls
});

// Every hardcoded ID used in a test must be created in beforeEach first.
// If you write addToCart('prod_001') — prod_001 must be created in beforeEach.
// No exceptions. Assume the database is empty at the start of every test.

// SPECIFIC SCENARIOS that always need beforeEach setup — no exceptions:
// - Locked account tests    → create the locked user in beforeEach via API
// - Expired session tests   → create + expire the session in beforeEach via API
// - Rate limit tests        → reset the counter in beforeEach via API
// - Out of stock tests      → set stock to 0 in beforeEach via API
//
// NEVER assume these states exist in the database already.
// NEVER reference 'locked@example.com' or any pre-existing test account.
// Every test must create its own state and clean it up.

test.beforeEach(async ({ request }) => {
  // Create locked user fresh for this test
  const res = await request.post('/api/test-data/users', {
    data: { email: 'locked-user@test.internal', locked: true }
  });
  expect(res.status()).toBe(201);
});
test.afterEach(async ({ request }) => {
  // Clean up — delete the user created for this test
  await request.delete('/api/test-data/users/locked-user@test.internal');
});


## RULE 6 — Authentication via storageState only, no exceptions

Never hardcode credentials, tokens, base URLs, cookies, or auth headers anywhere in a spec file.

// NEVER use these specific values anywhere in a spec file — ever:
'test@example.com'    // hardcoded test email — banned
'Password123'         // hardcoded test password — banned
'wrong@example.com'   // hardcoded invalid email — banned
'wrongpass'           // hardcoded invalid password — banned
'Bearer abc123'       // hardcoded token — banned

Never:
const email = process.env.TEST_EMAIL ?? 'test@example.com';  // fallback forbidden
headers: { Authorization: \`Bearer \${process.env.API_TOKEN!}\` }
await context.addCookies([...]);
await page.goto('http://localhost:3000/cart');                 // hardcoded base URL forbidden

Always:
test.use({ storageState: 'auth.json' });
await page.goto('/cart');                                      // relative path only

For guest + logged-in scenarios: use two separate browser contexts both via storageState.
baseURL is set in playwright.config.ts — never reference it in a spec file.
All URLs in tests must be relative paths only: '/cart', '/dashboard', '/api/auth/login'.
Never write 'http://localhost:3000' or any absolute URL anywhere in a spec file.
If baseURL is not configured in playwright.config.ts — that is a config problem, not a test problem.
Do not work around it by hardcoding — leave the relative path and let config handle it.


## RULE 7 — Component tests are fully isolated from network and storage

Component tests use { mount } and { page } only — never { request }.
All backend behaviour must be simulated via page.route().fulfill() — no real API calls.
Never mutate sessionStorage, localStorage, or cookies inside a component test.
Pass all state via component props or mocked routes only.

### RULE 7A — You MUST call mount() with a real named React component — never raw HTML

WRONG — mounting fabricated HTML is not a component test. It proves nothing:
const component = await mount(
  <div data-testid="cart-container">
    <div data-testid="empty-cart-msg" style={{ display: 'block' }}>Your cart is empty</div>
  </div>
);
// This ALWAYS passes because the HTML is hardcoded. There is no real component logic being tested.

RIGHT — mount the actual component and let it render based on props or mocked routes:
await page.route('/api/cart', route =>
  route.fulfill({ status: 200, body: JSON.stringify({ items: [] }) })
);
const component = await mount(<CartPage />);
await expect(component.getByTestId('empty-cart-msg')).toBeVisible();

If you don't know the exact component file path, use the conventional component name based on the page:
- Cart page scenarios  → <CartPage />
- Checkout scenarios  → <CheckoutPage />
- Product scenarios   → <ProductPage />
- Quantity input only → <QuantitySelector maxStock={99} />

### RULE 7B — Before writing a component test, answer these two questions:
1. Which single React component will I mount? Name it explicitly (e.g. <CartPage />, <QuantitySelector />).
2. Can both the ACTION and the ASSERTION happen inside that one mounted component?
   - If the action is on one component and the assertion is on a different component
     (e.g. clicking "Add to Cart" on a product card, asserting a badge count in a nav header)
     this is NOT a component test. Write an API test verifying the cart endpoint instead,
     or use @playwright/test with page.goto() for a browser test.
   - If yes to both — proceed with mount().

### RULE 7C — If you import from @playwright/experimental-ct-react, you MUST call mount()

WRONG — using ct-react import but treating the test like a browser test:
import { test, expect } from '@playwright/experimental-ct-react';
// ...
test('adds to cart', async ({ page }) => {
  await page.goto('/cart');       // FORBIDDEN — no real URLs in component tests
  await cartPage.addToCart();    // FORBIDDEN — POM + page.goto() is a browser test, not component test
});

RIGHT — either:
  Option A: Use @playwright/experimental-ct-react AND call mount():
    import { test, expect } from '@playwright/experimental-ct-react';
    test('shows empty state', async ({ mount }) => {
      const component = await mount(<CartPage />);
      await expect(component.getByTestId('empty-cart-msg')).toBeVisible();
    });
  Option B: Realise you need a browser test, switch import to @playwright/test and use page.goto():
    import { test, expect } from '@playwright/test';
    test('shows empty state', async ({ page }) => {
      await page.goto('/cart');
      await expect(page.getByTestId('empty-cart-msg')).toBeVisible();
    });
Never mix ct-react import with page.goto() or POM navigation methods.

### RULE 7D — Never touch localStorage, sessionStorage, or cookies in component tests

WRONG:
await page.evaluate(() => localStorage.setItem('cart', JSON.stringify([...])));
await page.evaluate(() => sessionStorage.setItem('authToken', 'test-123'));
// page.reload() after setting sessionStorage clears it — your test is now broken

RIGHT — pass state entirely via props or mocked routes:
await page.route('/api/auth/check', route =>
  route.fulfill({ status: 401, body: JSON.stringify({ authenticated: false }) })
);
const component = await mount(<CartPage />);
await expect(component.getByTestId('guest-login-prompt')).toBeVisible();

Keep mocks simple — one route, one response, one assertion:
// WRONG — complex mock that obscures intent:
await page.route('/api/cart', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
    await route.fulfill({ status: 201, body: JSON.stringify({ cartId: 'abc' }) });
  } else if (req.method() === 'GET') {
    await route.fulfill({ status: 200, body: JSON.stringify({ items: [] }) });
  } else {
    await route.continue();
  }
});
// RIGHT — one route per test, one behaviour, assert DOM reacted:
await page.route('/api/cart', route =>
  route.fulfill({ status: 201, body: JSON.stringify({ cartId: 'abc' }) })
);
const component = await mount(<CartSummary />);
await component.getByRole('button', { name: /add/i }).click();
await expect(component.getByTestId('cart-count-badge')).toHaveText('1'); // DOM assertion required

Never register contradictory handlers on the same URL.
Never use route.abort() and route.continue() on the same URL in the same test.
One route URL = one handler per test. If you need different responses — use separate tests.

### RULE 7E — The Page Object class is IRRELEVANT for component tests. Ignore it completely.

When the scenario layer is \`component\`:
- Do NOT read the Page Object class
- Do NOT use any POM methods
- Do NOT conclude "this must be E2E because the POM uses page.goto()"
- The POM is written for browser-layer tests — it has nothing to do with component tests

A component test mounts the React component directly using mount():
import { test, expect } from '@playwright/experimental-ct-react';
import { LoginPage } from '../components/LoginPage'; // React component — NOT the POM

test('shows error on invalid credentials', async ({ mount, page }) => {
  await page.route('/api/auth/login', route =>
    route.fulfill({ status: 401, body: JSON.stringify({ error: 'Invalid email or password' }) })
  );
  const component = await mount(<LoginPage />);
  await component.getByTestId('email-input').fill('wrong@example.com');
  await component.getByTestId('password-input').fill('wrongpass');
  await component.getByTestId('login-btn').click();
  await expect(component.getByTestId('login-error-msg')).toBeVisible();
  await expect(component.getByTestId('login-error-msg')).toContainText('Invalid email or password');
});

// The fact that LoginPage.ts (POM) uses page.goto('/login') is irrelevant.
// You are NOT using the POM. You are mounting <LoginPage /> the React component.
// These are two different things with the same name — POM class vs React component.
// Always mount the React component. Always ignore the POM in component tests.

### RULE 7F — Never mark a scenario as E2E because the POM uses page.goto()

This is the most common mistake. The reasoning below is ALWAYS wrong:

WRONG REASONING — never do this:
// "The POM uses page.goto('/login') which is browser navigation"
// "Therefore this test requires a real browser"
// "Therefore this is E2E"
// → WRONG. The POM is not used in component tests. This reasoning is invalid.

CORRECT REASONING for component layer assignment:
// Q1: Do the ACTION and ASSERTION both happen inside one React component? → Yes (LoginPage)
// Q2: Can I mock the API response with page.route().fulfill()? → Yes
// Q3: Does it need real navigation between pages? → No
// → CORRECT: this is a component test. Mount <LoginPage />, mock the API, assert DOM.

Only mark as E2E if:
- The scenario requires navigating between TWO OR MORE real pages
- The scenario requires real session persistence across page reloads
- The scenario requires localStorage/sessionStorage that cannot be mocked via props/routes
- NOT because the POM uses page.goto()

### RULE 7G — Never skip a component test because the component import path is unknown

You will never be given the actual React component source file path.
This is not a reason to skip the test or mark it as E2E.

Always derive the component import from the pageName in the scenario metadata:
- pageName: "LoginPage"     → import { LoginPage } from '../components/LoginPage';
- pageName: "CartPage"      → import { CartPage } from '../components/CartPage';
- pageName: "CheckoutPage"  → import { CheckoutPage } from '../components/CheckoutPage';
- pageName: "ProductPage"   → import { ProductPage } from '../components/ProductPage';
- pageName: "DashboardPage" → import { DashboardPage } from '../components/DashboardPage';

If the pageName does not match a standard page — derive the component name from the scenario title.
Example: scenario about "quantity selector" → import { QuantitySelector } from '../components/QuantitySelector';

NEVER write any of these as a reason to skip:
// "The real component source was not provided" — WRONG reason to skip
// "No component import path is available" — WRONG reason to skip
// "The POM uses page.goto() which is incompatible with mount()" — WRONG reason to skip
// "Cannot be meaningfully tested without a real app shell" — WRONG reason to skip
// "Requires real navigation or full-page browser context" — WRONG reason to skip

If the layer is component — always write the test. Always mount the component. Always mock the API.
The component import path is always derivable from pageName. There are no exceptions.

### What to do for EVERY component scenario — no matter what:

Step 1 — Derive the import from pageName:
import { LoginPage } from '../components/LoginPage';

Step 2 — Mock any API the component needs:
await page.route('/api/auth/login', route =>
  route.fulfill({ status: 401, body: JSON.stringify({ error: 'Invalid email or password' }) })
);

Step 3 — Mount the component:
const component = await mount(<LoginPage />);

Step 4 — Perform the action:
await component.getByTestId('email-input').fill('wrong@example.com');
await component.getByTestId('password-input').fill('wrongpass');
await component.getByTestId('login-btn').click();

Step 5 — Assert the DOM:
await expect(component.getByTestId('login-error-msg')).toBeVisible();
await expect(component.getByTestId('login-error-msg')).toContainText('Invalid email or password');

This is always the correct pattern. The POM is irrelevant. The component source is irrelevant.
If Agent 2 assigned layer=component — Agent 3 writes a component test. Full stop.

## RULE 8 — Navigation must be verified, endpoints must be consistent

Every navigation call must be followed by an assertion the page loaded:
await page.goto('/cart');
await expect(page).toHaveURL('/cart');
await expect(page.getByTestId('cart-container')).toBeVisible();

Use one canonical endpoint per resource across ALL spec files.
If two tests use different paths for the same resource — pick one and apply it everywhere.
Check input/api-contract.json for the correct endpoint before writing any request call.

## RULE 9 — Never define helper functions inside a spec file:
// NEVER write standalone functions in a spec file:
function validateLoginForm(email: string, password: string) { ... } // WRONG
function isLoginSubmittable(email: string, password: string) { ... } // WRONG
// If logic is needed in the test — it belongs in the Page Object class
// Import and call it from there — never inline it in the spec file
// Spec files contain only: imports, test.describe, test.use, test.beforeEach, test()

RULE 10 — Token and value assertions must validate format, not just presence:
// NEVER assert only that a field exists:
expect(body).toHaveProperty('token');           // WRONG — token could be null or empty
expect(body.token).toBeTruthy();                // WRONG — any truthy value passes
// Always assert the value matches the expected format:
expect(body.token).toMatch(/^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/); // JWT format
expect(body.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);             // ISO date
expect(typeof body.token).toBe('string');
expect(body.token.length).toBeGreaterThan(20);
// Pick the most specific assertion the feature spec allows

---

## REQUIRED PATTERNS — always use these

### For UNIT tests (Playwright test runner):
// Test pure functions only — no browser, no network calls
test.describe('calculateDiscount()', () => {
  test('applies 10% correctly', () => {
    expect(calculateDiscount(100, 10)).toBe(90);
  });
  test('returns original price when discount is 0', () => {
    expect(calculateDiscount(100, 0)).toBe(100);
  });
});

### For API tests (Playwright request fixture):
// Test HTTP layer — status codes, response body, headers, error responses
// Auth comes from storageState — never pass Authorization headers manually
test.describe('POST /api/cart', () => {
  test.use({ storageState: 'auth.json' });
  test('returns 201 with cart item', async ({ request }) => {
    const res = await request.post('/api/cart', {
      data: { productId: 'prod_001', quantity: 1 }
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('cartId');
  });
  test('returns 400 when productId is missing', async ({ request }) => {
    const res = await request.post('/api/cart', {
      data: { quantity: 1 }
    });
    expect(res.status()).toBe(400);
  });
});

### For COMPONENT tests (Playwright component testing):
// Test component in isolation — props, interactions, render states
test.describe('QuantitySelector', () => {
  test('shows error when quantity exceeds stock', async ({ mount }) => {
    const component = await mount(<QuantitySelector maxStock={5} />);
    await component.getByRole('spinbutton').fill('10');
    await expect(component.getByTestId('stock-error-msg')).toBeVisible();
  });
});

### ALWAYS wrap everything in test.describe:
test.describe('<PageName> — <feature being tested>', () => {
  test.use({ storageState: 'auth.json' }); // if auth needed
  test.beforeEach(async ({ request }) => {
    await request.delete('/api/cart');      // clean state via API
  });
  test('<scenario title>', async ({ page }) => {
    // actions + DOM assertions only
  });
});

ASSERTIONS — always assert directly on DOM locators:
await expect(page.getByTestId('cart-count-badge')).toHaveText('2');
await expect(page.getByTestId('error-msg')).toBeVisible();
await expect(page.getByTestId('quantity-input-prod_001')).toHaveValue('3');
await expect(page).toHaveURL('/dashboard');

AFTER EVERY ACTION — assert the DOM updated:
await cartPage.addToCart();
await expect(page.getByTestId('cart-count-badge')).toHaveText('1');

await cartPage.applyDiscount('SAVE10');
await expect(page.getByTestId('discount-success')).toBeVisible();

TEST STRUCTURE — follow this exact order:
1. Identify layer: unit | api | component (from scenario metadata)
2. One scenario = exactly one test function — never split a scenario across multiple tests
3. Stack ALL assertions for that scenario inside the single test
4. Never mix { page } and { request } fixtures in the same spec file
5. Wrap everything inside test.describe('<PageName> — <feature being tested>', () => { ... })
6. test.use({ storageState: 'auth.json' }) — inside test.describe, if auth needed
7. test.beforeEach — API calls for state setup only, no UI actions
8. Perform ONE action
9. Assert the DIRECT result of that action first
10. Then assert any downstream state
11. Repeat steps 8-10 for each step in the scenario

---

## IMPORTS — use based on layer:
// Unit:
import { test, expect } from '@playwright/test';
// (import the pure function under test — no POM, no page, no request)

// API:
import { test, expect } from '@playwright/test';
// NO Page Object import. NO page fixture. request fixture only.

// Component:
import { test, expect } from '@playwright/experimental-ct-react';
import { ComponentName } from '../components/ComponentName'; // the real React component

Return ONLY raw TypeScript code. No explanation. No markdown fences.`;

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
  console.error("\n--- Agent 3: Test Engineer (POM mode) ---");

  // ── Filter: unit/api/component only, P1/P2 only, skip manualOnly ──
  const targetScenarios = layerPlan.filter(
    (lp) =>
      ["unit", "api", "component"].includes(lp.layer) &&
      lp.manualOnly !== true &&
      (lp.automationPriority === "P1" || lp.automationPriority === "P2"),
  );

  const skippedE2e = layerPlan.filter((lp) => lp.layer === "e2e").length;
  const skippedManual = layerPlan.filter(
    (lp) => lp.manualOnly === true && lp.layer !== "e2e",
  ).length;
  const skippedP3 = layerPlan.filter(
    (lp) => lp.automationPriority === "P3" && lp.layer !== "e2e",
  ).length;

  console.error(
    `Writing tests for ${targetScenarios.length} scenarios (unit/api/component | P1+P2 only)`,
  );
  console.error(
    `Skipping ${skippedE2e} e2e scenario(s)     — handled at SIT/UAT level`,
  );
  console.error(
    `Skipping ${skippedManual} manual-only scenario(s) — not suitable for automation`,
  );
  console.error(
    `Skipping ${skippedP3} P3 scenario(s)         — low automation ROI`,
  );

  if (targetScenarios.length === 0) {
    console.error("No automatable scenarios found.");
    return [];
  }

  // Create output folder structure
  const pagesDir = path.join("output", "pages");
  const testsDir = path.join("output", "tests");
  if (!fs.existsSync(pagesDir)) fs.mkdirSync(pagesDir, { recursive: true });
  if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir, { recursive: true });

  const results: TestResult[] = [];
  let skippedCommentOnly = 0;
  for (const plan of targetScenarios) {
    if (!plan.scenario) {
      console.warn(
        `  ⚠ Skipping ${plan.scenarioId} — no scenario data attached`,
      );
      continue;
    }

    console.error(
      `\n  [${plan.scenarioId}] ${plan.scenario.title} | ${plan.layer} | ${plan.automationPriority}`,
    );

    const scenarioContext = JSON.stringify(plan, null, 2);

    // ── Step 1: Reuse or create Page Object based on pageName ────────
    // API tests do not need a POM — they use the request fixture only.
    // Component and unit tests get a shared POM per page.
    const derivedPageName =
      plan.pageName ||
      (() => {
        // Extract page name from scenario title as fallback
        const title = plan.scenario?.title ?? plan.scenarioId;
        const knownPages = [
          "Login",
          "Cart",
          "Checkout",
          "Product",
          "Dashboard",
          "Search",
        ];
        const matched = knownPages.find((p) =>
          title.toLowerCase().includes(p.toLowerCase()),
        );
        return matched ? `${matched}Page` : "AppPage";
      })();

    if (!plan.pageName) {
      console.warn(
        `  ⚠ [${plan.scenarioId}] pageName missing — derived fallback: ${derivedPageName}`,
      );
    }

    const pageFileName = `${derivedPageName}.ts`;
    const pageFilePath = path.join(pagesDir, pageFileName);

    let specPromptInput: string;

    if (plan.layer === "api" || plan.layer === "unit") {
      // No POM for API/unit tests — pass scenario only
      console.error(
        `  ↳ Skipping Page Object (${plan.layer} test — POM not needed)`,
      );
      specPromptInput = `
Scenario:
${scenarioContext}

NOTE: This is an ${plan.layer.toUpperCase()} test. Do NOT import or instantiate any Page Object class.
Use only the { request } fixture. Assert only on res.status() and res.json(). No page, no mount, no POM.
`;
    } else {
      // Component test — generate or reuse POM
      let cleanPageObject: string;
      if (fs.existsSync(pageFilePath)) {
        cleanPageObject = fs.readFileSync(pageFilePath, "utf8");
        console.error(`  ↳ Page Object reused: output/pages/${pageFileName}`);
      } else {
        console.error(`  ↳ Generating Page Object: ${pageFileName}...`);
        const pageObjectCode = await callClaude(
          PAGE_OBJECT_PROMPT,
          scenarioContext,
          MODEL.SMART,
        );
        cleanPageObject = pageObjectCode
          .replace(/^```[a-z]*\n?/m, "")
          .replace(/\n?```$/m, "")
          .trim();
        fs.writeFileSync(pageFilePath, cleanPageObject, "utf8");
        console.error(`  ↳ Page Object created: output/pages/${pageFileName}`);
      }
      specPromptInput = `
Scenario:
${scenarioContext}

Page Object class (already written — import and use this):
\`\`\`typescript
${cleanPageObject}
\`\`\`
`;
    }
    const specCode = await callClaude(
      SPEC_FILE_PROMPT,
      specPromptInput,
      MODEL.SMART,
    );

    const cleanSpec = specCode
      .replace(/^```[a-z]*\n?/m, "")
      .replace(/\n?```$/m, "")
      .trim();

    const lines = cleanSpec.split("\n").map((l) => l.trim());

    const hasTestBlock = lines.some(
      (line) => line.includes("test(") || line.includes("test.describe("),
    );

    const hasAssertion = lines.some(
      (line) =>
        line.includes("expect(") ||
        line.includes("res.status()") ||
        line.includes("res.json()"),
    );

    const hasRealCode = hasTestBlock && hasAssertion;

    if (!hasRealCode) {
      console.warn(
        `  ⚠ [${plan.scenarioId}] Skipping — generated file contains no real tests (comment-only output)`,
      );
      skippedCommentOnly++;
      continue;
    }

    const hasHardcodedCredentials =
      cleanSpec.includes("'test@example.com'") ||
      cleanSpec.includes('"test@example.com"') ||
      cleanSpec.includes("'password123'") ||
      cleanSpec.includes('"password123"') ||
      cleanSpec.includes("'Bearer ") ||
      cleanSpec.includes('"Bearer ') ||
      cleanSpec.includes("localhost:3000") ||
      cleanSpec.includes("?? '") || // fallback credentials pattern
      cleanSpec.includes('?? "'); // fallback credentials pattern

    if (hasHardcodedCredentials) {
      console.warn(
        `  ⚠ [${plan.scenarioId}] WARNING — hardcoded credentials detected in generated spec`,
      );
    }

    const specFileName = `${plan.scenarioId}_${safeName(plan.scenario.title)}.spec.ts`;
    const specFilePath = path.join(testsDir, specFileName);
    fs.writeFileSync(specFilePath, cleanSpec, "utf8");
    console.error(`  ↳ Spec saved: output/tests/${specFileName}`);

    const hasPom = plan.layer !== "api" && plan.layer !== "unit";
    results.push({
      scenarioId: plan.scenarioId,
      title: plan.scenario.title,
      layer: plan.layer,
      file: specFileName,
      filePath: specFilePath,
      pageObjectFile: hasPom ? pageFileName : undefined,
      pageObjectPath: hasPom ? pageFilePath : undefined,
      status: "generated",
      code: cleanSpec,
      pageObjectCode: hasPom
        ? fs.existsSync(pageFilePath)
          ? fs.readFileSync(pageFilePath, "utf8")
          : undefined
        : undefined,
    });
  }

  // ── Deduplicate POM count for accurate reporting ──────────────────
  const uniquePageObjects = [...new Set(results.map((r) => r.pageObjectFile))];

  console.error(`\n✓ Agent 3 complete`);
  console.error(
    `  Page Objects → output/pages/ (${uniquePageObjects.length} unique)`,
  );
  console.error(`  Spec files   → output/tests/ (${results.length} files)`);
  console.error(`  Skipped (comment-only) : ${skippedCommentOnly}`);
  console.error(`  Unique POMs  : ${uniquePageObjects.join(", ")}`);
  console.error(`  Hardcoded Credentials : ${results.filter((r) => r.code.includes("test@example.com")).length}`);

  return results;
}
