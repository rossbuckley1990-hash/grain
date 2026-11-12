// Turning a markdown/text file into sentences, while remembering exactly where
// each one came from.
//
// The trick is a "mask": a copy of the source, the same length, where every
// character that is not prose (code fences, inline code, link URLs, markdown
// syntax) has been replaced with a space. Because lengths match, an offset in
// the mask is an offset in the source, so findings can point at real line and
// column numbers while never analysing a code block.

const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'eg', 'ie', 'cf',
  'approx', 'dept', 'est', 'fig', 'figs', 'inc', 'ltd', 'co', 'corp', 'llc', 'no',
  'nos', 'vol', 'vols', 'p', 'pp', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug',
  'sep', 'sept', 'oct', 'nov', 'dec', 'ave', 'blvd', 'rd', 'mt', 'gen', 'gov', 'hon',
  'rev', 'sgt', 'capt', 'col', 'maj', 'lt', 'sen', 'rep', 'al', 'ed', 'trans', 'univ',
  'min', 'max', 'avg', 'sq', 'ft', 'mi', 'kg', 'lb', 'oz', 'ph', 'am', 'pm',
]);

// A line that markdown treats as its own structural unit rather than a
// continuation of flowing prose.
const STRUCTURAL_LINE = /^[ \t]{0,3}(?:#{1,6}[ \t]|[-*+][ \t]|\d{1,9}[.)][ \t]|>[ \t]?|\||[ \t]{4,}\S)/;

const TERMINAL = /[.!?]/;

/** Precompute line starts so offset -> {line, col} is a binary search. */
export function makeLocator(source) {
  const starts = [0];
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') starts.push(i + 1);
  }
  return function locate(offset) {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, col: offset - starts[lo] + 1 };
  };
}

function indexLines(source) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') {
      lines.push({ start, end: i });
      start = i + 1;
    }
  }
  lines.push({ start, end: source.length });
  return lines;
}

function blankRange(chars, from, to) {
  for (let i = Math.max(0, from); i < Math.min(chars.length, to); i += 1) {
    if (chars[i] !== '\n') chars[i] = ' ';
  }
}

function blankMatches(chars, regex) {
  let view = chars.join('');
  regex.lastIndex = 0;
  let m;
  while ((m = regex.exec(view)) !== null) {
    blankRange(chars, m.index, m.index + m[0].length);
    view = chars.join('');
    regex.lastIndex = m.index + m[0].length;
    if (m[0].length === 0) regex.lastIndex += 1;
  }
}

/**
 * Blank the brackets and the URL of [text](target) but keep `text`, because
 * link text is written prose and the target is not.
 */
function blankLinkTargets(chars) {
  const re = /\[([^\]]*)\]\(([^)]*)\)/g;
  let view = chars.join('');
  let m;
  while ((m = re.exec(view)) !== null) {
    const start = m.index;
    blankRange(chars, start, start + 1);
    blankRange(chars, start + 1 + m[1].length, start + m[0].length);
    view = chars.join('');
    re.lastIndex = start + m[0].length;
    if (m[0].length === 0) re.lastIndex += 1;
  }
}

/**
 * Replace every non-prose character with a space, preserving length and newlines.
 * @param {string} source
 * @returns {string}
 */
