// Shared helpers for checks.

/**
 * Run a global regex over mask[from..to) and call back with absolute offsets.
 * Regexes are shared module-level constants, so lastIndex is always reset here.
 */
export function scan(mask, from, to, regex, handler) {
  const slice = mask.slice(from, to);
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(slice)) !== null) {
    handler({ match: m[0], groups: m, from: from + m.index, to: from + m.index + m[0].length });
    if (m[0].length === 0) regex.lastIndex += 1;
  }
}

/** The mask text of a sentence, whitespace collapsed. Offsets are NOT preserved. */
export function sentenceText(doc, sentence) {
  return doc.mask.slice(sentence.start, sentence.end).replace(/\s+/g, ' ').trim();
}

/** First index of `needle` inside mask[from..to), case-insensitive. -1 if absent. */
export function indexOf(mask, from, to, needle) {
  const slice = mask.slice(from, to).toLowerCase();
  const at = slice.indexOf(needle.toLowerCase());
  return at === -1 ? -1 : from + at;
}

export const SEVERITY_ORDER = { error: 3, warn: 2, info: 1 };

export function severityAtLeast(severity, threshold) {
  return (SEVERITY_ORDER[severity] || 0) >= (SEVERITY_ORDER[threshold] || 0);
}

/**
 * Drop matches that overlap an earlier, longer match from the same check.
 * "due to the fact that" and "the fact that" both match; only the first should
 * be reported. Applied per check, never across checks.
 */
export function withoutOverlaps(findings) {
  const sorted = [...findings].sort((a, b) => a.from - b.from || (b.to - b.from) - (a.to - a.from));
  const kept = [];
  let lastTo = -1;
  for (const f of sorted) {
    if (f.from >= lastTo) {
      kept.push(f);
      lastTo = f.to;
    }
  }
  return kept;
}
