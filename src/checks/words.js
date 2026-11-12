// Word-level checks: the small choices that drain force out of a sentence.

import { scan } from './helpers.js';

// Patterns rather than bare words, because a hedge is a use and not a string.
// "rather than" is a conjunction doing real work; "rather soft" is a flinch.
const HEDGES = [
  [/\bvery\b/gi, 'adds emphasis, not information. If the word needs it, reach for a stronger word.'],
  [/\breally\b/gi, 'is almost always deletable. The reader already assumes you mean it.'],
  [/\bquite\b/gi, 'is ambiguous between "completely" and "somewhat", so it commits you to nothing.'],
  [/\brather\b(?!\s+than\b)/gi, 'softens a claim you presumably believe. Say the claim.'],
  [/\bsomewhat\b/gi, 'measures nothing. Either it is or it is not.'],
  [/\bfairly\b/gi, 'is a hedge wearing the costume of a measurement.'],
  [/\bbasically\b/gi, 'announces that you are simplifying, then simplifies. Cut it and simplify.'],
  [/\bessentially\b/gi, 'does the same work as "basically" with more syllables.'],
  [/\bactually\b/gi, 'implies the reader was wrong before you spoke. Usually they were not.'],
  [/\bliterally\b/gi, 'means the opposite of what it is used for. Reserve it for the literal.'],
  [/\bjust\b/gi, 'minimises what you are about to ask or claim. It is doing something to you, not for you.'],
  [/\bsimply\b/gi, 'tells the reader the thing is easy, which is only ever true for the person who already knows it.'],
  [/\bperhaps\b/gi, 'is honest uncertainty. Keep it when you are unsure; cut it when you are being polite.'],
  [/\bpossibly\b/gi, 'is "perhaps" with less confidence and more letters.'],
  [/\barguably\b/gi, 'invites the argument you are trying to avoid.'],
  [/\bslightly\b/gi, 'is precise when you have measured and a hedge when you have not.'],
  [/\bsort\s+of\b/gi, 'is a shrug in writing.'],
  [/\bkind\s+of\b/gi, 'is a shrug in writing.'],
  [/\ba\s+bit\b/gi, 'is a shrug in writing.'],
];

const APOLOGIES = [
  ['i\'m not an expert', 'You disqualify yourself before making the point. The point stands or falls on its evidence.'],
  ['i could be wrong', 'Then say what would change your mind instead. That is more useful than a disclaimer.'],
  ['this might be a dumb question', 'There is no such thing, and the phrase only signals that you fear there is.'],
  ['sorry to bother', 'Asking is not a bother. This trains you to apologise for taking up space.'],
  ['just my two cents', 'Devalues the thing you are about to say, in advance, to everyone.'],
  ['no offense but', 'Announces that offense is coming. Either it is fine to say, or do not say it.'],
  ['correct me if i\'m wrong', 'People will. You do not need permission.'],
  ['i may be missing something', 'Usually true of everyone always. It adds nothing here.'],
  ['sorry if this is obvious', 'If it is obvious, it is obvious. If it is not, you are helping.'],
  ['i don\'t know if this makes sense', 'It makes sense. You wrote it down.'],
  ['apologies for the long', 'Length is a property of the text, not a moral failing.'],
  ['this is probably nothing', 'If it is nothing, do not send it. If it is something, say so.'],
];

// Deliberately short. A word only belongs here if the plain equivalent is
// precise in essentially every register, including technical writing.
// "terminate the process" and "modify the file" are exact, not inflated.
const INFLATED = [
  [/\butili[sz](?:e[sd]?|ing|ation)\b/gi, 'use'],
  [/\bcommenc(?:e[sd]?|ing|ement)\b/gi, 'begin'],
  [/\bsubsequent(?:ly)?\b/gi, 'later'],
  [/\bprior to\b/gi, 'before'],
  [/\bendeavo(?:u)?r[sed]?\b/gi, 'try'],
  [/\bascertain[sed]?\b/gi, 'find out'],
  [/\baforementioned\b/gi, 'that'],
  [/\bheretofore\b/gi, 'until now'],
  [/\bhenceforth\b/gi, 'from now on'],
  [/\bnotwithstanding\b/gi, 'despite'],
  [/\bwhilst\b/gi, 'while'],
  [/\bamongst\b/gi, 'among'],
  [/\bfacilitat(?:e[sd]?|ing|ion)\b/gi, 'help'],
  [/\bfinali[sz](?:e[sd]?|ing|ation)\b/gi, 'finish'],
  [/\binitiat(?:e[sd]?|ing|ion)\b/gi, 'start'],
  [/\btransmit(?:s|ted|ting)?\b/gi, 'send'],
];

