// Output. Four formats, because the four audiences are genuinely different:
// a human reading a terminal, an editor parsing lines, a CI job posting a
// comment, and a script.

import { CHECKS } from './checks/index.js';
import { easeLabel } from './syllables.js';

const RESET = '\u001b[0m';

// An underline wider than the terminal wraps and stops pointing at anything.
const MAX_CARETS = 56;

export function makePalette(useColor) {
  if (!useColor) {
    const id = (s) => s;
    return {
      reset: '', dim: id, bold: id, red: id, yellow: id, blue: id, green: id,
      underline: id, severity: () => id,
    };
  }
  const wrap = (code) => (s) => `\u001b[${code}m${s}${RESET}`;
  const severity = (level) => ({ error: wrap('31'), warn: wrap('33'), info: wrap('36') }[level] || wrap('37'));
  return {
    reset: RESET,
    dim: wrap('2'),
    bold: wrap('1'),
    red: wrap('31'),
    yellow: wrap('33'),
    blue: wrap('34'),
    green: wrap('32'),
    underline: wrap('4'),
    severity,
  };
}

const SEVERITY_NOUN = { error: 'error', warn: 'warning', info: 'note' };

export function countSeverities(results) {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const r of results) {
    for (const f of r.findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  }
  return counts;
}

function tallyPhrase(counts) {
  const parts = [];
  for (const level of ['error', 'warn', 'info']) {
    if (!counts[level]) continue;
    const noun = SEVERITY_NOUN[level];
    parts.push(`${counts[level]} ${counts[level] === 1 ? noun : `${noun}s`}`);
  }
  return parts.length ? parts.join(', ') : 'nothing hiding';
}

function metricsLine(results) {
  const files = results.filter((r) => r.metrics);
  if (!files.length) return '';
  const words = files.reduce((a, r) => a + r.metrics.words, 0);
  const sentences = files.reduce((a, r) => a + r.metrics.sentences, 0);
  const avg = sentences ? Math.round((words / sentences) * 10) / 10 : 0;

  const longest = files.reduce(
    (best, r) => (r.metrics.longestSentence && (!best || r.metrics.longestSentence.words > best.words)
      ? { ...r.metrics.longestSentence, file: r.file }
      : best),
    null,
  );

  const eases = files.map((r) => r.metrics.readingEase).filter((n) => n !== null);
  const ease = eases.length ? Math.round(eases.reduce((a, b) => a + b, 0) / eases.length) : null;
  const label = ease === null ? '' : ` · reading ease ${ease} (${easeLabel(ease)})`;

  const longestPart = longest ? ` · longest sentence ${longest.words} words (${shortName(longest.file)}:${longest.line})` : '';
  return `${words} words · ${sentences} sentences · avg ${avg}${longestPart}${label}`;
}

function shortName(file) {
  const parts = file.split('/');
  return parts.length > 3 ? parts.slice(-2).join('/') : file;
}

export function formatHuman(results, opts = {}) {
  const c = makePalette(opts.color);
  const out = [];
  const counts = countSeverities(results);
  const shown = results.filter((r) => r.findings.length || r.error);

  for (const r of shown) {
    out.push(c.bold(r.file));
    if (r.error) {
      out.push(`  ${c.red('error')}  ${r.error}`);
      out.push('');
      continue;
    }
    for (const f of r.findings) {
      const where = `${f.line}:${f.col}`;
      const sev = c.severity(f.severity)(f.severity.padEnd(5));
      out.push(`  ${c.dim(where.padEnd(8))}${sev} ${c.dim(f.checkId)}`);
      out.push(`         ${f.message}`);
      if (!opts.quiet) {
        out.push(`    ${c.dim('>')} ${c.dim(f.snippet.text)}`);
        const span = Math.max(1, f.snippet.caretEnd - f.snippet.caretStart);
        const carets = '^'.repeat(Math.min(span, MAX_CARETS));
        out.push(`      ${' '.repeat(f.snippet.caretStart)}${c.severity(f.severity)(carets)}`);
        if (f.note) out.push(`         ${c.dim(f.note)}`);
      }
      out.push('');
    }
  }

  const fileWord = results.length === 1 ? 'file' : 'files';
  out.push(c.bold(`${results.length} ${fileWord} · ${tallyPhrase(counts)}`));
  const metrics = metricsLine(results);
  if (metrics) out.push(c.dim(metrics));

  return `${out.join('\n')}\n`;
}

