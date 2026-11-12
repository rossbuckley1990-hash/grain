// git integration: restrict findings to prose you actually changed.
//
// This is what makes grain usable on a large existing repository. Running it
// over ten years of docs produces a wall of findings nobody will read. Running
// it over the diff produces four findings you will act on today.

import { execFileSync } from 'node:child_process';

export class DiffError extends Error {}

/**
 * @param {{ staged?: boolean, base?: string, cwd?: string }} options
 * @returns {Map<string, Set<number>>} repo-relative path -> added line numbers
 */
export function changedLines(options = {}) {
  const args = ['diff', '-U0', '--no-color', '--no-ext-diff', '--no-prefix'];
  if (options.staged) args.push('--cached');
  if (options.base) args.push(options.base);

  let out;
  try {
    out = execFileSync('git', args, {
      cwd: options.cwd,
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (err) {
    throw new DiffError(
      err.stderr?.trim()
        ? `git failed: ${err.stderr.trim()}`
        : `git failed: ${err.message}. Is this a git repository?`,
    );
  }

  const result = new Map();
  let current = null;

  for (const line of out.split('\n')) {
    if (line.startsWith('+++ ')) {
      const target = line.slice(4).trim();
      if (target === '/dev/null') {
        current = null;
        continue;
      }
      // --no-prefix gives plain paths; strip a/ or b/ if a git config adds them back.
      current = target.replace(/^[ab]\//, '');
      if (!result.has(current)) result.set(current, new Set());
      continue;
    }
    if (!current) continue;
    if (!line.startsWith('@@')) continue;

    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!hunk) continue;
    const start = Number(hunk[1]);
    const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
    const lines = result.get(current);
    for (let i = 0; i < count; i += 1) lines.add(start + i);
  }

  return result;
}

/** True when any line of the finding falls on a changed line. */
export function findingTouchesLines(finding, lines, source) {
  if (!lines || lines.size === 0) return false;
  let line = finding.line;
  if (lines.has(line)) return true;
  // A finding can span several lines (long-sentence, monotony).
  for (let i = finding.from; i < finding.to; i += 1) {
    if (source[i] === '\n') {
      line += 1;
      if (lines.has(line)) return true;
    }
  }
  return false;
}
