import test from 'node:test';
import assert from 'node:assert/strict';

import { syllables, totalSyllables, readingEase, easeLabel } from '../src/syllables.js';

test('counts simple words as one syllable', () => {
  for (const word of ['cat', 'dog', 'the', 'one', 'run', 'queue']) {
    assert.equal(syllables(word), 1, word);
  }
});

test('counts common multi-syllable words correctly', () => {
  assert.equal(syllables('water'), 2);
  assert.equal(syllables('decision'), 3);
  assert.equal(syllables('analysis'), 4);
});

test('handles the irregular words it knows about', () => {
  assert.equal(syllables('every'), 3);
  assert.equal(syllables('business'), 2);
  assert.equal(syllables('different'), 3);
});

test('never returns zero for a real word', () => {
  for (const word of ['a', 'I', 'x', 'strength', 'rhythm', 'syllable']) {
    assert.ok(syllables(word) >= 1, `${word} must have at least one syllable`);
  }
});

test('empty and non-letter input is zero', () => {
  assert.equal(syllables(''), 0);
  assert.equal(syllables('---'), 0);
  assert.equal(syllables('123'), 0);
});

test('ignores case and punctuation', () => {
  assert.equal(syllables('Decision'), syllables('decision'));
  assert.equal(syllables("don't"), syllables('dont'));
});

test('totalSyllables sums a word list', () => {
  assert.equal(totalSyllables(['cat', 'water']), 3);
  assert.equal(totalSyllables([]), 0);
});

test('reading ease needs a real document', () => {
  assert.equal(readingEase({ wordCount: 5, sentenceCount: 1, words: ['one', 'two', 'three', 'four', 'five'] }), null);
});

test('reading ease stays inside 0..100', () => {
  const words = 'The worker polls the queue and claims a single job before running it to completion'.split(' ');
  const score = readingEase({ wordCount: words.length, sentenceCount: 1, words });
  assert.ok(score >= 0 && score <= 100, `got ${score}`);
});

test('plain prose scores easier than Latinate prose', () => {
  // readingEase needs at least 20 words before the number means anything.
  const plain = 'The cache stores the manifest for sixty seconds. The worker reads it on every request. Nothing is dropped and no request waits. The whole path takes four milliseconds.'.split(/\s+/);
  const latinate = 'The utilisation of the caching infrastructure facilitates a substantial amelioration of the latency characteristics, notwithstanding the considerable implementation complexity that the aforementioned architectural modification necessitates.'.split(/\s+/);

  assert.ok(plain.length >= 20 && latinate.length >= 20, 'test texts must clear the 20-word floor');

  const plainScore = readingEase({ wordCount: plain.length, sentenceCount: 4, words: plain });
  const latinateScore = readingEase({ wordCount: latinate.length, sentenceCount: 1, words: latinate });

  assert.ok(plainScore !== null && latinateScore !== null);
  assert.ok(plainScore > latinateScore, `plain ${plainScore} should beat latinate ${latinateScore}`);
});

test('easeLabel describes every band', () => {
  assert.equal(easeLabel(null), 'not enough text');
  assert.equal(easeLabel(90), 'very easy');
  assert.equal(easeLabel(75), 'fairly easy');
  assert.equal(easeLabel(65), 'plain English');
  assert.equal(easeLabel(55), 'fairly hard');
  assert.equal(easeLabel(40), 'hard');
  assert.equal(easeLabel(10), 'very hard');
});
