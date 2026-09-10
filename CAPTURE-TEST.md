# Capture Test — 8x Assignment

Status of automatic prompt/response capture for this submission.

## Tool and model

| | |
|---|---|
| **Tool** | Claude Code (VS Code extension, Claude Agent SDK harness) |
| **Model** | `claude-opus-5` |
| **Planning vs execution** | Same model does both. There is no planner/executor split. |
| **Effort level** | `high` |

The model name is not hardcoded into log entries. It is read per entry from
`message.model` in the session transcript, so if the model changes mid-build the
switch is visible in the log and in the frontmatter (which lists every distinct
model used in that session).

## Mechanism

Claude Code supports lifecycle hooks declared in `.claude/settings.json`. Two are
wired, and both fire on their own with nothing to remember:

| Event | Fires | Purpose |
|---|---|---|
| `UserPromptSubmit` | every prompt submitted | Appends the raw prompt to a pending sidecar immediately. |
| `Stop` | end of every turn | Rebuilds the session log from the session transcript. |

**Config file changed:** `.claude/settings.json`
**Script:** `.claude/hooks/capture.js`

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.js\" prompt" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/capture.js\" stop" }] }
    ]
  }
}
```

### How it works, and why it is built this way

`Stop` receives the path to the session transcript (`transcript_path`) on stdin.
Rather than blindly appending a line per event, the hook **re-derives the entire log
file from that transcript on every turn**. The transcript is the source of truth, so:

- prompts and responses can never drift out of pairing or order
- the two hooks cannot race each other into a garbled file
- an interrupted or resumed session still produces a correct log

Per turn it records the prompt verbatim, the final response, a UTC timestamp, and the
model. Explicitly excluded, per the brief: thinking blocks, tool calls, tool results,
and mid-turn narration. "Final response" is computed as the trailing run of assistant
text blocks not interrupted by a tool call — i.e. the closing message.

`UserPromptSubmit` exists as a safety net. Per the Claude Code docs, **`Stop` does not
fire on user interrupts**, so a prompt from a cancelled turn would otherwise be lost.
The sidecar (`.agent-logs/.pending-<session>.jsonl`) guarantees every prompt is on
disk the moment it is sent.

### Two repos

This submission is two repositories, frontend and backend. Both carry the hook, and
logs are written to `.agent-logs/` in **both** repos so either repo is independently
assessable. Each repo's log names itself in its own frontmatter (`project:`) rather
than inheriting the directory the session happened to start in.

## Where the canaries landed

```
.agent-logs/2026-09-10_09-11-51_1f27f20d-2ebc-48d4-862b-9eb67df2f755.md
```

Present identically in:

- `jobtask-cloneAmazon-frontend/.agent-logs/`
- `jobtask-cloneAmazon-backend/.agent-logs/`

## Canary 1 — session 1 (`1f27f20d`)

Proof the hooks fire **automatically**: this prompt was captured by
`UserPromptSubmit` with no manual step, written to the pending sidecar at the instant
it was submitted. Pasted raw from `.agent-logs/.pending-1f27f20d-....jsonl`:

```json
{"timestamp":"2026-09-10T09:19:29.939Z","session_id":"1f27f20d-2ebc-48d4-862b-9eb67df2f755","prompt":"no both are different repos fe and be and have logs on both aas they said its working?"}
```

The corresponding `Stop` hook then rewrote the session `.md` and both mirrors at
14:17:15 local, unprompted, at the end of that turn. Entry from the log, raw:

```
[LOG_ENTRY type=PROMPT num=1 session=1f27f20d]
timestamp: 2026-09-10T09:11:51.333Z
model: claude-opus-5

[ide_selection block of 158 lines omitted]

I have here frontend and backend i am applying for a job and i have to creafte amazon clone like this is what they have ssaid
```

## Canary 2 — second session

> **Pending.** To be filled in with the raw entry from a genuinely separate Claude Code
> session, confirming the hook is installed at the project level and not merely live in
> the session that created it.

## Verification of the exclusion rules

The extractor was tested against a transcript containing a thinking block, a tool call,
a tool result, and mid-turn narration alongside a real final response. Results:

```
PASS: no thinking, no tool results
PASS: no mid-turn narration
PASS: final response captured
```

## What I tried first that did not work

**1. Taking the last assistant text block as the final response.**
Claude Code emits assistant text in several blocks across a turn — narration between
tool calls, then the closing message. Taking the last block captured only the final
one-line sentence ("Let me test the extractor...") instead of the substantive reply.
Fixed by walking backwards over the trailing run of text blocks that no tool call
interrupts.

**2. Writing logs to the working directory.**
The session's primary working directory is a plain folder on the Desktop that is **not
a git repository** — the actual repos live under `Documents/GitHub/`. Logs written
there would have shipped with nothing. Fixed by mirroring every write into both repos'
`.agent-logs/`.

**3. Assuming a single `PROJECT` constant was fine.**
Because one hook writes into two repos, a single constant stamped the wrong project
name into one of them. The renderer now receives the destination's project name.

**4. Guarding `.gitignore` up front.**
`.agent-logs/` must ship. A framework scaffolder run later (`create-next-app` and
similar) appends its own ignore rules, so an explicit `!.agent-logs/` negation is
committed now, before any scaffolding, rather than discovered missing at the end.
