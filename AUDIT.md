# SanMine Space — Agent Architecture Audit

**Date:** 2026-08-22
**Repo:** `taslimarif452/Sanmine`

**Product (corrected):** SanMine is **not** a coding agent. It is a work-delegation research + outreach platform:

`goal → understand → plan → discover → verify → inspect primary sources → extract evidence → (optional) draft proposals → (optional) send via the user's connected Gmail → honest report (Requested / Verified / Could not verify + sources)`

**Verdict vs that product:** The costume was already there. The live path used to require `/`, stop after the first search page, ignore the auto-send setting, and treat missing emails as a reason to stall. Those product-path bugs are what made it feel like “agent kuchh nahi karta”.

This is not a UI polish issue. It is an execution-loop issue.

---

## 1. Why this agent cannot perform like a real coding agent

A capable agent (Cursor, Claude Code, Arena Agent Mode, ChatGPT with computer use) is:

```
User intent
  → model with NATIVE tool calling
  → real tools (shell, files, browser, network, git)
  → observe real results
  → decide next tool
  → repeat until the job is done
  → reply with evidence
```

SanMine is:

```
User message
  → slash-command gate
  → ask the LLM to emit JSON
  → regex / keyword repair of that JSON
  → 10–15 hardcoded tools (search, audit, proposal, email)
  → HTTP fetch pretending to be a browser
  → 5-section “grounded report”
```

Those are different products. SanMine is a **lead-gen / web-research copilot**. It was never given the tools, loop, or runtime that a general agent needs.

### Side-by-side

| Capability | Real agent | SanMine today |
|---|---|---|
| Read / write files | Yes | No |
| Run shell / tests / git | Yes | No |
| Native function calling | Yes (`tool_use` / `tools`) | No — JSON-in-a-prompt |
| Real Chromium | Yes | Only if `BROWSER_WS_ENDPOINT` is set; otherwise fake SVG |
| Click JS apps (Instagram, LinkedIn, Maps) | Yes | Login walls + HTTP fallback stubs |
| Decide tools from the model | Yes | Regex + `PlanValidator` repair |
| Long-running work | Process / VM | Vercel function, **60s max** |
| Default model | Frontier (Claude / GPT-4.1 / Gemini 2.5) | `openai/gpt-oss-20b:free` |
| Activate tools | Always, when needed | **Only if the prompt starts with `/`** |

If a user types `Patna ke bakeries find karo` without a leading `/`, **zero tools run**. That is the #1 reason it “does nothing”.

---

## 2. How a real agent actually works (the thing you are comparing against)

There is no magic. The model is not “smart enough to do things”. It is **allowed to call tools**, and a host process **executes** those tools.

Typical loop:

1. System prompt lists tools with JSON schemas (`bash`, `read_file`, `edit_file`, `web_search`, `browser`, …).
2. Model returns a structured tool call, not a paragraph of JSON it might mess up.
3. Host runs the tool against a real computer (filesystem, network, browser).
4. Host sends the observation back as a tool result.
5. Model continues. 20–80 steps is normal for a hard task.
6. Only then it writes the user-facing answer.

SanMine already has tool *schemas* (`getOpenAIToolDefinitions`, `getGeminiToolDeclarations` in `server/tools.ts`). The brain **never uses them**. It asks the model: “please output a JSON plan”, then tries to parse it. That is the single largest design error.

---

## 3. Runtime path (what actually happens on send)

```
UI  POST /api/ai/chat
  → server/app.ts  handleChatStream
  → orchestrateAgentTask  (server/agent.ts)
       ├─ resolveExecutionMode  (server/agent/modeRouter.ts)
       │     no leading '/'  → executeNormalChat   ← CHAT ONLY
       │     leading '/'     → universalAgentBrain.executeTask
       └─ brainDecisionEngine.run  (server/agent/brain/decisionEngine.ts)
            1. formulatePlan        (LLM JSON, temperature 0.1)
            2. PlanValidator.repair (regex keywords)
            3. while iteration < 15
                 executeTool → evaluateStep (another LLM JSON) → maybe replan
            4. synthesizeFinalAnswer  (forced 5 markdown sections)
            on throw → universalTaskPlanner.execute  (third brain)
```

