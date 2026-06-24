import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import { runFunctionalTester } from './agents/agent1FunctionalTester.js';
import { runTestArchitect } from './agents/agent2TestArchitect.js';
import { runTestEngineer } from './agents/agent3TestEngineer.js';
import { runCodeReviewer } from './agents/agent4CodeReviewer.js';
import { cleanupOutput } from './utils/cleanup.js';

// ── Create the MCP server ─────────────────────────────────────────────
const server = new McpServer({
  name: 'qa-ai-agents',
  version: '1.0.0',
});

// ── Tool 1: Run the full pipeline ─────────────────────────────────────
server.registerTool(
  'run_qa_pipeline',
  {
    description: 'Run the full 4-agent QA pipeline. Automatically reads from input/feature.md by default. Generates test scenarios, assigns test pyramid layers, writes POM Playwright tests, and produces a code review report.',
    inputSchema: {
      feature_description: z.string().optional().describe('Optional feature description. If not provided, reads from input/feature.md automatically.'),
      use_input_folder: z.boolean().optional().describe('Whether to read from input/feature.md. Defaults to true.'),
    },
  },
  async ({ feature_description, use_input_folder = true }) => {
    try {
      console.error('MCP: run_qa_pipeline called');

      // Cleanup previous output
      cleanupOutput();

      // Default — always read input/feature.md unless explicitly disabled
      let finalInput = feature_description ?? '';
      if (use_input_folder !== false && fs.existsSync('input/feature.md')) {
        finalInput = fs.readFileSync('input/feature.md', 'utf8');
        console.error('MCP: Using input/feature.md');
      } else if (!finalInput) {
        throw new Error('No input found. Add content to input/feature.md or provide a feature_description.');
      } else {
        console.error('MCP: Using provided feature_description');
      }

      if (!fs.existsSync('output')) fs.mkdirSync('output');
      if (!fs.existsSync('output/pages')) fs.mkdirSync('output/pages', { recursive: true });
      if (!fs.existsSync('output/tests')) fs.mkdirSync('output/tests', { recursive: true });

      const scenarios = await runFunctionalTester(finalInput);
      const layerPlan = await runTestArchitect(scenarios);
      const testResults = await runTestEngineer(layerPlan);
      const reviewReport = await runCodeReviewer(testResults);

      const layerCounts = { unit: 0, api: 0, component: 0, e2e: 0 };
      layerPlan.forEach(lp => {
        if (lp.layer in layerCounts) layerCounts[lp.layer as keyof typeof layerCounts]++;
      });

      const summary = `
QA Pipeline Complete ✓

Scenarios generated : ${scenarios.length}
Layer breakdown     : unit=${layerCounts.unit} | api=${layerCounts.api} | component=${layerCounts.component} | e2e=${layerCounts.e2e}
E2E tests written   : ${testResults.length}
Review score        : ${reviewReport.overallScore}/100

Generated files:
${testResults.map(r => `  - output/tests/${r.file}\n  - output/pages/${r.pageObjectFile}`).join('\n')}

Review summary:
${reviewReport.summary}

Top issues:
${reviewReport.issues.slice(0, 3).map(i => `  [${i.severity}] ${i.issue}`).join('\n') || '  None'}
      `.trim();

      return {
        content: [{ type: 'text', text: summary }],
      };
    } catch (err) {
      const error = err as Error;
      return {
        content: [{ type: 'text', text: `Pipeline failed: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool 2: Run Agent 1 only ──────────────────────────────────────────
server.registerTool(
  'generate_test_scenarios',
  {
    description: 'Run only Agent 1 — generates test scenarios from a feature description without writing any test files.',
    inputSchema: {
      feature_description: z.string().describe('Feature description to generate scenarios for'),
    },
  },
  async ({ feature_description }) => {
    try {
      console.error('MCP: generate_test_scenarios called');
      const scenarios = await runFunctionalTester(feature_description);

      const output = scenarios.map(s =>
        `[${s.id}] ${s.type.toUpperCase()}\nTitle: ${s.title}\nSteps: ${s.steps.join(' → ')}\nExpected: ${s.expected}`
      ).join('\n\n');

      return {
        content: [{ type: 'text', text: `Generated ${scenarios.length} scenarios:\n\n${output}` }],
      };
    } catch (err) {
      const error = err as Error;
      return {
        content: [{ type: 'text', text: `Failed: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool 3: Write feature.md ──────────────────────────────────────────
server.registerTool(
  'set_feature_input',
  {
    description: 'Write content to input/feature.md so the pipeline uses it as the feature context on next run.',
    inputSchema: {
      content: z.string().describe('The full feature requirements to write into input/feature.md'),
    },
  },
  async ({ content }) => {
    try {
      if (!fs.existsSync('input')) fs.mkdirSync('input');
      fs.writeFileSync('input/feature.md', content, 'utf8');
      return {
        content: [{ type: 'text', text: 'Written to input/feature.md successfully. Run run_qa_pipeline with use_input_folder: true to use it.' }],
      };
    } catch (err) {
      const error = err as Error;
      return {
        content: [{ type: 'text', text: `Failed to write file: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool 4: Read pipeline report ──────────────────────────────────────
server.registerTool(
  'get_pipeline_report',
  {
    description: 'Read the most recent pipeline report from output/pipeline_report.md',
    inputSchema: {},
  },
  async () => {
    try {
      const reportPath = path.join('output', 'pipeline_report.md');
      if (!fs.existsSync(reportPath)) {
        return {
          content: [{ type: 'text', text: 'No report found. Run the pipeline first.' }],
        };
      }
      const report = fs.readFileSync(reportPath, 'utf8');
      return {
        content: [{ type: 'text', text: report }],
      };
    } catch (err) {
      const error = err as Error;
      return {
        content: [{ type: 'text', text: `Failed to read report: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ── Start the server ──────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('QA AI Agents MCP server running');
}

main().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});