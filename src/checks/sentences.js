// Sentence-level checks: structure, voice, and the shapes a sentence takes
// when the writer does not want to commit to a subject.

import { scan } from './helpers.js';

const THROAT_CLEARS = [
  'it is important to note that',
  'it is important to remember that',
  'it should be noted that',
  'it is worth noting that',
  'it is worth mentioning that',
  'it should be mentioned that',
  'it bears repeating that',
  'it goes without saying',
  'needless to say',
  'there is no doubt that',
  'there can be no doubt that',
  'as a matter of fact',
  'it is clear that',
  'it is obvious that',
  'it is evident that',
  'it is apparent that',
  'at the end of the day',
  'when all is said and done',
  'the bottom line is',
  'last but not least',
  'for what it is worth',
  'for what it\'s worth',
  'suffice it to say',
  'it should be pointed out that',
  'we must bear in mind that',
  'it is interesting to note that',
];

// Participles that read as adjectives rather than as a passive act.
const STATIVE = new Set([
  'based', 'located', 'required', 'designed', 'expected', 'known', 'composed',
  'called', 'named', 'defined', 'interested', 'concerned', 'related', 'associated',
  'limited', 'restricted', 'applied', 'available', 'possible', 'likely', 'certain',
  'clear', 'true', 'different', 'same', 'free', 'full', 'empty', 'ready', 'sure',
  'gone', 'left', 'set', 'bound', 'tied', 'linked', 'attached', 'included',
  'excluded', 'enabled', 'disabled', 'supported', 'deprecated', 'documented',
  'tested', 'merged', 'closed', 'opened', 'locked', 'finished', 'completed',
  'allowed', 'denied', 'granted', 'assumed', 'guaranteed', 'supposed', 'meant',
]);

const IRREGULAR_PARTICIPLES = 'written|taken|given|seen|done|built|sent|sold|told|found|kept|held|spent|lost|paid|said|made|brought|bought|thought|taught|caught|understood|heard|felt|met|read|cut|put|hit|let|run|shown|chosen|broken|spoken|stolen|driven|ridden|fallen|forgotten|begun|known|drawn|grown|thrown|worn|torn|born|sworn|become|come|cost|eaten|flown|gotten|had|lent|risen|sat|stood|struck|sung|woken|won|hidden|meant|dealt|bound|wound|ground|shorn|slain';

// "un<something>ed" is overwhelmingly adjectival rather than a passive act:
// "the retry loop is unbounded" describes a state, it does not hide an actor.
// The exceptions below are real passive verbs and stay in the check.
const UN_PASSIVES = new Set([
  'undone', 'uncovered', 'unveiled', 'unearthed', 'unsealed', 'unmasked',
  'unblocked', 'unloaded', 'unpacked', 'unpublished', 'unmounted', 'unsent',
  'unsaid', 'unwound', 'unfurled', 'unrolled', 'unlearned',
]);

const ADJECTIVAL = new Set([
  'advanced', 'detailed', 'complicated', 'sophisticated', 'nested', 'rooted',
  'cached', 'staged', 'gifted', 'talented', 'learned', 'aged', 'beloved',
  'wicked', 'sacred', 'naked', 'crooked', 'rugged', 'ragged', 'jagged',
  'dogged', 'hunched', 'arched', 'curved', 'pointed', 'rounded', 'squared',
  'angled', 'layered', 'patterned', 'colored', 'sized', 'shaped', 'kindled',
  'tangled', 'blessed', 'cursed', 'dressed', 'fledged', 'legged', 'winged',
  'indeed',
]);

function isAdjectivalParticiple(word) {
  const lower = word.toLowerCase();
  if (STATIVE.has(lower) || ADJECTIVAL.has(lower)) return true;
  return /^un[a-z]+ed$/.test(lower) && !UN_PASSIVES.has(lower);
}

// The -en participles are listed explicitly rather than matched with a generic
// [a-z]+en pattern, because that pattern also matches "often", "when" and
// "then" -- which turns "findings are often right" into a false passive.
const PASSIVE_RE = new RegExp(
  `\\b(am|is|are|was|were|be|been|being|get|gets|got)\\s+([a-z]+ed|${IRREGULAR_PARTICIPLES})\\b`,
  'gi',
);

const EXPLETIVE_RE = /^\s*(?:there\s+(?:is|are|was|were|exists|exist)\b|it\s+(?:is|was|has\s+been|becomes?|seems?)\b[\s\S]{0,60}?\bthat\b)/i;