Three brains exist. Only one is live. The other two still sit in the repo:

| Brain | File | Used? |
|---|---|---|
| Universal Agent Brain | `server/agent/brain/decisionEngine.ts` | Yes (slash mode) |
| Universal Task Planner | `server/taskPlanner/planner.ts` | Fallback on throw |
| Old orchestrator + `runAutonomousAgentLoop` | `server/agent.ts`, `server/agent/autonomousBrain.ts` | Dead / leftover |

`classifyTask()` in `agent.ts` (~400 lines of industry keyword lists) is **not on the live path**. `oldOrchestrateAgentTask` is unused. That is ~1,500 lines of zombie orchestration.

---

## 4. Critical defects (ordered by user-visible impact)

### P0 — Slash gate hides the agent

`server/agent/modeRouter.ts`:

- Messages **must** start with `/` to enter agent mode.
- Follow-ups only continue if the last assistant message asked a clarification question.
- Normal chat system prompt literally says tools are “accessed exclusively when the user types a leading `/`”.

Users type natural language. The agent stays silent. UI copy explains this, but the product still *looks* like ChatGPT-with-tools. Intent should be classified by the model, not by the first character.

### P0 — Fake tool calling (JSON mode, not native tools)

`server/agent/brain/llmClient.ts` + `promptTemplates.ts`:

- Every plan / evaluate / replan step is `jsonMode: true`.
- Gemini path uses `responseMimeType: application/json`.
- OpenAI/OpenRouter path uses `response_format: json_object` **or** a stream that is then regex-parsed (`extractAndParseJson`).
- On parse failure, `PlanValidator.createFallbackPlan` takes over with keyword regex.

Effects:

- Weak / free models (default `gpt-oss-20b:free`) produce invalid JSON constantly.
- Each ReAct step costs a full extra completion.
- Native parallel tool calls are impossible.
- The model cannot “just search then browse then extract” in one turn.

`getOpenAIToolDefinitions()` and `getGeminiToolDeclarations()` are unused.

### P0 — Browser is a costume

`server/browser/provider.ts` → `LiveBrowserSession`:

```ts
if (hasRemoteCdp && playwrightChromium) {
  this.delegate = new PlaywrightChromiumSession(config);
} else {
  this.delegate = new HttpFallbackBrowserSession(config);  // THIS is production
}
```

On Vercel there is no Chromium and (unless you set it) no `BROWSER_WS_ENDPOINT`. So production is HTTP fallback:

- “Screenshots” are **hand-drawn SVGs** (`generateVisualSnapshotSvg`), not pixels.
- `click` tries a regex on HTML; if it misses, it **returns success anyway**.
- `type` writes to an in-memory `formState` object. Nothing is typed in a page.
- `evaluate` returns `{ evaluated: true, scriptLength }` and does not run JS.
- `scroll` is a no-op that reports success.
- Instagram / LinkedIn / Cloudflare pages are detected as blocked, then the loop continues as if research happened.

The Live Browser panel in the UI is showing a **generated illustration**, not a real viewport.

### P0 — 60 second serverless ceiling

`vercel.json`:

```json
"api/index.ts": { "maxDuration": 60 }
```

A real agent task (search 20 companies → visit sites → extract emails → write proposals) needs minutes. At 60s the function dies mid-loop. Checkpoints exist (`taskCheckpointManager`) but the UI does not resume them on the next request except via a lucky same-`taskId` path. Users see “thinking…” then nothing.

### P1 — Default model is too weak for this architecture

Frontend default in `src/context/AgentContext.tsx`:

```
openrouter / openai/gpt-oss-20b:free
```

That model is free, small, and bad at strict JSON. The brain *depends* on strict JSON. This combination guarantees fallback-to-regex behavior.

Also `server/app.ts` default Gemini id is `gemini-3.7-flash` (does not exist as of this audit). Brain Gemini fallback list is `gemini-2.5-flash`, `gemini-2.0-flash`, `gemini-1.5-flash`. Inconsistent, so first Gemini calls 404.

### P1 — Heuristic brain still drives the loop

