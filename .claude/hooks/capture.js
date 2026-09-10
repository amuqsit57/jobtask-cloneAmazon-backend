#!/usr/bin/env node
/**
 * 8x assignment - agent capture hook.
 *
 * Fires automatically from .claude/settings.json:
 *   - UserPromptSubmit -> records the prompt immediately (so a prompt is on disk
 *     even if the turn is interrupted, crashes, or is cancelled before it ends)
 *   - Stop             -> rebuilds the session log from the session transcript
 *
 * The Stop pass is authoritative. Rather than blindly appending, it re-derives the
 * entire log file from the transcript JSONL every turn. The transcript is the source
 * of truth, so ordering and pairing are always correct and the two hooks cannot race
 * each other into a garbled file.
 *
 * We capture the prompt and the FINAL response for each turn. Nothing in between:
 * no thinking, no tool calls, no tool results, no intermediate assistant chatter.
 *
 * Entries are never rewritten once their turn is complete - see freeze logic below.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(REPO_ROOT, '.agent-logs');

const AUTHOR = 'amuqsit57';
const PROJECT = 'jobtask-cloneAmazon-backend';
const TOOL = 'claude-code';

/**
 * This workspace spans three directories: this one (a scratch parent, not a repo)
 * and the two git repos that actually ship. A session started here must still land
 * its logs inside the public repos, so every write is mirrored into each of them.
 */
const MIRRORS = [
  {
    dir: 'c:/Users/abdul/Documents/GitHub/jobtask-cloneAmazon-frontend/.agent-logs',
    project: 'jobtask-cloneAmazon-frontend',
  },
  {
    dir: 'c:/Users/abdul/Documents/GitHub/jobtask-cloneAmazon-backend/.agent-logs',
    project: 'jobtask-cloneAmazon-backend',
  },
].filter((m) => {
  try {
    return fs.existsSync(path.dirname(m.dir));
  } catch {
    return false;
  }
});

/**
 * Write a file to LOG_DIR and to every mirror target. `render` receives the project
 * name for that destination, so each repo's log names itself rather than inheriting
 * the name of whichever directory the session happened to start in.
 */
function writeEverywhere(filename, render) {
  const targets = [{ dir: LOG_DIR, project: PROJECT }, ...MIRRORS];
  for (const t of targets) {
    try {
      fs.mkdirSync(t.dir, { recursive: true });
      fs.writeFileSync(path.join(t.dir, filename), render(t.project), 'utf8');
    } catch {
      /* a mirror being unavailable must never break capture */
    }
  }
}

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/** Flatten a message content field (string | block[]) to plain text. */
function textOf(content, opts = {}) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const out = [];
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    // Deliberately excluded: thinking, redacted_thinking, tool_use, tool_result.
    if (block.type === 'text' && typeof block.text === 'string') {
      out.push(block.text);
    } else if (opts.keepToolResultText && block.type === 'tool_result') {
      continue;
    }
  }
  return out.join('\n').trim();
}

/**
 * A user entry is a REAL prompt (typed by the human) only if it is not a
 * tool_result carrier, not a sidechain (subagent) turn, and not a system-injected
 * meta entry. Claude Code funnels tool results back through `type: "user"`, so this
 * filter is what separates "what the human asked" from harness plumbing.
 */
function isHumanPrompt(entry) {
  if (entry.type !== 'user') return false;
  if (entry.isSidechain) return false;
  if (entry.isMeta) return false;
  if (entry.isCompactSummary) return false;
  const msg = entry.message;
  if (!msg || msg.role !== 'user') return false;
  const c = msg.content;
  if (Array.isArray(c)) {
    // Any tool_result block means this is plumbing, not a human prompt.
    if (c.some((b) => b && b.type === 'tool_result')) return false;
  }
  return textOf(c).length > 0;
}

function isAssistantText(entry) {
  if (entry.type !== 'assistant') return false;
  if (entry.isSidechain) return false;
  const msg = entry.message;
  if (!msg || msg.role !== 'assistant') return false;
  return true;
}