const ZOMBIE_RE = /\b(?:this|that|the|these|those|our|my|its|their)\s+(system|approach|method|methodology|mechanism|process|procedure|framework|solution|architecture|platform|feature|capability|tool|module|service|design|pattern|model|implementation|configuration|logic)\s+(enables?|allows?|permits?|facilitates?|provides?|supports?|ensures?|delivers?|offers?|gives?|helps?|lets|requires?|prevents?|ensures?)\b/gi;

const LONG_SENTENCE_WORDS = 38;

/**
 * Locate a normalised phrase inside raw source text, tolerating runs of
 * whitespace, newlines and curly apostrophes. Returns [from, to) or null.
 */
function matchPhraseSpan(text, offset, phrase) {
  let i = offset;
  for (let p = 0; p < phrase.length; p += 1) {
    const want = phrase[p];
    if (want === ' ') {
      if (!/\s/.test(text[i] || '')) return null;
      while (i < text.length && /\s/.test(text[i])) i += 1;
      continue;
    }
    const got = text[i];
    const apostrophes = (want === "'" || want === '\u2019') && (got === "'" || got === '\u2019');
    if (got === undefined || (!apostrophes && got.toLowerCase() !== want.toLowerCase())) return null;
    i += 1;
  }
  return [offset, i];
}

export const throatClear = {
  id: 'throat-clear',
  severity: 'warn',
  title: 'Throat-clearing openers',
  why: 'A preamble before the point delays the reader for no reason. "It is important to note that X" says X, plus a claim about X\'s importance that you did not need to make -- if it were not important you would not have written it. The reader can judge importance. Start with the thing.',
  examples: [
    { bad: 'It is important to note that the cache is not invalidated.', good: 'The cache is not invalidated.' },
    { bad: 'There is no doubt that this will regress throughput.', good: 'This will regress throughput.' },
  ],
  scope: 'sentence',
  run({ sentence, doc }) {
    const raw = doc.mask.slice(sentence.start, sentence.end);
    const lead = /^\s*/.exec(raw)[0].length;

    for (const phrase of THROAT_CLEARS) {
      const span = matchPhraseSpan(raw, lead, phrase);
      if (!span) continue;
      const rest = raw.slice(span[1]).replace(/\s+/g, ' ').trim().replace(/\.$/, '');
      return [{
        from: sentence.start + span[0],
        to: sentence.start + span[1],
        message: `"${phrase}" delays the point`,
        note: rest
          ? `Delete the preamble. Your sentence starts at "${rest}".`
          : 'Delete the preamble.',
      }];
    }
    return [];
  },
};

export const hiddenActor = {
  id: 'hidden-actor',
  severity: 'info',
  title: 'Passive voice with no actor',
  why: 'Passive voice is not wrong. Passive voice with the actor deleted is how responsibility disappears from a document: "mistakes were made", "the deadline was missed", "the data was dropped". If there is an actor, name it. If there genuinely is no actor, passive is correct and you can ignore this.',
  examples: [
    { bad: 'The migration was run without a backup.', good: 'We ran the migration without a backup.' },
    { bad: 'Errors were introduced in the last release.', good: 'The last release introduced errors.' },
  ],
  scope: 'sentence',
  run({ sentence, doc }) {
    const found = [];
    scan(doc.mask, sentence.start, sentence.end, PASSIVE_RE, ({ from, to, match, groups }) => {
      const participle = groups[2].toLowerCase();
      if (isAdjectivalParticiple(participle)) return;
      const after = doc.mask.slice(to, sentence.end);
      if (/\bby\b/i.test(after)) return;
      if (/^\s+(?:of|from|up of|with|in|to)\b/i.test(after)) return;
      found.push({
        from,
        to,
        message: `"${match.trim()}" hides who did it`,
        note: 'Name the actor, or ignore this if there genuinely is none.',
      });
    });
    return found;
  },
};

export const expletive = {
  id: 'expletive',
  severity: 'info',
  title: 'Expletive opening ("There is", "It is ... that")',
  why: 'Grammar calls these expletive constructions: "there" and "it" are placeholders standing where the real subject should be. They let a sentence begin without committing to a subject, which is why they feel weightless. Inverting the sentence usually puts the actor first and drops two or three words.',
  examples: [
    { bad: 'There are three reasons the build fails.', good: 'The build fails for three reasons.' },
    { bad: 'It is the retry loop that causes the pileup.', good: 'The retry loop causes the pileup.' },
  ],
  scope: 'sentence',
  run({ sentence, doc }) {
    const raw = doc.mask.slice(sentence.start, sentence.end);
    const m = EXPLETIVE_RE.exec(raw);
    if (!m) return [];
    return [{
      from: sentence.start,
      to: sentence.start + m[0].length,
      message: `the sentence opens with a placeholder, not a subject`,
      note: `Try putting the real subject first: "${m[0].trim()}" is doing nothing.`,
    }];
  },
};