Even when LLM planning “works”, `PlanValidator` and `getDeterministicNextPipelineAction` re-interpret the task as:

```
find_businesses → verify_website → find_contact → generate_proposal → send_email
```

Query variations in the heuristic loop include hardcoded:

```
bakeries and cafes in ${location}
contractors and plumbers in ${location}
```

Ask it to “debug this TypeScript error” or “rewrite my landing page” and it will still try `google_search` / `search_businesses`. The product is welded to lead-gen.

### P1 — HTML scraping of Google/Bing/DDG

`server/research/googleSearch.ts` fetches `google.com/search?q=...` HTML with a 3.5s timeout and regexes class names (`MjjYud`, `tF2Cxc`, `VwiC3b`). Google blocks datacenter IPs and rotates DOM. Failures are swallowed (`catch { /* silent */ }`). Result: empty candidate lists, then a “Not found / Not publicly listed” report that looks like the agent worked.

No official Search API (SerpAPI, Google CSE, Tavily, Brave) is wired.

### P1 — Observations are truncated and regex-extracted

Browser text is sliced to 1.5–4k chars. Facts are regexes:

- emails
- phones
- `extractFoundersFromText`
- `extractPricingFromText`
- `our services|we offer|...`

The model never sees the full page. It cannot reason about layout, JS content, or screenshots (the JPEG from Playwright is not fed back into a vision model anyway).

### P1 — Forced report format

`getFinalSynthesisSystemPrompt()` requires five sections:

```
### Result
### Summary
### Evidence
### Sources
### Limitations
```

Every agent reply becomes a research memo. Fine for lead-gen. Terrible for “send this email”, “what’s 2+2”, or “fix the bug”.

### P2 — Duplicate / dead systems

| Dead / duplicate | Why it hurts |
|---|---|
| `oldOrchestrateAgentTask` (~1.5k lines) | Two sources of truth for lead-gen |
| `runAutonomousAgentLoop` | Third ReAct implementation |
| `classifyTask` + `SPECIFIC_INDUSTRIES` | Keyword classifier unused on live path |
| `getOpenAIToolDefinitions` | Native tools implemented, never attached |
| `get_current_datetime` in `tools.ts` but not in `BRAIN_AVAILABLE_TOOLS` | Schema drift |
| `taskPlanner/*` vs `agent/brain/*` | Two planners, two memories, two evaluators |

### P2 — Email send can fire from the heuristic pipeline

`getDeterministicNextPipelineAction` will call `send_email` if `plan.emailActionsRequired` is true (regex on “send / dispatch / outreach / bhejo”). There is no extra human confirm in that brain path (the old orchestrator had a review step; the new one does not always). Combined with a confused plan, this is a real outreach risk.

### P2 — Frontend SSE is lossy

`AgentContext.submitPrompt` handles a subset of event types. Brain emits `task.plan_created`, `task.resumed`, `task.replanning`, `task.synthesizing`, `task.candidates_discovered`. Those are ignored, so the activity UI looks stuck even when the brain is working.

`message.completed` **replaces** accumulated text. If synthesis streams deltas and then completed with a shorter fallback, the user loses the good answer.

### P2 — No computer, no code, no files

There is no `read_file`, `write_file`, `bash`, `git`, `apply_patch`. The website cannot edit its own repo, run tests, or ship a PR. Comparing it to this Arena session is comparing a CRM scraper to a software engineer.

---

## 5. What *is* actually solid

Do not throw the whole repo away. These parts are real:

- Express + Vite + SSE chat path is coherent.
- Per-user AES-256-GCM API keys in Neon, Firebase auth, chat persistence.
- Failover manager across 8 providers.
- Normal chat path (`server/chat/normalChat.ts`) is a clean conversational brain — it just must not be the only path.
- Website audit via live HTTP (status, SSL, viewport, emails, phones) is a legitimate tool.
- Checkpoint manager idea is correct (resume after crash) — it needs a host that lives longer than 60s.
- Tests exist (`server/agent/brain/*.test.ts`, planner, research, browser, gmail). Coverage is of the *intended* design, not of production Playwright/Vercel reality.

---

## 6. Recommended rebuild (minimum to feel “alive”)

