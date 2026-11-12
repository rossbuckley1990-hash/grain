// The check registry, and the runner that turns check output into findings
// with real line, column and snippet information.

import wordChecks from './words.js';
import sentenceChecks from './sentences.js';
import documentChecks, { metrics } from './document.js';
import { withoutOverlaps } from './helpers.js';

export const CHECKS = [...wordChecks, ...sentenceChecks, ...documentChecks];

const BY_ID = new Map(CHECKS.map((c) => [c.id, c]));

export function getCheck(id) {
  return BY_ID.get(id);
}

export function allCheckIds() {
  return CHECKS.map((c) => c.id);
}

export { metrics };

/**
 * Collapse source[from-context .. to+context] onto one display line, keeping a
 * map back to original offsets so the caret can underline the exact span.
 */
export function makeSnippet(source, from, to, context = 26) {
  let start = Math.max(0, from - context);
  let end = Math.min(source.length, to + context);
  while (start > 0 && !/\s/.test(source[start])) start -= 1;
  while (end < source.length && !/\s/.test(source[end])) end += 1;

  // entries[i] is one display character plus the source offset it came from,
  // so a caret span can be mapped back even after whitespace is collapsed.
  const entries = [];
  let pendingSpace = false;
  for (let i = start; i < end; i += 1) {
    if (/\s/.test(source[i])) {
      if (entries.length) pendingSpace = true;
      continue;
    }
    if (pendingSpace) {
      entries.push({ ch: ' ', offset: i });
      pendingSpace = false;
    }
    entries.push({ ch: source[i], offset: i });
  }

  const lead = start > 0 ? '\u2026' : '';
  const trail = end < source.length ? '\u2026' : '';
  const pad = lead.length;

  let caretStart = entries.findIndex((e) => e.offset >= from && e.ch !== ' ');
  if (caretStart === -1) caretStart = entries.findIndex((e) => e.ch !== ' ');
  if (caretStart === -1) caretStart = 0;

  let caretEnd = caretStart;
  while (caretEnd < entries.length && entries[caretEnd].offset < to) caretEnd += 1;
  while (caretEnd > caretStart && entries[caretEnd - 1].ch === ' ') caretEnd -= 1;
  if (caretEnd <= caretStart) caretEnd = Math.min(caretStart + 1, entries.length);

  return {
    text: lead + entries.map((e) => e.ch).join('') + trail,
    caretStart: caretStart + pad,
    caretEnd: caretEnd + pad,
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function collapse(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/**
 * @param {object} doc output of tokenize()
 * @param {{ only?: string[], skip?: string[], config?: object }} options
 * @returns {Array<object>} findings sorted by position
 */
export function runChecks(doc, options = {}) {
  const config = options.config || {};
  const severityOverrides = config.severity || {};
  const only = options.only && options.only.length ? new Set(options.only) : null;
  const skip = new Set([...(options.skip || []), ...(config.skip || [])]);

  const findings = [];
  for (const check of CHECKS) {
    if (skip.has(check.id)) continue;
    if (only && !only.has(check.id)) continue;

    const severity = severityOverrides[check.id] || check.severity;
    const collected = [];
    const ctx = { doc, config };

    if (check.scope === 'document') {
      collected.push(...check.run(ctx));
    } else {
      for (const sentence of doc.sentences) {
        collected.push(...check.run({ ...ctx, sentence }));
      }
    }

    for (const f of withoutOverlaps(collected)) {
      const from = clamp(f.from, 0, doc.source.length);
      const to = clamp(f.to, from, doc.source.length);
      const { line, col } = doc.locate(from);
      findings.push({
        checkId: check.id,
        severity,
        title: check.title,
        // Matches can span a hard-wrapped line, so collapse whitespace before
        // the matched text reaches a single-line message.
        message: collapse(f.message),
        note: f.note ? collapse(f.note) : undefined,
        from,
        to,
        line,
        col,
        snippet: makeSnippet(doc.source, from, to),
      });
    }
  }

  findings.sort((a, b) => a.from - b.from || a.checkId.localeCompare(b.checkId));
  return findings;
}
