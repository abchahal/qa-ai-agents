import { runFunctionalTester } from "./agents/agent1FunctionalTester.js";
import { runTestArchitect } from "./agents/agent2TestArchitect.js";
import { runTestEngineer } from "./agents/agent3TestEngineer.js";
import { runCodeReviewer } from "./agents/agent4CodeReviewer.js";
import {
  Scenario,
  LayerPlan,
  TestResult,
  ReviewReport,
} from "./types/types.js";
import { cleanupOutput } from "./utils/cleanup.js";
import fs from "fs";
import path from "path";
import ora from "ora";

interface LayerCounts {
  unit: number;
  api: number;
  component: number;
  e2e: number;
}

interface PipelineResult {
  scenarios: Scenario[];
  layerPlan: LayerPlan[];
  testResults: TestResult[];
  reviewReport: ReviewReport;
}

// ── Load input from the input/ folder ────────────────────────────────
function loadInput(): string {
  const inputDir = "input";
  let context = "";

  // 1. Feature requirements (required)
  const featurePath = path.join(inputDir, "feature.md");
  if (fs.existsSync(featurePath)) {
    context += `## Feature Requirements\n${fs.readFileSync(featurePath, "utf8")}\n\n`;
    console.log("  ✓ Loaded: input/feature.md");
  } else {
    console.warn(
      "  ⚠ input/feature.md not found — using CLI argument or default",
    );
  }

  // 2. Source code (optional — paste your actual component/API file here)
  const sourcePath = path.join(inputDir, "source.js");
  if (fs.existsSync(sourcePath)) {
    const code = fs.readFileSync(sourcePath, "utf8");
    context += `## Source Code\n\`\`\`js\n${code}\n\`\`\`\n\n`;
    console.log("  ✓ Loaded: input/source.js");
  }

  // 3. API contract (optional — paste your Swagger/Postman JSON here)
  const apiPath = path.join(inputDir, "api-contract.json");
  if (fs.existsSync(apiPath)) {
    const api = fs.readFileSync(apiPath, "utf8");
    context += `## API Contract\n\`\`\`json\n${api}\n\`\`\`\n\n`;
    console.log("  ✓ Loaded: input/api-contract.json");
  }

  // 4. Existing test files (optional — helps Agent 4 review in context)
  const existingTestsPath = path.join(inputDir, "existing-tests.js");
  if (fs.existsSync(existingTestsPath)) {
    const tests = fs.readFileSync(existingTestsPath, "utf8");
    context += `## Existing Tests (for reference)\n\`\`\`js\n${tests}\n\`\`\`\n\n`;
    console.log("  ✓ Loaded: input/existing-tests.js");
  }

  return context.trim();
}

// ── Main pipeline ─────────────────────────────────────────────────────
async function runPipeline(featureInput: string): Promise<PipelineResult> {
  console.log("\n╔═══════════════════════════════════════╗");
  console.log("║       QA AI Agent Pipeline            ║");
  console.log("╚═══════════════════════════════════════╝\n");

  function archiveAndClean(): void {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const archiveDir = path.join("output", "archive", timestamp);

    // Archive previous run if output exists
    if (fs.existsSync(path.join("output", "tests"))) {
      fs.mkdirSync(archiveDir, { recursive: true });
      fs.cpSync(path.join("output", "tests"), path.join(archiveDir, "tests"), {
        recursive: true,
      });
      fs.cpSync(path.join("output", "pages"), path.join(archiveDir, "pages"), {
        recursive: true,
      });
      if (fs.existsSync(path.join("output", "pipeline_report.md"))) {
        fs.copyFileSync(
          path.join("output", "pipeline_report.md"),
          path.join(archiveDir, "pipeline_report.md"),
        );
      }
      console.log(`  ✓ Previous run archived to: output/archive/${timestamp}`);
    }

    // Then clean
    cleanupOutput();
  }
  // Call once — archives previous run then cleans
  archiveAndClean();

  console.log("Loading input files...");
  const inputContext = loadInput();

  // Fall back to CLI arg or default if no input/ files found
  const finalInput: string = inputContext || featureInput;

  console.log(`\nInput length: ${finalInput.length} characters`);
  console.log("─".repeat(40));

  const startTime: number = Date.now();

  // ── Agent 1: Generate test scenarios ─────────────────────────────
  const spinner = ora("Agent 1 — Generating test scenarios...").start();
  const scenarios = await runFunctionalTester(finalInput);
  spinner.succeed(`Agent 1 — Generated ${scenarios.length} scenarios`);

  // ── Agent 2: Assign to test pyramid layers ────────────────────────
  // ── Agent 2: Assign to test pyramid layers ────────────────────────
  const layerSpinner = ora("Agent 2 — Assigning test layers...").start();
  const layerPlan = await runTestArchitect(scenarios);
  layerSpinner.succeed(
    `Agent 2 — Assigned ${layerPlan.length} scenarios to layers`,
  );

  // ── Enrich layerPlan with scenario data + validate pageName ──────
  const enrichedLayerPlan = layerPlan.map((lp: LayerPlan) => {
    // 1. Attach scenario data from Agent 1
    const scenario = scenarios.find((s: Scenario) => s.id === lp.scenarioId);

    // 2. Repair missing pageName dynamically from scenario title
    let pageName = lp.pageName;
    if (!pageName || pageName.trim() === "" || pageName === "undefined") {
      if (scenario) {
        // Derive from scenario title — works for any domain, no hardcoding
        pageName =
          scenario.title
            .split(" ")
            .filter((w) => w.length > 3)
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .slice(0, 2)
            .join("") + "Page";
      } else {
        pageName = `${lp.scenarioId}Page`;
      }
      console.warn(
        `  ⚠ pageName missing for ${lp.scenarioId} — derived: ${pageName}`,
      );
    }

    return { ...lp, scenario, pageName };
  });

  // Warn if any scenario could not be matched
  enrichedLayerPlan.forEach((lp) => {
    if (!lp.scenario) {
      console.warn(
        `  ⚠ No scenario found for ${lp.scenarioId} — check Agent 1/2 ID mismatch`,
      );
    }
  });

  // ── Agent 3: Write Playwright test files ──────────────────────────
  const testSpinner = ora("Agent 3 — Writing test files...").start();
  const testResults: TestResult[] = await runTestEngineer(enrichedLayerPlan);
  testSpinner.succeed(`Agent 3 — Generated ${testResults.length} test files`);

  // ── Agent 4: Review generated test quality ────────────────────────
  const reviewSpinner = ora("Agent 4 — Reviewing test quality...").start();
  const reviewReport: ReviewReport = await runCodeReviewer(testResults);
  reviewSpinner.succeed(`Agent 4 — Completed review`);

  // ── Build final markdown report ───────────────────────────────────
  const duration: string = ((Date.now() - startTime) / 1000).toFixed(1);

  const layerCounts: LayerCounts = { unit: 0, api: 0, component: 0, e2e: 0 };
  layerPlan.forEach((lp: LayerPlan) => {
    if (lp.layer in layerCounts) layerCounts[lp.layer]++;
  });

  const report: string = `# QA Pipeline Report

**Feature input:** ${inputContext ? "Loaded from input/feature.md" : "CLI argument"}
**Generated:** ${new Date().toLocaleString()}
**Duration:** ${duration}s

---

## Agent 1 — Test Scenarios (${scenarios.length} total)

| ID | Type | Title |
|----|------|-------|
${scenarios.map((s: Scenario) => `| ${s.id} | ${s.type} | ${s.title} |`).join("\n")}

---

## Agent 2 — Test Layer Assignments

| Layer | Count |
|-------|-------|
| Unit | ${layerCounts.unit} |
| API | ${layerCounts.api} |
| Component | ${layerCounts.component} |
| E2E (Playwright) | ${layerCounts.e2e} |

### Assignments
${layerPlan.map((lp: LayerPlan) => `- **${lp.scenarioId}** → \`${lp.layer}\` — ${lp.reason}`).join("\n")}