Do these in order. Do not add more planners.

### Step 1 — Kill the slash gate

Route by model intent, not `/`.

- If the model wants tools, run tools.
- Keep `/` as an optional “force agent” hint, not a requirement.

### Step 2 — Native tool calling, one loop

Delete JSON-plan / JSON-evaluate / JSON-replan.

One loop:

```
messages + tool schemas
  → provider.streamChat({ tools })
  → if tool_calls: execute, append tool results, continue
  → if text: stream to user, stop
```

Use the schemas you already wrote in `server/tools.ts`. Cap at 25–40 steps, not 15 JSON roundtrips.

### Step 3 — Real browser or honest HTTP

Pick one:

- **A.** Browserless / Browserbase / Steel CDP (`BROWSER_WS_ENDPOINT`) + Playwright, required in production.
- **B.** Drop the “Live Browser” theatre. Call it “Fetch page” and show extracted HTML/text.

Never show an SVG and label it a live session.

### Step 4 — Real search API

Replace Google HTML scraping with Brave / Tavily / Serper / Google CSE. Keep DDG as fallback only.

### Step 5 — Leave Vercel for agent runs

Chat UI can stay on Vercel. Agent loop needs:

- a Node worker (Railway, Fly, Render, or a long-lived VM)
- 5–10 minute timeout
- optional Chromium

Wire `taskCheckpointManager` to resume from that worker.

### Step 6 — Default to a frontier model

`gemini-2.5-flash` or `gpt-4o-mini` / `claude-3-5-haiku` as default. Free 20B OSS as an *option*, not the default planner.

### Step 7 — Delete the zombie brains

Keep **one** of:

- `decisionEngine.ts` rewritten as native tool loop, or
- a thin `while (tool_calls)` in `orchestrateAgentTask`

Remove `oldOrchestrateAgentTask`, `autonomousBrain.ts` loop, and the unused `classifyTask` path (or keep `classifyTask` only as a fast lead-gen *skill*, not the whole agent).

### Step 8 — Tools that match the product

If the product is lead-gen, say so. Ship 6 sharp tools:

1. `web_search`
2. `fetch_page` / real `browser_*`
3. `search_businesses`
4. `analyze_website`
5. `draft_proposal`
6. `send_email` (**always confirm**)

If the product is “general AI agent”, you need filesystem + shell + git, which this Vercel app cannot host. That is a different product.

---

## 7. File map (for the next engineer)

| Path | Role | Health |
|---|---|---|
| `src/context/AgentContext.tsx` | Chat client, SSE | Works; misses several event types |
| `src/components/chat/ChatWorkspace.tsx` | Composer, `/` UX | Honest about slash; still a trap |
| `server/app.ts` | API + SSE | OK; 60s host |
| `server/agent.ts` | Router + dead old orchestrator | Mixed |
| `server/agent/modeRouter.ts` | Slash gate | Blocks the product |
| `server/agent/brain/*` | JSON ReAct | Over-engineered, wrong primitive |
| `server/taskPlanner/*` | Fallback planner | Duplicate |
| `server/agent/autonomousBrain.ts` | Unused ReAct | Delete |
| `server/tools.ts` | Real tool implementations | Partial; native defs unused |
| `server/browser/provider.ts` | Playwright + HTTP fake | Fake in prod |
| `server/research/googleSearch.ts` | HTML scrape search | Fragile |
| `server/chat/normalChat.ts` | Conversational path | Fine |
| `vercel.json` | 60s functions | Too short for agents |

---

## 8. Bottom line

SanMine has the **costume** of an agent (activity steps, live browser panel, “Universal Brain”, ReAct comments) and the **body** of a chat app plus HTML fetchers plus proposal templates.

It cannot perform like this Arena agent because:

1. It is not connected to a computer.
2. The model is not allowed to call tools natively.
3. Most users never even enter agent mode (`/` gate).
4. The browser and search layers lie when they fail.
5. The host dies in 60 seconds.

Fix the loop, the tools, the runtime, and the gate — or stop marketing it as a general autonomous agent and position it as a **local-business research + outreach copilot**, which is the one job the code was actually written for.