export function maskNonProse(source) {
  const chars = source.split('');
  const lines = indexLines(source);

  // YAML front matter.
  if (/^---[ \t]*\r?\n/.test(source)) {
    for (let i = 1; i < lines.length; i += 1) {
      blankRange(chars, lines[i].start, lines[i].end);
      if (/^---[ \t]*$/.test(source.slice(lines[i].start, lines[i].end))) break;
    }
  }

  // Fenced code blocks, and table separator rows.
  let fence = null;
  for (const line of lines) {
    const text = source.slice(line.start, line.end);
    if (fence) {
      blankRange(chars, line.start, line.end);
      if (new RegExp(`^[ \\t]{0,3}${fence.char}{${fence.len},}[ \\t]*$`).test(text)) fence = null;
      continue;
    }
    const open = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(text);
    if (open) {
      fence = { char: open[1][0], len: open[1].length };
      blankRange(chars, line.start, line.end);
      continue;
    }
    if (text.includes('|') && /^[ \t]*\|?[ \t:|-]{2,}\|[ \t:|-]*$/.test(text)) {
      blankRange(chars, line.start, line.end);
    }
    // Reference-style link definitions carry no prose.
    if (/^[ \t]{0,3}\[[^\]]+\]:[ \t]*\S/.test(text)) blankRange(chars, line.start, line.end);
  }

  blankMatches(chars, /<!--[\s\S]*?-->/g);
  blankMatches(chars, /(`+)(?:[^`]|(?!\1)`)*?\1/g);
  blankMatches(chars, /!\[[^\]]*\]\([^)]*\)/g);
  blankLinkTargets(chars);
  blankMatches(chars, /\b(?:https?|ftp|mailto):\/\/[^\s<>)\]]+/g);
  blankMatches(chars, /<\/?[a-zA-Z][^>\n]*>/g);

  // Horizontal rules and setext heading underlines.
  blankMatches(chars, /^[ \t]{0,3}([-*_])([ \t]*\1){2,}[ \t]*$/gm);
  blankMatches(chars, /^[ \t]*[=-]+[ \t]*$/gm);

  // Line-leading markdown syntax.
  blankMatches(chars, /^[ \t]{0,3}#{1,6}[ \t]*/gm);
  blankMatches(chars, /^[ \t]{0,3}(?:>[ \t]?)+/gm);
  blankMatches(chars, /^[ \t]{0,3}(?:[-*+]|\d{1,9}[.)])[ \t]+/gm);

  // Emphasis markers, but not the underscores inside snake_case identifiers.
  blankMatches(chars, /\*\*|__/g);
  {
    const view = chars.join('');
    for (let i = 0; i < view.length; i += 1) {
      const c = view[i];
      if (c !== '*' && c !== '_') continue;
      const betweenWords = /[\p{L}\p{N}]/u.test(view[i - 1] || '') && /[\p{L}\p{N}]/u.test(view[i + 1] || '');
      if (!betweenWords) blankRange(chars, i, i + 1);
    }
  }

  // Table pipes on lines that are clearly tables.
  {
    const view = chars.join('');
    for (const line of indexLines(view)) {
      const text = view.slice(line.start, line.end);
      if ((text.match(/\|/g) || []).length >= 2) {
        for (let i = line.start; i < line.end; i += 1) {
          if (view[i] === '|') blankRange(chars, i, i + 1);
        }
      }
    }
  }

  return chars.join('');
}

function isAbbreviationDot(mask, dotIndex) {
  let i = dotIndex;
  while (i > 0 && /[A-Za-z.]/.test(mask[i - 1])) i -= 1;
  const raw = mask.slice(i, dotIndex);
  const word = raw.replace(/\./g, '').toLowerCase();
  if (!word) return false;
  // A dot after every letter is an initialism: U.S., e.g., a.m., Ph.D.
  if (/^(?:[A-Za-z]\.)+[A-Za-z]?$/.test(raw)) return true;
  if (word.length === 1) return true; // single-letter abbreviations: p., No.
  return ABBREVIATIONS.has(word);
}

/** Offsets just past each sentence-ending punctuation run within [from, to). */
function punctuationBreaks(mask, from, to) {
  const breaks = [];
  let i = from;
  while (i < to) {
    if (!TERMINAL.test(mask[i])) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < to && TERMINAL.test(mask[j])) j += 1;
    const run = mask.slice(i, j);
    const before = mask[i - 1] || '';
    const after = mask[j] || '';

    const isDecimal = run === '.' && /[0-9]/.test(before) && /[0-9]/.test(after);
    const isAbbrev = run === '.' && isAbbreviationDot(mask, i);
    const isGlued = j < to && !/\s/.test(after);

    if (!isDecimal && !isAbbrev && !isGlued) breaks.push(j);
    i = j;
  }
  return breaks;
}

function trimRange(mask, start, end) {
  while (start < end && /\s/.test(mask[start])) start += 1;
  while (end > start && /\s/.test(mask[end - 1])) end -= 1;
  return [start, end];
}

function cutSentences(mask, from, to, structural, block, out) {
  let cursor = from;
  const cuts = [...punctuationBreaks(mask, from, to)];
  if (structural) {
    for (let i = from; i < to; i += 1) if (mask[i] === '\n') cuts.push(i + 1);
  }
  cuts.sort((a, b) => a - b);
  for (const cut of cuts) {
    const [s, e] = trimRange(mask, cursor, cut);
    if (e - s > 0) out.push({ start: s, end: e, structural, block });
    cursor = cut;
  }
  const [s, e] = trimRange(mask, cursor, to);
  if (e - s > 0) out.push({ start: s, end: e, structural, block });
}

function splitSentences(source, mask) {
  const sentences = [];
  const lines = indexLines(source);
  let block = 0;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const text = source.slice(line.start, line.end);
    if (!text.trim()) {
      i += 1;
      continue;
    }
    // A "block" is a run of consecutive non-blank lines.
    let j = i;
    while (j < lines.length && source.slice(lines[j].start, lines[j].end).trim()) j += 1;

    let structural = false;
    for (let k = i; k < j; k += 1) {
      if (STRUCTURAL_LINE.test(source.slice(lines[k].start, lines[k].end))) {
        structural = true;
        break;
      }
    }

    const blockStart = lines[i].start;
    const blockEnd = lines[j - 1].end;
    // Structural blocks break at every newline (a list item is a sentence, a
    // heading is a sentence). Prose blocks only break at punctuation, so
    // hard-wrapped paragraphs stay whole.
    cutSentences(mask, blockStart, blockEnd, structural, block, sentences);
    block += 1;
    i = j;
  }

  return sentences;
}

const WORD_RE = /[\p{L}\p{N}'’\-]+/gu;

function wordsIn(mask, start, end) {
  const slice = mask.slice(start, end);
  const matches = slice.match(WORD_RE) || [];
  return matches.filter((w) => /[\p{L}\p{N}]/u.test(w));
}

/**
 * @param {string} source
 * @returns {{ mask: string, source: string, locate: Function, sentences: Array, words: Array<string>, wordCount: number }}
 */
export function tokenize(source) {
  const mask = maskNonProse(source);
  const locate = makeLocator(source);
  const ranges = splitSentences(source, mask);

  const sentences = ranges.map((range, index) => {
    const words = wordsIn(mask, range.start, range.end);
    const { line, col } = locate(range.start);
    return {
      index,
      start: range.start,
      end: range.end,
      text: mask.slice(range.start, range.end).replace(/\s+/g, ' ').trim(),
      raw: source.slice(range.start, range.end).replace(/\s+/g, ' ').trim(),
      words,
      wordCount: words.length,
      structural: range.structural,
      block: range.block,
      line,
      col,
    };
  });

  const allWords = sentences.flatMap((s) => s.words);

  return {
    source,
    mask,
    locate,
    sentences,
    words: allWords,
    wordCount: allWords.length,
    lineCount: indexLines(source).length,
  };
}
