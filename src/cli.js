import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { tokenize } from './tokenize.js';
import { runChecks, metrics as computeMetrics, getCheck, allCheckIds } from './checks/index.js';
import { loadConfig, collectFiles } from './config.js';
import { changedLines, findingTouchesLines, DiffError } from './diff.js';
import {
  formatHuman, formatConcise, formatJson, formatMarkdown,
  formatWhy, formatList, countSeverities, makePalette,
} from './report.js';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const FAIL_LEVELS = { never: 0, info: 1, warn: 2, error: 3 };

const VALUE_FLAGS = new Set(['--format', '--fail-on', '--only', '--skip', '--config']);
const BOOL_FLAGS = new Set([
  '--diff', '--staged', '--list', '--help', '--version', '--no-color', '--color',
  '--quiet', '--metrics', '--all',
]);

const HELP = `grain ${pkg.version} — find where your prose is hiding

Usage
  grain [options] [file|dir ...]     check files, or a directory recursively
  grain -                            read from stdin
  cat notes.md | grain

Teaching
  --list                             every check, one line each
  --why                              all checks explained, with examples
  --why <check-id>                   one check explained

Reviewing a change
  --diff                             only prose added in the working tree
  --diff=<base>                      only prose added since <base> (e.g. main)
  --staged                           only prose you are about to commit

Output
  --format <f>                       human (default) | concise | json | markdown
  --fail-on <level>                  exit non-zero at: error | warn | info | never
                                     default: warn
  --only <ids>                       run just these checks (comma separated)
  --skip <ids>                       skip these checks (comma separated)
  --metrics                          print per-file measurements
  --quiet                            findings without snippets
  --no-color

grain flags and explains. It never rewrites your prose -- a tool that writes
your sentences for you is a tool that stops you learning to write them.
`;

class UsageError extends Error {}

export function parseArgs(argv) {
  const opts = {
    inputs: [],
    format: 'human',
    failOn: 'warn',
    only: [],
    skip: [],
    diff: false,
    diffBase: null,
    staged: false,
    list: false,
    help: false,
    version: false,
    why: undefined,
    config: undefined,
    color: undefined,
    quiet: false,
    showMetrics: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--') {
      opts.inputs.push(...argv.slice(i + 1));
      break;
    }

    if (!arg.startsWith('-') || arg === '-') {
      opts.inputs.push(arg);
      continue;
    }

    const eq = arg.indexOf('=');
    const name = eq === -1 ? arg : arg.slice(0, eq);
    const inline = eq === -1 ? undefined : arg.slice(eq + 1);

    if (!VALUE_FLAGS.has(name) && !BOOL_FLAGS.has(name) && name !== '--why') {
      throw new UsageError(`unknown option ${name}`);
    }

    switch (name) {
      case '--help': opts.help = true; break;
      case '--version': opts.version = true; break;
      case '--list': opts.list = true; break;
      case '--diff':
        opts.diff = true;
        if (inline) opts.diffBase = inline;
        break;
      case '--staged': opts.staged = true; opts.diff = true; break;
      case '--no-color': opts.color = false; break;
      case '--color': opts.color = true; break;
      case '--quiet': opts.quiet = true; break;
      case '--metrics': opts.showMetrics = true; break;
      case '--why': {
        if (inline !== undefined) {
          opts.why = inline;
        } else {
          const next = argv[i + 1];
          if (next === undefined || next.startsWith('-')) {
            opts.why = null;
          } else if (getCheck(next)) {
            opts.why = next;
            i += 1;
          } else {
            // Silently treating this as a filename would print every check and
            // then lint a file that does not exist. Fail loudly instead.
            throw new UsageError(`--why: no check called "${next}". Run grain --list.`);
          }
        }
        break;
      }
      case '--format': {
        const value = inline ?? argv[++i];
        if (!['human', 'concise', 'json', 'markdown'].includes(value)) {
          throw new UsageError(`--format must be human, concise, json or markdown`);
        }
        opts.format = value;
        break;
      }
      case '--fail-on': {
        const value = inline ?? argv[++i];
        if (!(value in FAIL_LEVELS)) {
          throw new UsageError(`--fail-on must be error, warn, info or never`);
        }
        opts.failOn = value;
        break;
      }
      case '--only': {
        const value = inline ?? argv[++i];
        opts.only = splitIds(value, '--only');
        break;
      }
      case '--skip': {
        const value = inline ?? argv[++i];
        opts.skip = splitIds(value, '--skip');
        break;
      }
      case '--config':
        opts.config = inline ?? argv[++i];
        if (!opts.config) throw new UsageError('--config needs a path');
        break;
      default:
        throw new UsageError(`unknown option ${name}`);
    }
  }

  return opts;
}

function splitIds(value, flag) {
  if (!value) throw new UsageError(`${flag} needs a comma-separated list of check ids`);
  const ids = value.split(',').map((s) => s.trim()).filter(Boolean);
  const known = allCheckIds();
  for (const id of ids) {
    if (!known.includes(id)) {
      throw new UsageError(`${flag}: no check called "${id}". Run grain --list.`);
    }
  }
  return ids;
}

function repoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  } catch {
    throw new DiffError('not inside a git repository, so --diff has nothing to compare against');
  }
}

function readStdin() {
  return fs.readFileSync(0, 'utf8');
}

function displayPath(file, cwd) {
  const rel = path.relative(cwd, file);
  return rel && !rel.startsWith('..') ? rel : file;
}

function checkFile(file, source, opts, config, diffFilter, repoBase) {
  const doc = tokenize(source);
  let findings = runChecks(doc, { only: opts.only, skip: opts.skip, config });

  if (diffFilter) {
    const rel = repoBase ? path.relative(repoBase, file) : file;
    const lines = diffFilter.get(rel) || diffFilter.get(path.basename(file));
    findings = findings.filter((f) => findingTouchesLines(f, lines, source));
  }

  return { findings, metrics: computeMetrics(doc) };
}

function metricsBlock(results, palette) {
  const out = ['', palette.bold('measurements')];
  for (const r of results) {
    if (!r.metrics) continue;
    const m = r.metrics;
    const longest = m.longestSentence ? `${m.longestSentence.words} words (line ${m.longestSentence.line})` : '-';
    out.push(
      `  ${palette.dim(r.file)}`,
      `    ${String(m.words).padStart(5)} words · ${String(m.sentences).padStart(4)} sentences · avg ${String(m.avgSentenceLength).padStart(5)}`,
      `    longest ${longest} · reading ease ${m.readingEase === null ? 'n/a' : `${m.readingEase} (${m.readingEaseLabel})`}`,
    );
  }
  return `${out.join('\n')}\n`;
}

export async function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`grain: ${err.message}\n`);
    if (err instanceof UsageError) process.stderr.write('Run grain --help for usage.\n');
    return 2;
  }

  const useColor = opts.color ?? (process.stdout.isTTY && !process.env.NO_COLOR);
  const palette = makePalette(useColor);

  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (opts.version) {
    process.stdout.write(`${pkg.version}\n`);
    return 0;
  }
  if (opts.list) {
    process.stdout.write(formatList());
    return 0;
  }
  if (opts.why !== undefined) {
    if (opts.why && !getCheck(opts.why)) {
      process.stderr.write(`grain: no check called "${opts.why}". Run grain --list.\n`);
      return 2;
    }
    process.stdout.write(formatWhy(opts.why));
    return 0;
  }

  let config;
  try {
    config = loadConfig({ configPath: opts.config });
  } catch (err) {
    process.stderr.write(`grain: ${err.message}\n`);
    return 2;
  }

  const cwd = process.cwd();
  const readingStdin = opts.inputs.includes('-')
    || (opts.inputs.length === 0 && !process.stdin.isTTY && !opts.diff);

  if (!readingStdin && opts.inputs.length === 0 && !opts.diff) {
    process.stderr.write(HELP);
    return 2;
  }

  let diffFilter = null;
  let repoBase = null;
  if (opts.diff) {
    try {
      repoBase = repoRoot();
      diffFilter = changedLines({ staged: opts.staged, base: opts.diffBase, cwd: repoBase });
    } catch (err) {
      process.stderr.write(`grain: ${err.message}\n`);
      return err instanceof DiffError ? 2 : 3;
    }
  }

  let targets;
  try {
    if (readingStdin) {
      targets = [{ file: '<stdin>', source: readStdin() }];
    } else if (opts.inputs.length) {
      const realInputs = opts.inputs.filter((i) => i !== '-');
      targets = collectFiles(realInputs, config, cwd).map((file) => ({
        file,
        source: fs.readFileSync(file, 'utf8'),
      }));
    } else {
      // --diff with no explicit paths: check the files git says changed.
      const wanted = [...diffFilter.keys()]
        .filter((rel) => config.extensions.includes(path.extname(rel).toLowerCase()))
        .map((rel) => path.join(repoBase, rel));
      targets = wanted
        .filter((file) => fs.existsSync(file))
        .map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));
    }
  } catch (err) {
    process.stderr.write(`grain: ${err.message}\n`);
    return 2;
  }

  const results = [];
  for (const target of targets) {
    try {
      const { findings, metrics } = checkFile(target.file, target.source, opts, config, diffFilter, repoBase);
      results.push({ file: displayPath(target.file, cwd), findings, metrics });
    } catch (err) {
      results.push({ file: displayPath(target.file, cwd), findings: [], metrics: null, error: err.message });
    }
  }

  switch (opts.format) {
    case 'json': process.stdout.write(formatJson(results)); break;
    case 'concise': process.stdout.write(formatConcise(results)); break;
    case 'markdown': process.stdout.write(formatMarkdown(results)); break;
    default: process.stdout.write(formatHuman(results, { color: useColor, quiet: opts.quiet })); break;
  }

  if (opts.showMetrics) process.stdout.write(metricsBlock(results, palette));

  if (results.some((r) => r.error)) return 2;

  const counts = countSeverities(results);
  const threshold = FAIL_LEVELS[opts.failOn];
  let worst = 0;
  for (const level of ['info', 'warn', 'error']) {
    if (counts[level]) worst = Math.max(worst, FAIL_LEVELS[level]);
  }
  return worst >= threshold && threshold > 0 ? 1 : 0;
}
