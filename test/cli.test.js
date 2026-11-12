import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/grain.js', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grain-cli-'));
}

function grain(args, options = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    input: '',
    ...options,
  });
}

function git(args, cwd) {
  const result = spawnSync(
    'git',
    ['-c', 'user.name=grain test', '-c', 'user.email=grain@example.com', ...args],
    { cwd, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function write(dir, name, contents) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return file;
}

const DIRTY = 'It is important to note that we utilise the cache in order to make a decision.\n';
const CLEAN = 'The cache expires after sixty seconds. The worker reads it on every request.\n';

// help, version, teaching --------------------------------------------------

test('--help exits 0 and explains usage', () => {
  const r = grain(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Usage/);
  assert.match(r.stdout, /--diff/);
  assert.match(r.stdout, /never rewrites your prose/);
});

test('--version prints the package version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const r = grain(['--version']);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), pkg.version);
});

test('--list shows every check with its level', () => {
  const r = grain(['--list']);
  assert.equal(r.status, 0);
  for (const id of ['buried-verb', 'throat-clear', 'hidden-actor', 'monotony']) {
    assert.match(r.stdout, new RegExp(`^${id}\\s`, 'm'), `${id} should be listed`);
  }
});

test('--why explains one check', () => {
  const r = grain(['--why', 'buried-verb']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nominalisation/i);
  assert.match(r.stdout, /instead of/);
  assert.match(r.stdout, /write/);
});

test('--why with no id explains every check', () => {
  const r = grain(['--why']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /buried-verb/);
  assert.match(r.stdout, /monotony/);
});

test('--why=<id> inline form works', () => {
  assert.equal(grain(['--why=hedge']).status, 0);
});

test('--why rejects an unknown check', () => {
  const r = grain(['--why', 'not-a-check']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no check called/);
});

// argument handling -------------------------------------------------------

test('unknown option exits 2 with a clear message', () => {
  const r = grain(['--nope']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown option --nope/);
});

test('--only rejects an unknown check id', () => {
  const r = grain(['--only', 'nope', 'x.md']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no check called "nope"/);
});

test('--format rejects a bad format', () => {
  const r = grain(['--format', 'yaml']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--format must be/);
});

test('a missing file exits 2', () => {
  const r = grain(['./definitely-not-here.md']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /no such file or directory/);
});

// exit codes --------------------------------------------------------------

test('a dirty file exits 1', () => {
  const dir = tmp();
  const file = write(dir, 'dirty.md', DIRTY);
  assert.equal(grain([file]).status, 1);
});

test('a clean file exits 0', () => {
  const dir = tmp();
  const file = write(dir, 'clean.md', CLEAN);
  const r = grain([file]);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /nothing hiding/);
});

test('--fail-on never exits 0 even with findings', () => {
  const dir = tmp();
  const file = write(dir, 'dirty.md', DIRTY);
  const r = grain([file, '--fail-on', 'never']);
  assert.equal(r.status, 0);
  assert.ok(r.stdout.includes('inflated'), 'findings are still reported');
});

test('--fail-on error ignores warnings', () => {
  const dir = tmp();
  // DIRTY only produces warn/info findings, never error.
  const file = write(dir, 'dirty.md', DIRTY);
  assert.equal(grain([file, '--fail-on', 'error']).status, 0);
});

test('a config severity override can raise a finding to error', () => {
  const dir = tmp();
  write(dir, '.grainrc.json', JSON.stringify({ severity: { hedge: 'error' } }));
  const file = write(dir, 'notes.md', 'This is really quite fast and it is basically done.\n');
  const r = grain([file, '--fail-on', 'error'], { cwd: dir });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /error\s+hedge/);
});

// formats -----------------------------------------------------------------

test('--format json emits a stable machine-readable shape', () => {
  const dir = tmp();
  const file = write(dir, 'dirty.md', DIRTY);
  const r = grain([file, '--format', 'json']);
  const parsed = JSON.parse(r.stdout);

  assert.equal(parsed.version, 1);
  assert.ok(parsed.summary.warn >= 1);
  assert.equal(parsed.files.length, 1);

  const finding = parsed.files[0].findings.find((f) => f.check === 'inflated');
  assert.ok(finding, 'should report the inflated word');
  assert.equal(finding.severity, 'warn');
  assert.equal(finding.line, 1);
  assert.ok(finding.column > 0);
  assert.ok(finding.to > finding.from);
  assert.ok(parsed.files[0].metrics.words > 0);
});

test('--format concise emits editor-parseable lines', () => {
  const dir = tmp();
  const file = write(dir, 'dirty.md', DIRTY);
  const r = grain([file, '--format', 'concise']);
  const lines = r.stdout.trim().split('\n');
  assert.ok(lines.length >= 3);
  for (const line of lines) {
    assert.match(line, /^.+\.md:\d+:\d+: (error|warn|info) \[[a-z-]+\] .+/);
  }
});