export const zombieNoun = {
  id: 'zombie-noun',
  severity: 'info',
  title: 'An abstraction is doing the acting',
  why: 'Systems do not enable things; people build systems that enable things. When an abstraction is the grammatical subject of an enabling verb, the sentence stops being about anyone\'s behaviour and becomes about the weather. This is the most common way technical writing avoids saying who decided what.',
  examples: [
    { bad: 'This approach allows us to reduce latency.', good: 'We cache the manifest, which cuts latency.' },
    { bad: 'The framework provides the ability to retry.', good: 'The framework retries.' },
  ],
  scope: 'sentence',
  run({ sentence, doc }) {
    const found = [];
    scan(doc.mask, sentence.start, sentence.end, ZOMBIE_RE, ({ from, to, match }) => {
      found.push({
        from,
        to,
        message: `"${match.trim()}" makes an abstraction the actor`,
        note: 'Who actually does this? If the answer is a person or a process, make that the subject.',
      });
    });
    return found;
  },
};

export const longSentence = {
  id: 'long-sentence',
  severity: 'warn',
  title: 'Overlong sentence',
  why: `A sentence over ${LONG_SENTENCE_WORDS} words asks the reader to hold too much in working memory at once. Long sentences are not banned -- they earn their length when the ideas genuinely depend on each other. Most of the time the sentence is two sentences wearing a comma.`,
  examples: [
    {
      bad: 'The worker, which is started by the supervisor at boot and which owns the connection pool, will retry any request that fails with a transient error up to five times before giving up and logging.',
      good: 'The supervisor starts the worker at boot. The worker owns the connection pool and retries transient failures up to five times, then logs and gives up.',
    },
  ],
  scope: 'sentence',
  run({ sentence }) {
    if (sentence.wordCount <= LONG_SENTENCE_WORDS) return [];
    return [{
      from: sentence.start,
      to: sentence.end,
      message: `${sentence.wordCount} words in one sentence`,
      note: 'Find the conjunction doing the joining. It is usually where the second sentence starts.',
    }];
  },
};

const ECHO_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'are',
  'was', 'were', 'will', 'would', 'can', 'could', 'should', 'shall', 'may', 'might',
  'must', 'not', 'but', 'its', 'their', 'your', 'our', 'all', 'any', 'some', 'into',
  'onto', 'over', 'under', 'than', 'then', 'when', 'where', 'while', 'which', 'who',
  'what', 'why', 'how', 'about', 'after', 'before', 'between', 'each', 'other',
  'such', 'only', 'also', 'more', 'most', 'less', 'least', 'much', 'many', 'them',
  'they', 'there', 'these', 'those', 'been', 'being', 'does', 'doing', 'done',
]);

export const echo = {
  id: 'echo',
  severity: 'info',
  title: 'The same word twice in one sentence',
  why: 'Writers cannot hear repetition in their own work -- you chose the word once, so it sounds inevitable the second time. The reader hears it. Sometimes repetition is deliberate and rhythmic; usually it is a synonym waiting to happen, or a sign the sentence is trying to do two things.',
  examples: [
    { bad: 'The parser parses the token stream and returns a parsed tree.', good: 'The parser reads the token stream and returns a tree.' },
  ],
  scope: 'sentence',
  run({ sentence, doc, config }) {
    if (sentence.wordCount < 8) return [];
    const glossary = new Set((config.glossary || []).map((w) => w.toLowerCase()));
    const seen = new Map();
    const found = [];

    for (const word of sentence.words) {
      const key = word.toLowerCase().replace(/[^a-z']/g, '');
      if (key.length < 4 || ECHO_STOPWORDS.has(key) || glossary.has(key)) continue;

      const at = doc.mask
        .slice(sentence.start, sentence.end)
        .toLowerCase()
        .indexOf(key, seen.has(key) ? seen.get(key).searchFrom : 0);
      if (at === -1) continue;

      if (seen.has(key)) {
        const first = seen.get(key);
        found.push({
          from: sentence.start + at,
          to: sentence.start + at + key.length,
          message: `"${word}" repeats within the sentence`,
          note: `First used ${at - first.at} characters earlier. Vary it, or split the sentence.`,
        });
        seen.set(key, { at, searchFrom: at + key.length });
      } else {
        seen.set(key, { at, searchFrom: at + key.length });
      }
    }
    return found;
  },
};

export default [throatClear, hiddenActor, expletive, zombieNoun, longSentence, echo];
