// A heuristic English syllable counter.
//
// Exact syllable counts need a pronouncing dictionary, which would mean a
// dependency and a data file. This is accurate enough for a reading-ease proxy
// (~95% on ordinary prose) and the report labels the number as an estimate.

const SILENT_E = /(?:[^laeiouy]e|[^aeiouy]le)$/;
const VOWEL_GROUP = /[aeiouy]{1,2}/g;

const SPECIAL = new Map([
  ['every', 3], ['fire', 2], ['hour', 2], ['poem', 2], ['being', 2],
  ['science', 2], ['quiet', 2], ['real', 2], ['idea', 3], ['area', 3],
  ['business', 2], ['different', 3], ['interesting', 4], ['camera', 3],
  ['queue', 1], ['queues', 1], ['queued', 1], ['queuing', 2], ['aqueous', 3],
]);

/** @param {string} word @returns {number} */
export function syllables(word) {
  const clean = word.toLowerCase().replace(/[^a-z']/g, '');
  if (!clean) return 0;
  if (SPECIAL.has(clean)) return SPECIAL.get(clean);

  const core = clean.replace(/'/g, '');
  if (core.length <= 3) return 1;

  let body = core;
  let count = 0;

  // Common suffixes are reliably one syllable each and confuse the vowel rule.
  const suffixes = ['ational', 'ization', 'iveness', 'fulness', 'ousness', 'ically',
    'tion', 'sion', 'cial', 'tial', 'ious', 'eous', 'ence', 'ance', 'ment',
    'ness', 'less', 'able', 'ible', 'ful', 'ing', 'ery', 'ory', 'ive', 'ity'];
  for (const suffix of suffixes) {
    if (body.endsWith(suffix) && body.length > suffix.length + 1) {
      count += suffix === 'tion' || suffix === 'sion' ? 1 : (suffix.match(VOWEL_GROUP) || []).length;
      body = body.slice(0, -suffix.length);
      break;
    }
  }

  if (SILENT_E.test(body) && !/(ae|oe)/.test(body.slice(-2))) {
    body = body.slice(0, -1);
  }

  const groups = body.match(VOWEL_GROUP) || [];
  count += groups.length;

  return Math.max(1, count);
}

/** @param {string[]} words @returns {number} */
export function totalSyllables(words) {
  let total = 0;
  for (const w of words) total += syllables(w);
  return total;
}

/**
 * Flesch reading ease: 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words).
 * Higher is easier. 60-70 is plain English; below 30 is graduate-level.
 * @returns {number|null} null when there is not enough text to mean anything
 */
export function readingEase({ wordCount, sentenceCount, words }) {
  if (wordCount < 20 || sentenceCount < 1) return null;
  const syl = totalSyllables(words);
  const score = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syl / wordCount);
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function easeLabel(score) {
  if (score === null) return 'not enough text';
  if (score >= 80) return 'very easy';
  if (score >= 70) return 'fairly easy';
  if (score >= 60) return 'plain English';
  if (score >= 50) return 'fairly hard';
  if (score >= 30) return 'hard';
  return 'very hard';
}
