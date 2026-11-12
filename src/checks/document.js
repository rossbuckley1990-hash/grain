// Document-level checks and metrics: things only visible across sentences.

import { readingEase, easeLabel } from '../syllables.js';

const WINDOW = 4;
const MIN_WORDS = 6;
const MAX_SPREAD = 3;

export const monotony = {
  id: 'monotony',
  severity: 'info',
  title: 'Sentences all the same length',
  why: 'Prose has a rhythm the reader feels even when they are not thinking about it. Four sentences of near-identical length read as a drone, and a drone is how a reader starts skimming. Varying sentence length is not decoration -- a short sentence after three long ones is where emphasis lives. The check is scoped to one paragraph, and ignores list items, table rows and headings, because a reader\'s sense of rhythm resets at a paragraph break and uniform length is the point of a list.',
  examples: [
    {
      bad: 'The worker polls the queue every second. The worker claims a single job. The worker runs the job to completion. The worker reports the result back.',
      good: 'The worker polls the queue every second, claims one job, runs it to completion, and reports the result. Then it starts over.',
    },
  ],
  scope: 'document',
  run({ doc }) {
    const found = [];

    // Rhythm is felt inside a paragraph. Four uniform sentences spread across a
    // document, separated by headings and code blocks, are not a drone.
    const blocks = new Map();
    for (const s of doc.sentences) {
      if (s.wordCount < MIN_WORDS || s.structural) continue;
      if (!blocks.has(s.block)) blocks.set(s.block, []);
      blocks.get(s.block).push(s);
    }

    for (const sentences of blocks.values()) {
      if (sentences.length < WINDOW) continue;

      let i = 0;
      while (i <= sentences.length - WINDOW) {
        const win = sentences.slice(i, i + WINDOW);
        const lengths = win.map((s) => s.wordCount);
        const spread = Math.max(...lengths) - Math.min(...lengths);
        if (spread > MAX_SPREAD) {
          i += 1;
          continue;
        }
        found.push({
          // Point at the first sentence only. Spanning all four produces an
          // underline wider than the terminal and tells the reader less.
          from: win[0].start,
          to: win[0].end,
          message: `this sentence and the next ${WINDOW - 1} all run ${Math.min(...lengths)}-${Math.max(...lengths)} words`,
          note: 'Break the pattern: merge two, or cut one down to four words.',
        });
        i += WINDOW;
      }
    }

    return found;
  },
};

/** Descriptive numbers about the document. Not findings -- just a reading. */
export function metrics(doc) {
  const lengths = doc.sentences.map((s) => s.wordCount).filter((n) => n > 0);
  const longest = doc.sentences.reduce(
    (best, s) => (s.wordCount > (best?.wordCount ?? -1) ? s : best),
    null,
  );
  const ease = readingEase({
    wordCount: doc.wordCount,
    sentenceCount: lengths.length,
    words: doc.words,
  });

  return {
    words: doc.wordCount,
    sentences: lengths.length,
    lines: doc.lineCount,
    avgSentenceLength: lengths.length
      ? Math.round((lengths.reduce((a, b) => a + b, 0) / lengths.length) * 10) / 10
      : 0,
    longestSentence: longest ? { words: longest.wordCount, line: longest.line } : null,
    readingEase: ease,
    readingEaseLabel: easeLabel(ease),
  };
}

export default [monotony];