test('--format markdown emits a table', () => {
  const dir = tmp();
  const file = write(dir, 'dirty.md', DIRTY);
  const r = grain([file, '--format', 'markdown']);
  assert.match(r.stdout, /^## grain$/m);
  assert.match(r.stdout, /\| Line \| Severity \| Check \| Finding \|/);
  assert.match(r.stdout, /`buried-verb`/);
});

test('--quiet drops snippets but keeps findings', () => {
  const dir = tmp();
  const file = write(dir, 'dirty.md', DIRTY);
  const r = grain([file, '--quiet']);
  assert.match(r.stdout, /inflated/);
  assert.ok(!r.stdout.includes('^'), 'no caret lines in quiet mode');
});

test('--metrics prints per-file measurements', () => {
  const dir = tmp();
  const file = write(dir, 'clean.md', CLEAN);
  const r = grain([file, '--metrics']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /measurements/);
  assert.match(r.stdout, /words/);
  assert.match(r.stdout, /reading ease/);
});

// input sources -----------------------------------------------------------

test('reads from stdin when given "-"', () => {
  const r = grain(['-'], { input: DIRTY });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /<stdin>/);
  assert.match(r.stdout, /inflated/);
});

test('reads from stdin when piped with no arguments', () => {
  const r = grain([], { input: CLEAN });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /<stdin>/);
});

test('empty stdin is not an error', () => {
  const r = grain(['-'], { input: '' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nothing hiding/);
});

test('a directory argument is walked recursively', () => {
  const dir = tmp();
  write(dir, 'docs/a.md', DIRTY);
  write(dir, 'docs/nested/b.md', CLEAN);
  write(dir, 'skip.go', 'package main');

  const r = grain([dir, '--format', 'concise']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /docs\/a\.md/);
  assert.ok(!r.stdout.includes('skip.go'), 'non-prose extensions are skipped');
});

test('--only and --skip select checks', () => {
  const dir = tmp();
  const file = write(dir, 'dirty.md', DIRTY);

  const only = grain([file, '--only', 'inflated', '--format', 'concise']);
  assert.match(only.stdout, /\[inflated\]/);
  assert.ok(!only.stdout.includes('[buried-verb]'));

  const skip = grain([file, '--skip', 'inflated,dead-weight,buried-verb,throat-clear', '--format', 'concise']);
  assert.ok(!skip.stdout.includes('[inflated]'));
});

// markdown awareness ------------------------------------------------------

test('never reports findings inside a code fence', () => {
  const dir = tmp();
  const file = write(dir, 'doc.md', [
    '# A clean heading',
    '',
    '```js',
    '// We utilise everything in order to make a decision here.',
    'const x = "really quite basically very";',
    '```',
    '',
    'Ordinary prose follows this block.',
    '',
  ].join('\n'));

  const r = grain([file]);
  assert.equal(r.status, 0, r.stdout);
});

test('reports prose around a code fence but not the fence', () => {
  const dir = tmp();
  const file = write(dir, 'doc.md', [
    'We utilise the cache here.',
    '',
    '```js',
    'utilize(nothing);',
    '```',
    '',
  ].join('\n'));

  const r = grain([file, '--format', 'concise']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /:1:\d+: warn \[inflated\]/);
  assert.equal(r.stdout.trim().split('\n').length, 1, 'only the prose line is reported');
});

// git integration ---------------------------------------------------------

test('--diff reports only prose added in the working tree', () => {
  const dir = tmp();
  git(['init', '-q', '-b', 'main'], dir);
  write(dir, 'notes.md', CLEAN);
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'initial'], dir);

  const clean = grain(['--diff'], { cwd: dir });
  assert.equal(clean.status, 0, clean.stdout);

  fs.appendFileSync(path.join(dir, 'notes.md'), `\n${DIRTY}`);

  const r = grain(['--diff'], { cwd: dir });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /inflated/);
  assert.match(r.stdout, /buried-verb/);
  assert.ok(!r.stdout.includes('sixty seconds'), 'unchanged prose must not be reported');
});

test('--staged reports only prose in the index', () => {
  const dir = tmp();
  git(['init', '-q', '-b', 'main'], dir);
  write(dir, 'notes.md', CLEAN);
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'initial'], dir);

  fs.appendFileSync(path.join(dir, 'notes.md'), `\n${DIRTY}`);
  assert.equal(grain(['--diff'], { cwd: dir }).status, 1, 'unstaged change is visible to --diff');
  assert.equal(grain(['--staged'], { cwd: dir }).status, 0, 'but not to --staged before git add');

  git(['add', '.'], dir);
  const r = grain(['--staged'], { cwd: dir });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /inflated/);
});

test('--diff with an explicit base compares against it', () => {
  const dir = tmp();
  git(['init', '-q', '-b', 'main'], dir);
  write(dir, 'notes.md', CLEAN);
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'initial'], dir);
  git(['checkout', '-q', '-b', 'feature'], dir);
  fs.appendFileSync(path.join(dir, 'notes.md'), `\n${DIRTY}`);
  git(['add', '.'], dir);
  git(['commit', '-q', '-m', 'prose'], dir);

  const r = grain(['--diff=main'], { cwd: dir });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /inflated/);
});

test('--diff outside a git repository explains itself', (t) => {
  const dir = tmp();
  const probe = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8' });
  if (probe.status === 0) {
    t.skip('temp dir is inside a git repository, cannot test the negative path');
    return;
  }
  const r = grain(['--diff'], { cwd: dir });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /not inside a git repository/);
});

// self-hosting ------------------------------------------------------------

test('grain passes its own default bar on this repository', () => {
  const targets = ['README.md'].filter((f) => fs.existsSync(path.join(ROOT, f)));
  if (!targets.length) return;
  const r = grain(targets, { cwd: ROOT });
  assert.equal(r.status, 0, `grain found warn-or-worse prose in its own docs:\n${r.stdout}`);
});