const DEAD_WEIGHT = [
  [/\bat this point in time\b/gi, 'now'],
  [/\bat this moment in time\b/gi, 'now'],
  [/\bin the event that\b/gi, 'if'],
  [/\bdue to the fact that\b/gi, 'because'],
  [/\bowing to the fact that\b/gi, 'because'],
  [/\bby virtue of the fact that\b/gi, 'because'],
  [/\bin spite of the fact that\b/gi, 'although'],
  [/\bfor the purpose of\b/gi, 'for'],
  [/\bfor all intents and purposes\b/gi, ''],
  [/\bwith regard to\b/gi, 'about'],
  [/\bwith respect to\b/gi, 'about'],
  [/\bin regard to\b/gi, 'about'],
  [/\bpertaining to\b/gi, 'about'],
  [/\bin terms of\b/gi, ''],
  [/\ba large number of\b/gi, 'many'],
  [/\bthe majority of\b/gi, 'most'],
  [/\ba number of\b/gi, 'some'],
  [/\bis able to\b/gi, 'can'],
  [/\bare able to\b/gi, 'can'],
  [/\bhas the ability to\b/gi, 'can'],
  [/\bhave the ability to\b/gi, 'can'],
  [/\bthere is a need to\b/gi, 'must'],
  [/\bit is necessary (?:to|that)\b/gi, 'must'],
  [/\bin order to\b/gi, 'to'],
  [/\bon a daily basis\b/gi, 'daily'],
  [/\bon a weekly basis\b/gi, 'weekly'],
  [/\bon a regular basis\b/gi, 'regularly'],
  [/\bthe reason why is that\b/gi, 'because'],
  [/\bthe fact that\b/gi, 'that'],
  [/\bfirst and foremost\b/gi, 'first'],
  [/\bend up\b/gi, ''],
  [/\bfree gift\b/gi, 'gift'],
  [/\btrue fact\b/gi, 'fact'],
  [/\bpast history\b/gi, 'history'],
  [/\bfuture plans\b/gi, 'plans'],
  [/\bcompletely eliminate\b/gi, 'eliminate'],
  [/\btotal annihilation\b/gi, 'annihilation'],
];

// Light verbs inflect, and a pattern that only matches "make a decision"
// misses "made a decision", "makes decisions" and "making a decision" -- which
// is most of how the construction actually appears in the wild.
const LIGHT_VERB = {
  make: 'mak(?:e|es|ing)|made',
  perform: 'perform(?:s|ed|ing)?',
  conduct: 'conduct(?:s|ed|ing)?',
  carry: 'carr(?:y|ies|ied|ying)',
  come: 'com(?:e|es|ing)|came',
  reach: 'reach(?:es|ed|ing)?',
  draw: 'draw(?:s|n|ing)?',
  arrive: 'arriv(?:e|es|ed|ing)',
  give: 'giv(?:e|es|ing)|gave|given',
  take: 'tak(?:e|es|ing)|took|taken',
  have: 'hav(?:e|es|ing)|had',
  hold: 'hold(?:s|ing)?|held',
  do: 'do(?:es|ing)?|did|done',
  provide: 'provid(?:e|es|ed|ing)',
  place: 'plac(?:e|es|ed|ing)',
  serve: 'serv(?:e|es|ed|ing)',
  effect: 'effect(?:s|ed|ing)?',
};

const ARTICLE = '(?:an?|the|some|any|no|this|that|these|those|one|two|three|few|several|many|further|each|every|my|our|your|its|their|his|her)\\s+';

function lightVerb(verb, noun, replacement, particle = '') {
  if (!LIGHT_VERB[verb]) throw new Error(`buried-verb: no inflection table for "${verb}"`);
  const part = particle ? `(?:\\s+(?:${particle}))?` : '';
  return [new RegExp(`\\b(?:${LIGHT_VERB[verb]})${part}\\s+(?:${ARTICLE})?(?:${noun})\\b`, 'gi'), replacement];
}