/** One line per finding, grep-able. This is the format editors should use. */
export function formatConcise(results) {
  const out = [];
  for (const r of results) {
    if (r.error) {
      out.push(`${r.file}:0:0: error [grain] ${r.error}`);
      continue;
    }
    for (const f of r.findings) {
      out.push(`${r.file}:${f.line}:${f.col}: ${f.severity} [${f.checkId}] ${f.message}`);
    }
  }
  return out.length ? `${out.join('\n')}\n` : '';
}

export function formatJson(results) {
  return `${JSON.stringify(
    {
      version: 1,
      summary: countSeverities(results),
      files: results.map((r) => ({
        file: r.file,
        error: r.error || null,
        metrics: r.metrics || null,
        findings: (r.findings || []).map((f) => ({
          check: f.checkId,
          severity: f.severity,
          title: f.title,
          message: f.message,
          note: f.note || null,
          line: f.line,
          column: f.col,
          from: f.from,
          to: f.to,
          snippet: f.snippet.text,
        })),
      })),
    },
    null,
    2,
  )}\n`;
}

export function formatMarkdown(results, opts = {}) {
  const counts = countSeverities(results);
  const out = ['## grain', '', `**${tallyPhrase(counts)}** across ${results.length} file(s).`, ''];

  for (const r of results) {
    if (!r.findings.length) continue;
    out.push(`### \`${r.file}\``, '');
    out.push('| Line | Severity | Check | Finding |');
    out.push('| --- | --- | --- | --- |');
    for (const f of r.findings) {
      const message = f.message.replace(/\|/g, '\\|');
      out.push(`| ${f.line}:${f.col} | ${f.severity} | \`${f.checkId}\` | ${message} |`);
    }
    out.push('');
  }

  if (!results.some((r) => r.findings.length)) {
    out.push('Nothing hiding.', '');
  }

  const metrics = metricsLine(results);
  if (metrics) out.push(`_${metrics}_`, '');
  return `${out.join('\n')}`;
}

export function formatWhy(onlyId) {
  const checks = onlyId ? CHECKS.filter((c) => c.id === onlyId) : CHECKS;
  const out = [];
  for (const check of checks) {
    out.push(`${check.id}  (${check.severity}) — ${check.title}`);
    out.push('');
    out.push(wrap(check.why, 78).replace(/^/gm, '  '));
    out.push('');
    for (const ex of check.examples || []) {
      out.push(`  ${'instead of'.padEnd(11)} ${ex.bad}`);
      out.push(`  ${'write'.padEnd(11)} ${ex.good}`);
      out.push('');
    }
  }
  return `${out.join('\n')}`;
}

export function formatList() {
  const rows = CHECKS.map((c) => [c.id, c.severity, c.scope, c.title]);
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i].length)));
  const out = [`${'CHECK'.padEnd(widths[0])}  ${'LEVEL'.padEnd(widths[1])}  ${'SCOPE'.padEnd(widths[2])}  WHAT IT LOOKS FOR`];
  for (const [id, severity, scope, title] of rows) {
    out.push(`${id.padEnd(widths[0])}  ${severity.padEnd(widths[1])}  ${scope.padEnd(widths[2])}  ${title}`);
  }
  out.push('');
  out.push('grain --why <check>   explain a check, with examples');
  return `${out.join('\n')}\n`;
}

export function wrap(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.join('\n');
}