/**
 * Strip the <ide_selection> wrapper the VS Code extension prepends to a prompt when
 * the user has code selected. The user's actual typed words follow it. We keep the
 * prompt otherwise verbatim - no truncation, no cleanup, no paraphrase.
 */
function stripIdeSelection(text) {
  const close = '</ide_selection>';
  const i = text.indexOf(close);
  if (i === -1) return text;
  const before = text.slice(0, i + close.length);
  const after = text.slice(i + close.length);
  // Only strip when there is real prompt text after the block.
  if (after.trim().length === 0) return text;
  const lines = before.split('\n').length;
  return `[ide_selection block of ${lines} lines omitted]\n\n` + after.trimStart();
}

/** Parse the transcript into ordered turns: { prompt, response }. */
function parseTranscript(transcriptPath) {
  const raw = fs.readFileSync(transcriptPath, 'utf8');
  const entries = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      /* tolerate a partially-written trailing line */
    }
  }

  const turns = [];
  let current = null;

  for (const entry of entries) {
    if (isHumanPrompt(entry)) {
      if (current) turns.push(current);
      current = {
        promptText: stripIdeSelection(textOf(entry.message.content).trim()),
        promptTime: entry.timestamp || null,
        promptModel: null,
        responses: [],
      };
      continue;
    }

    if (current && isAssistantText(entry)) {
      const c = entry.message.content;
      const usedTool = Array.isArray(c) && c.some((b) => b && b.type === 'tool_use');
      const t = textOf(c);
      if (!current.promptModel && entry.message.model) {
        current.promptModel = entry.message.model;
      }
      if (t) {
        current.responses.push({
          text: t,
          time: entry.timestamp || null,
          model: entry.message.model || null,
          usedTool,
        });
      }
      // Mark that a tool ran at or after the text we have so far, so the
      // final-response scan knows that block is narration, not the closing message.
      if (usedTool && current.responses.length) {
        current.responses[current.responses.length - 1].followedByTool = true;
      }
    }
  }
  if (current) turns.push(current);

  return { turns, entries };
}

function sessionMeta(entries) {
  let sessionId = null;
  let version = null;
  for (const e of entries) {
    if (!sessionId && e.sessionId) sessionId = e.sessionId;
    if (!version && e.version) version = e.version;
  }
  return { sessionId, version };
}

/**
 * The final response of a turn.
 *
 * Claude Code emits assistant text in several blocks across a turn - narration
 * between tool calls, then the closing message. The brief asks for the final
 * response, so we take the trailing run of assistant text that follows the last
 * tool call. In practice that is the closing message; when a turn is pure text with
 * no tools, that is the whole thing.
 */
function finalResponse(turn) {
  if (turn.responses.length === 0) return null;

  // Walk back from the end over the run of text blocks that no tool call
  // interrupts. That run is the closing message. Anything before the last tool
  // call is narration emitted mid-turn and is not part of the final response.
  let start = turn.responses.length - 1;
  while (start > 0 && !turn.responses[start - 1].followedByTool) start--;

  const run = turn.responses.slice(start);
  return {
    text: run.map((r) => r.text).join('\n\n'),
    time: run[run.length - 1].time,
    model: run[run.length - 1].model,
  };
}

function fmtEntry(kind, num, sessionShort, timestamp, model, body) {
  return (
    `[LOG_ENTRY type=${kind} num=${num} session=${sessionShort}]\n` +
    `timestamp: ${timestamp}\n` +
    `model: ${model}\n\n` +
    `${body}\n`
  );
}