const BURIED_VERBS = [
  lightVerb('make', 'decisions?', 'decide'),
  lightVerb('make', 'adjustments?', 'adjust'),
  lightVerb('make', 'changes?', 'change'),
  lightVerb('make', 'comparisons?', 'compare'),
  lightVerb('make', 'improvements?', 'improve'),
  lightVerb('make', 'determinations?', 'determine'),
  lightVerb('make', 'assumptions?', 'assume'),
  lightVerb('make', 'recommendations?', 'recommend'),
  lightVerb('make', 'requests?', 'ask'),
  lightVerb('make', 'attempts?', 'try'),
  lightVerb('make', 'use', 'use'),
  lightVerb('perform', 'analysis|analyses', 'analyze'),
  lightVerb('perform', 'evaluations?', 'evaluate'),
  lightVerb('perform', 'tests?|testing', 'test'),
  lightVerb('perform', 'updates?', 'update'),
  lightVerb('perform', 'retr(?:y|ies)', 'retry'),
  lightVerb('conduct', 'investigations?', 'investigate'),
  lightVerb('conduct', 'reviews?', 'review'),
  lightVerb('conduct', 'audits?', 'audit'),
  lightVerb('conduct', 'research', 'research'),
  lightVerb('conduct', 'retr(?:y|ies)', 'retry'),
  lightVerb('carry', 'assessments?', 'assess', 'out'),
  lightVerb('carry', 'reviews?', 'review', 'out'),
  lightVerb('come', 'conclusions?', 'conclude', 'to'),
  lightVerb('reach', 'conclusions?', 'conclude'),
  lightVerb('draw', 'conclusions?', 'conclude'),
  lightVerb('come', 'agreements?', 'agree', 'to'),
  lightVerb('reach', 'agreements?', 'agree'),
  lightVerb('come', 'decisions?', 'decide', 'to'),
  lightVerb('arrive', 'decisions?', 'decide', 'at'),
  lightVerb('give', 'consideration', 'consider', 'to'),
  lightVerb('take', 'consideration', 'consider', 'into'),
  lightVerb('have', 'discussions?', 'discuss'),
  lightVerb('hold', 'discussions?', 'discuss'),
  lightVerb('have', 'conversations?', 'talk'),
  lightVerb('have', 'look', 'look at'),
  lightVerb('take', 'look', 'look at'),
  lightVerb('have', 'understanding', 'understand'),
  lightVerb('have', 'dependenc(?:y|ies)', 'depend'),
  lightVerb('do', 'refactor(?:ing)?', 'refactor'),
  lightVerb('do', 'reviews?', 'review'),
  lightVerb('do', 'analysis|analyses', 'analyze'),
  lightVerb('provide', 'assistance', 'help'),
  lightVerb('provide', 'support', 'support'),
  lightVerb('provide', 'explanations?', 'explain'),
  lightVerb('provide', 'descriptions?', 'describe'),
  lightVerb('give', 'explanations?', 'explain'),
  lightVerb('give', 'descriptions?', 'describe'),
  lightVerb('give', 'rise', 'cause'),
  lightVerb('effect', 'changes?', 'change'),
  lightVerb('place', 'orders?', 'order'),
  lightVerb('serve', 'reminders?', 'remind', 'as'),
];

export const hedge = {
  id: 'hedge',
  severity: 'info',
  title: 'Hedging words',
  why: 'Hedges are how a writer protects themselves from being wrong. The cost is that the reader stops being able to tell what you actually believe. Some hedges are honest uncertainty and should stay; most are politeness and should go.',
  examples: [
    { bad: 'This is quite a bit faster than the old path.', good: 'This is 40ms faster than the old path.' },
    { bad: 'We should really consider changing the API.', good: 'Change the API.' },
  ],
  scope: 'sentence',
  run({ sentence, doc }) {
    const found = [];
    for (const [re, note] of HEDGES) {
      scan(doc.mask, sentence.start, sentence.end, re, ({ from, to, match }) => {
        found.push({
          from,
          to,
          message: `"${match.trim()}" ${note}`,
          note: 'Delete it and see if the sentence loses anything. It rarely does.',
        });
      });
    }
    return found;
  },
};

