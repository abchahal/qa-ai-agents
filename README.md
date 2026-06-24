# QA AI Agents

An AI-powered QA automation pipeline built with TypeScript, Claude API, and the Model Context Protocol (MCP).

## Architecture

Four specialised agents run in sequence, each grounded in feature requirements, business rules, and API contracts:

1. **Agent 1 — Functional Tester**: Generates test scenarios across happy path, negative, security, edge cases, UI states, and business rules
2. **Agent 2 — Test Architect**: Assigns each scenario to the correct test pyramid layer (unit / API / component / E2E)
3. **Agent 3 — Test Engineer**: Writes production-grade Playwright tests using Page Object Model (POM)
4. **Agent 4 — Code Reviewer**: Audits generated tests for selector quality, assertion completeness, and Playwright best practices

## MCP Server

Exposes the pipeline as 4 MCP tools callable from Claude Desktop or Claude Code:

- `run_qa_pipeline` — full 4-agent pipeline
- `generate_test_scenarios` — Agent 1 only
- `set_feature_input` — write to input/feature.md
- `get_pipeline_report` — read last pipeline report

## Tech Stack

- TypeScript + Node.js
- Anthropic Claude API (Sonnet 4.6 + Haiku 4.5)
- Ollama (local LLM support — toggle via USE_OLLAMA)
- Playwright (generated test output)
- Model Context Protocol (MCP) SDK

---

## Setup

```bash
git clone https://github.com/abchahal/qa-ai-agents.git
cd qa-ai-agents
npm install
cp .env.example .env
# Add your ANTHROPIC_API_KEY to .env
```

---

## Running the pipeline

```bash
# Via terminal
npm run pipeline

# Via Claude Desktop / Claude Code
# Type: "Run the full QA pipeline using input/feature.md"
```

---

## Input files

| File | Purpose |
|---|---|
| `input/feature.md` | Feature requirements, business rules, UI selectors |
| `input/api-contract.json` | API schema (optional) |
| `input/source.js` | Source code context (optional) |

---

## Output

```
output/
├── pages/             ← Page Object classes
├── tests/             ← Playwright spec files
└── pipeline_report.md
```

---

## Model Strategy

| Agent | Model | Reason |
|---|---|---|
| Agent 1 | Haiku 4.5 | Structured JSON output |
| Agent 2 | Haiku 4.5 | Classification task |
| Agent 3 | Haiku 4.5 | Code generation |
| Agent 4 | Haiku 4.5 | Analysis and scoring |

---

## MCP Setup via CLI

### Step 1 — Create the batch file

Create `start-mcp.bat` in the project root:

```batch
@echo off
cd /d "C:\path\to\qa-ai-agents"
node --loader ts-node/esm src/server.ts
```

Replace `C:\path\to\qa-ai-agents` with your actual project path.

### Step 2 — Register the MCP server

```bash
claude mcp add -s user qa-ai-agents "C:\path\to\qa-ai-agents\start-mcp.bat"
```

### Step 3 — Verify connection

```bash
# List all MCP servers and their status
claude mcp list

# Check your server specifically
claude mcp get qa-ai-agents
```

Expected output:
```
qa-ai-agents:
  Scope: User config (available in all your projects)
  Status: ✔ Connected
  Type: stdio
  Command: C:\path\to\qa-ai-agents\start-mcp.bat
```

### Step 4 — Remove the server (if needed)

```bash
claude mcp remove qa-ai-agents -s user
```

---

## Switching between Ollama and Claude API

### Ollama → Claude API

**Step 1 — Update `.env`:**
```
USE_OLLAMA=false
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

**Step 2 — Restart the MCP server to pick up new env:**
```bash
claude mcp remove qa-ai-agents -s user
claude mcp add -s user qa-ai-agents "C:\path\to\qa-ai-agents\start-mcp.bat"
```

**Step 3 — Verify correct provider is loaded:**
```bash
npm run agent1
```

You should see:
```
Using Claude API: claude-sonnet-4-6
```

---

### Claude API → Ollama

**Step 1 — Make sure Ollama is running and model is pulled:**
```bash
ollama list
# Should show qwen2.5-coder:7b or your preferred model
```

If model is not pulled yet:
```bash
ollama pull qwen2.5-coder:7b
```

**Step 2 — Update `.env`:**
```
USE_OLLAMA=true
OLLAMA_MODEL=qwen2.5-coder:7b
```

**Step 3 — Restart the MCP server:**
```bash
claude mcp remove qa-ai-agents -s user
claude mcp add -s user qa-ai-agents "C:\path\to\qa-ai-agents\start-mcp.bat"
```

**Step 4 — Verify correct provider is loaded:**
```bash
npm run agent1
```

You should see:
```
Using Ollama local model: qwen2.5-coder:7b
```

---

### Provider comparison

| | Ollama (local) | Claude API (cloud) |
|---|---|---|
| Cost | Free | ~$0.18 per pipeline run |
| Speed | 15–25 minutes | 45–90 seconds |
| Quality | Good | Best |
| Internet required | No | Yes |
| Best for | Development and debugging | Production runs and demos |

> **Tip:** Use `USE_OLLAMA=true` while writing and debugging agent code to avoid burning API credits. Switch to `USE_OLLAMA=false` for actual pipeline runs and portfolio demos.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (if USE_OLLAMA=false) | Your Anthropic API key from console.anthropic.com |
| `USE_OLLAMA` | Yes | `true` for local Ollama, `false` for Claude API |
| `OLLAMA_MODEL` | No | Ollama model name. Default: `qwen2.5-coder:7b` |