---

## Agent 3 — Generated Test Files (${testResults.length} files)

${
  testResults.length === 0
    ? "_No e2e tests generated — all scenarios assigned to lower layers._"
    : testResults
        .map((r: TestResult) => `- \`${r.file}\` — ${r.title}`)
        .join("\n")
}

---

## Agent 4 — Code Review

**Overall Score: ${reviewReport.overallScore}/100**

${reviewReport.summary}

### Issues Found
${
  reviewReport.issues && reviewReport.issues.length > 0
    ? reviewReport.issues
        .map(
          (i) =>
            `- [**${i.severity.toUpperCase()}**] \`${i.file}\` — ${i.issue}`,
        )
        .join("\n")
    : "_No issues found._"
}

### Suggestions
${
  reviewReport.suggestions && reviewReport.suggestions.length > 0
    ? reviewReport.suggestions.map((s: string) => `- ${s}`).join("\n")
    : "_No suggestions._"
}

---

## Input Files Used
${
  inputContext
    ? [
        fs.existsSync("input/feature.md") ? "- ✓ input/feature.md" : "",
        fs.existsSync("input/source.js") ? "- ✓ input/source.js" : "",
        fs.existsSync("input/api-contract.json")
          ? "- ✓ input/api-contract.json"
          : "",
        fs.existsSync("input/existing-tests.js")
          ? "- ✓ input/existing-tests.js"
          : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "- CLI argument / default string"
}

---

_Generated by qa-ai-agents pipeline_
`;

  // Ensure output folder exists
  if (!fs.existsSync("output")) fs.mkdirSync("output");

  const reportPath: string = path.join("output", "pipeline_report.md");
  fs.writeFileSync(reportPath, report, "utf8");

  // ── Summary ───────────────────────────────────────────────────────
  console.log("\n╔═══════════════════════════════════════╗");
  console.log("║         Pipeline Complete ✓           ║");
  console.log("╚═══════════════════════════════════════╝");
  console.log(`\n  Scenarios generated : ${scenarios.length}`);
  console.log(
    `  Layer breakdown     : unit=${layerCounts.unit} | api=${layerCounts.api} | component=${layerCounts.component} | e2e=${layerCounts.e2e}`,
  );
  console.log(`  Automation test cases written   : ${testResults.length}`);
  console.log(`  Review score        : ${reviewReport.overallScore}/100`);
  console.log(`  Duration            : ${duration}s`);
  console.log(`\n  Report → output/pipeline_report.md`);
  console.log(`  Tests  → output/*.spec.js\n`);

  return { scenarios, layerPlan, testResults, reviewReport };
}

// ── Entry point ───────────────────────────────────────────────────────
// 3 ways to run:
//   npx ts-node src/pipeline.ts                        ← reads input/feature.md
//   npx ts-node src/pipeline.ts "feature text here"    ← uses CLI string
//   npx ts-node src/pipeline.ts                        ← uses default below
const cliFeature: string =
  process.argv[2] ??
  "User login with email and password, including remember me and forgot password";

runPipeline(cliFeature).catch((err: Error) => {
  console.error("\n✗ Pipeline failed:", err.message);
  process.exit(1);
});