export const apology = {
  id: 'apology',
  severity: 'info',
  title: 'Self-undermining openers',
  why: 'Disclaiming your own authority before you have said anything is the most common way a good writer hides. It reads as modesty to the writer and as doubt to the reader. If you are genuinely unsure, say what evidence would change your mind; that is more useful than a warning label.',
  examples: [
    { bad: "I'm not an expert, but the retry loop looks unbounded.", good: 'The retry loop looks unbounded.' },
    { bad: 'Sorry to bother you, just my two cents on the design.', good: 'Two notes on the design.' },
  ],
  scope: 'sentence',
  run({ sentence, doc }) {
    const found = [];
    for (const [phrase, note] of APOLOGIES) {
      const re = new RegExp(`\\b${phrase.replace(/'/g, "['\u2019]").replace(/ /g, '\\s+')}\\b`, 'gi');
      scan(doc.mask, sentence.start, sentence.end, re, ({ from, to, match }) => {
        found.push({ from, to, message: `you are apologising for the thing you are about to say`, note });
      });
    }
    return found;
  },
};

export const inflated = {
  id: 'inflated',
  severity: 'warn',
  title: 'Inflated diction',
  why: 'Longer words are not more precise words. Usually they are the writer signalling that the writing is formal, which costs the reader attention and gains nothing. The plain word is almost always the exact one.',
  examples: [
    { bad: 'We will utilise the existing cache.', good: 'We will use the existing cache.' },
    { bad: 'Subsequent requests fail.', good: 'Later requests fail.' },
  ],
  scope: 'sentence',
  run({ sentence, doc }) {
    const found = [];
    for (const [re, plain] of INFLATED) {
      scan(doc.mask, sentence.start, sentence.end, re, ({ from, to, match }) => {
        found.push({
          from,
          to,
          message: `"${match.trim()}" is ${plain ? plain : 'nothing'}`,
          note: plain ? `Write "${plain}".` : 'Delete it.',
        });
      });
    }
    return found;
  },
};

export const deadWeight = {
  id: 'dead-weight',
  severity: 'warn',
  title: 'Phrases that carry no weight',
  why: 'These are fossils of legal and bureaucratic English. Each one wraps a single plain word in four or five extra ones. Nothing is lost by unwrapping it, and the reader gets the point three words sooner.',
  examples: [
    { bad: 'Due to the fact that the disk is full, writes fail.', good: 'Because the disk is full, writes fail.' },
    { bad: 'We retry in order to avoid data loss.', good: 'We retry to avoid data loss.' },
  ],
  scope: 'sentence',
  run({ sentence, doc }) {
    const found = [];
    for (const [re, plain] of DEAD_WEIGHT) {
      scan(doc.mask, sentence.start, sentence.end, re, ({ from, to, match }) => {
        found.push({
          from,
          to,
          message: `"${match.trim()}" means ${plain ? `"${plain}"` : 'nothing at all'}`,
          note: plain ? `Replace with "${plain}".` : 'Delete it.',
        });
      });
    }
    return found;
  },
};

export const buriedVerb = {
  id: 'buried-verb',
  severity: 'warn',
  title: 'Buried verbs (nominalisation)',
  why: 'This is the single highest-value change in English prose. Turning a verb into a noun forces you to add a weak verb in front of it ("make", "perform", "conduct") and usually forces you to hide who is acting. "We made a decision to relocate" is five words for "we decided to move". The noun form feels more serious. It is less clear.',
  examples: [
    { bad: 'The committee will perform an analysis of the failures.', good: 'The committee will analyze the failures.' },
    { bad: 'We need to make a decision about the schema.', good: 'We need to decide on the schema.' },
    { bad: 'The service conducts a retry of the request.', good: 'The service retries the request.' },
  ],
  scope: 'sentence',
  run({ sentence, doc }) {
    const found = [];
    for (const [re, verb] of BURIED_VERBS) {
      scan(doc.mask, sentence.start, sentence.end, re, ({ from, to, match }) => {
        found.push({
          from,
          to,
          message: `"${match.trim()}" buries the verb "${verb}"`,
          note: `Noun forms hide the actor and cost extra words. Prefer "${verb}".`,
        });
      });
    }
    return found;
  },
};

export default [hedge, apology, inflated, deadWeight, buriedVerb];