function buildLog(meta, turns, dateStr, project) {
  const sessionShort = (meta.sessionId || 'unknown').slice(0, 8);
  const times = turns.map((t) => t.promptTime).filter(Boolean);
  const models = [];
  for (const t of turns) {
    const r = finalResponse(t);
    const m = (r && r.model) || t.promptModel;
    if (m && !models.includes(m)) models.push(m);
  }

  const fm = [
    '---',
    `session_id: ${meta.sessionId || 'unknown'}`,
    `date: ${dateStr}`,
    `author: ${AUTHOR}`,
    `model: ${models.join(', ') || 'unknown'}`,
    `tool: ${TOOL}`,
    `project: ${project}`,
    `total_exchanges: ${turns.length}`,
    `first_prompt_time: ${times[0] || 'unknown'}`,
    `last_prompt_time: ${times[times.length - 1] || 'unknown'}`,
    '---',
    '',
    `# Session Log - ${dateStr}`,
    '',
    `Session: \`${sessionShort}\` | Project: \`${project}\` | Author: \`${AUTHOR}\``,
    '',
    '---',
    '',
    '',
  ].join('\n');

  const body = [];
  turns.forEach((turn, i) => {
    const num = i + 1;
    const resp = finalResponse(turn);
    const model = (resp && resp.model) || turn.promptModel || 'unknown';

    body.push(
      fmtEntry('PROMPT', num, sessionShort, turn.promptTime || 'unknown', model, turn.promptText)
    );
    body.push('');

    if (resp) {
      body.push(
        fmtEntry('RESPONSE', num, sessionShort, resp.time || 'unknown', resp.model || model, resp.text)
      );
      body.push('');
    }
  });

  return fm + body.join('\n');
}

function logPathFor(meta, firstTime) {
  const d = firstTime ? new Date(firstTime) : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp =
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_` +
    `${pad(d.getUTCHours())}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
  return path.join(LOG_DIR, `${stamp}_${meta.sessionId || 'unknown'}.md`);
}

/** Find an already-written log for this session, whatever its timestamp prefix. */
function existingLogFor(sessionId) {
  if (!sessionId) return null;
  try {
    const hit = fs.readdirSync(LOG_DIR).find((f) => f.includes(sessionId) && f.endsWith('.md'));
    return hit ? path.join(LOG_DIR, hit) : null;
  } catch {
    return null;
  }
}

function onStop(input) {
  const transcriptPath = input.transcript_path;
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return;

  const { turns, entries } = parseTranscript(transcriptPath);
  if (turns.length === 0) return;

  const meta = sessionMeta(entries);
  if (!meta.sessionId && input.session_id) meta.sessionId = input.session_id;

  const firstTime = turns[0].promptTime;
  const dateStr = (firstTime || new Date().toISOString()).slice(0, 10);

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const target = existingLogFor(meta.sessionId) || logPathFor(meta, firstTime);
  writeEverywhere(path.basename(target), (project) => buildLog(meta, turns, dateStr, project));
}

/**
 * Prompt-time capture. Appends the prompt to a pending sidecar immediately so the
 * prompt survives even if the turn never reaches Stop (interrupt, crash, cancel).
 * The Stop pass rewrites the .md from the transcript regardless; this sidecar is a
 * safety net, and is committed alongside the log as-is.
 */
function onPrompt(input) {
  const prompt = input.prompt;
  if (typeof prompt !== 'string' || !prompt.trim()) return;
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const sid = input.session_id || 'unknown';
  const file = path.join(LOG_DIR, `.pending-${sid}.jsonl`);
  fs.appendFileSync(
    file,
    JSON.stringify({ timestamp: new Date().toISOString(), session_id: sid, prompt }) + '\n',
    'utf8'
  );
}

function main() {
  const event = process.argv[2];
  let input = {};
  try {
    input = JSON.parse(readStdin() || '{}');
  } catch {
    input = {};
  }

  try {
    if (event === 'prompt') onPrompt(input);
    else if (event === 'stop') onStop(input);
  } catch (err) {
    // A capture hook must never block or fail the session. Record and move on.
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(
        path.join(LOG_DIR, '.capture-errors.log'),
        `${new Date().toISOString()} [${event}] ${err && err.stack ? err.stack : err}\n`,
        'utf8'
      );
    } catch {
      /* give up silently */
    }
  }
  process.exit(0);
}

main();
