import test from 'node:test';
import assert from 'node:assert/strict';

import { maskNonProse, tokenize, makeLocator } from '../src/tokenize.js';

test('mask preserves length and newline positions', () => {
  const source = '# Title\n\nSome prose with `code` inline.\n\n```js\nconst a = 1;\n```\n\nDone.\n';
  const mask = maskNonProse(source);
  assert.equal(mask.length, source.length);
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') assert.equal(mask[i], '\n', `newline at ${i} must survive masking`);
  }
});

test('mask blanks fenced code blocks', () => {
  const source = 'Prose here.\n\n```js\nutilize(inflatedWords);\n```\n\nMore prose.\n';
  const mask = maskNonProse(source);
  assert.ok(!mask.includes('utilize'), 'code inside a fence must not be analysed');
  assert.ok(mask.includes('Prose here.'));
});

test('mask blanks tilde fences too', () => {
  const source = 'Before.\n\n~~~py\nmake a decision()\n~~~\n\nAfter.\n';
  assert.ok(!maskNonProse(source).includes('decision'));
});

test('mask blanks inline code but keeps surrounding prose', () => {
  const mask = maskNonProse('Run `npm install` before starting.');
  assert.ok(!mask.includes('npm install'));
  assert.ok(mask.includes('Run'));
  assert.ok(mask.includes('before starting.'));
});

test('mask keeps link text and blanks the URL', () => {
  const mask = maskNonProse('See [the design doc](https://example.com/a-b_c) for details.');
  assert.ok(mask.includes('the design doc'), 'link text is prose');
  assert.ok(!mask.includes('example.com'), 'link target is not prose');
});

test('mask blanks images entirely', () => {
  const mask = maskNonProse('Above ![a diagram of the flow](img/flow.png) below.');
  assert.ok(!mask.includes('diagram'));
  assert.ok(!mask.includes('flow.png'));
});

test('mask blanks markdown syntax but not the words', () => {
  const mask = maskNonProse('## A heading\n\n- first item\n- second item\n\n> quoted words\n\n**bold words**\n');
  assert.ok(!mask.includes('#'));
  assert.ok(!mask.includes('**'));
  assert.ok(mask.includes('A heading'));
  assert.ok(mask.includes('first item'));
  assert.ok(mask.includes('quoted words'));
  assert.ok(mask.includes('bold words'));
});

test('mask keeps underscores inside identifiers', () => {
  const mask = maskNonProse('Set the user_id field to the tenant_id value.');
  assert.ok(mask.includes('user_id'), 'snake_case must not be treated as emphasis');
  assert.ok(mask.includes('tenant_id'));
});

test('mask blanks YAML front matter', () => {
  const source = '---\ntitle: Some Title\ntags: [a, b]\n---\n\nThe real prose starts here.\n';
  const mask = maskNonProse(source);
  assert.ok(!mask.includes('title'));
  assert.ok(mask.includes('The real prose starts here.'));
});

test('mask blanks table separator rows', () => {
  const source = '| Name | Every |\n| --- | --- |\n| fern | 3d |\n';
  const mask = maskNonProse(source);
  assert.ok(!mask.includes('---'));
});

test('does not split on abbreviations', () => {
  const { sentences } = tokenize('Dr. Smith arrived at 5 p.m. and left.');
  assert.equal(sentences.length, 1);
});

test('does not split on initials or e.g.', () => {
  assert.equal(tokenize('The U.S. policy changed, e.g. in 1972.').sentences.length, 1);
});

test('does not split on decimal numbers', () => {
  assert.equal(tokenize('Latency dropped to 1.5 ms.').sentences.length, 1);
});

test('splits on real sentence boundaries', () => {
  const { sentences } = tokenize('It works. It is fast! Is it safe?');
  assert.equal(sentences.length, 3);
});

test('keeps hard-wrapped prose as one sentence', () => {
  const source = 'The worker retries any request that fails with a\ntransient error up to five times before giving up.\n';
  const { sentences } = tokenize(source);
  assert.equal(sentences.length, 1);
  assert.equal(sentences[0].text, 'The worker retries any request that fails with a transient error up to five times before giving up.');
});

test('treats each list item as its own sentence', () => {
  const source = '- water the fern\n- change the filter\n- call your mother\n';
  const { sentences } = tokenize(source);
  assert.equal(sentences.length, 3);
  assert.equal(sentences[0].text, 'water the fern');
});

test('treats a heading as its own sentence', () => {
  const { sentences } = tokenize('# Release notes\n\nThe cache is stale.\n');
  assert.deepEqual(sentences.map((s) => s.text), ['Release notes', 'The cache is stale.']);
});

test('sentence offsets point at real source positions', () => {
  const source = 'First sentence. Second sentence.\n';
  const { sentences } = tokenize(source);
  assert.equal(source.slice(sentences[1].start, sentences[1].end), 'Second sentence.');
  assert.equal(sentences[1].line, 1);
  assert.equal(sentences[1].col, 17);
});

test('ignores code when counting words', () => {
  const doc = tokenize('Two words here.\n\n```\nmany words inside code\n```\n');
  assert.deepEqual(doc.words, ['Two', 'words', 'here']);
  assert.equal(doc.wordCount, 3);
});

test('locator reports 1-based lines and columns', () => {
  const locate = makeLocator('ab\ncd\nef');
  assert.deepEqual(locate(0), { line: 1, col: 1 });
  assert.deepEqual(locate(3), { line: 2, col: 1 });
  assert.deepEqual(locate(6), { line: 3, col: 1 });
});

test('marks structural sentences so rhythm checks can skip them', () => {
  const source = '- water the fern\n- change the filter\n\nFlowing prose goes here.\n';
  const { sentences } = tokenize(source);
  assert.deepEqual(
    sentences.map((s) => [s.text, s.structural]),
    [['water the fern', true], ['change the filter', true], ['Flowing prose goes here.', false]],
  );
});

test('marks table rows and headings as structural', () => {
  const source = '# A heading\n\n| One | Two |\n| --- | --- |\n| a | b |\n';
  const { sentences } = tokenize(source);
  assert.ok(sentences.length > 0);
  assert.ok(sentences.every((s) => s.structural), 'every line here is structural');
});

test('empty input yields no sentences and does not throw', () => {
  const doc = tokenize('');
  assert.equal(doc.sentences.length, 0);
  assert.equal(doc.wordCount, 0);
});
