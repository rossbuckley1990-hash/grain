import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { globToRegex, isIgnored, loadConfig, collectFiles, DEFAULTS } from '../src/config.js';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'grain-cfg-'));
}

test('glob matches a bare name anywhere in the tree', () => {
  const re = globToRegex('*.min.js');
  assert.ok(re.test('a.min.js'));
  assert.ok(re.test('vendor/deep/a.min.js'));
  assert.ok(!re.test('a.js'));
});

test('glob anchors when the pattern contains a slash', () => {
  const re = globToRegex('docs/*.md');
  assert.ok(re.test('docs/a.md'));
  assert.ok(!re.test('docs/sub/a.md'));
  assert.ok(!re.test('other/a.md'));
});

test('globstar crosses directory boundaries', () => {
  const re = globToRegex('vendor/**');
  assert.ok(re.test('vendor/a.md'));
  assert.ok(re.test('vendor/a/b/c.md'));
});

test('? matches one non-separator character', () => {
  const re = globToRegex('a?.md');
  assert.ok(re.test('ab.md'));
  assert.ok(!re.test('abc.md'));
  assert.ok(!re.test('a/.md'));
});

test('regex metacharacters in a pattern are escaped', () => {
  assert.ok(globToRegex('a+b.md').test('a+b.md'));
  assert.ok(!globToRegex('a+b.md').test('aab.md'));
});

test('isIgnored normalises path separators', () => {
  const patterns = [globToRegex('vendor/**')];
  assert.ok(isIgnored(path.join('vendor', 'a.md'), patterns));
});

test('loadConfig falls back to defaults with no config file', () => {
  const dir = tmp();
  const config = loadConfig({ cwd: dir });
  assert.equal(config.configPath, null);
  assert.deepEqual(config.skip, DEFAULTS.skip);
  assert.deepEqual(config.glossary, []);
  assert.ok(config.extensions.includes('.md'));
});

test('loadConfig reads .grainrc.json', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '.grainrc.json'), JSON.stringify({
    skip: ['hedge'],
    glossary: ['kubernetes', 'etcd'],
    severity: { 'long-sentence': 'error' },
  }));
  const config = loadConfig({ cwd: dir });
  assert.deepEqual(config.skip, ['hedge']);
  assert.deepEqual(config.glossary, ['kubernetes', 'etcd']);
  assert.equal(config.severity['long-sentence'], 'error');
});

test('loadConfig finds a config in a parent directory', () => {
  const dir = tmp();
  const nested = path.join(dir, 'a', 'b');
  fs.mkdirSync(nested, { recursive: true });
  fs.writeFileSync(path.join(dir, '.grainrc.json'), JSON.stringify({ glossary: ['inherited'] }));
  assert.deepEqual(loadConfig({ cwd: nested }).glossary, ['inherited']);
});

test('loadConfig reports a broken config file clearly', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '.grainrc.json'), '{ not json');
  assert.throws(() => loadConfig({ cwd: dir }), /could not read .*\.grainrc\.json/);
});

test('loadConfig reads .grainignore', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, '.grainignore'), '# a comment\nvendor/**\n');
  const config = loadConfig({ cwd: dir });
  assert.ok(isIgnored('vendor/a.md', config.ignore));
});

test('collectFiles walks a directory and filters by extension', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'README.md'), '# hello');
  fs.writeFileSync(path.join(dir, 'docs', 'guide.md'), 'guide');
  fs.writeFileSync(path.join(dir, 'docs', 'notes.txt'), 'notes');
  fs.writeFileSync(path.join(dir, 'main.go'), 'package main');
  fs.writeFileSync(path.join(dir, 'src', 'app.js'), 'code');

  const config = loadConfig({ cwd: dir });
  const files = collectFiles([dir], config, dir).map((f) => path.relative(dir, f));

  // .go and .js are not prose extensions, so they are not collected.
  assert.deepEqual(files.sort(), [
    'README.md',
    path.join('docs', 'guide.md'),
    path.join('docs', 'notes.txt'),
  ]);
});

test('collectFiles skips node_modules and .git', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'node_modules', 'pkg', 'readme.md'), 'x');
  fs.writeFileSync(path.join(dir, '.git', 'COMMIT.md'), 'x');
  fs.writeFileSync(path.join(dir, 'real.md'), 'x');

  const files = collectFiles([dir], loadConfig({ cwd: dir }), dir).map((f) => path.relative(dir, f));
  assert.deepEqual(files, ['real.md']);
});

test('collectFiles honours ignore patterns from config', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'vendor'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'vendor', 'dep.md'), 'x');
  fs.writeFileSync(path.join(dir, 'keep.md'), 'x');
  fs.writeFileSync(path.join(dir, '.grainrc.json'), JSON.stringify({ ignore: ['vendor/**'] }));

  const files = collectFiles([dir], loadConfig({ cwd: dir }), dir).map((f) => path.relative(dir, f));
  assert.deepEqual(files, ['keep.md']);
});

test('collectFiles accepts an explicit file even if it is ignored', () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'skipme.md'), 'x');
  fs.writeFileSync(path.join(dir, '.grainrc.json'), JSON.stringify({ ignore: ['skipme.md'] }));

  const target = path.join(dir, 'skipme.md');
  assert.deepEqual(collectFiles([target], loadConfig({ cwd: dir }), dir), [target]);
});

test('collectFiles reports a missing path clearly', () => {
  assert.throws(
    () => collectFiles(['/definitely/not/here.md'], loadConfig({ cwd: tmp() })),
    /no such file or directory/,
  );
});
