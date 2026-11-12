import test from 'node:test';
import assert from 'node:assert/strict';

import { tokenize } from '../src/tokenize.js';
import { runChecks, CHECKS, makeSnippet } from '../src/checks/index.js';

function run(text, checkId, config = {}) {
  return runChecks(tokenize(text), { only: [checkId], config });
}

function fires(text, checkId, config) {
  return run(text, checkId, config).length > 0;
}

test('every check has the shape the runner needs', () => {
  for (const check of CHECKS) {
    assert.ok(check.id, 'check needs an id');
    assert.ok(['error', 'warn', 'info'].includes(check.severity), `${check.id} has a bad severity`);
    assert.ok(['sentence', 'document'].includes(check.scope), `${check.id} has a bad scope`);
    assert.ok(check.title, `${check.id} needs a title`);
    assert.ok(check.why && check.why.length > 40, `${check.id} needs a real explanation`);
    assert.ok(Array.isArray(check.examples) && check.examples.length, `${check.id} needs examples`);
    for (const ex of check.examples) {
      assert.ok(ex.bad && ex.good, `${check.id} examples need bad and good`);
    }
    assert.equal(typeof check.run, 'function');
  }
});

test('check ids are unique', () => {
  const ids = CHECKS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

// buried-verb -------------------------------------------------------------

test('buried-verb catches light-verb constructions', () => {
  assert.ok(fires('We will perform an analysis of the queue depth.', 'buried-verb'));
  assert.ok(fires('The committee must make a decision today.', 'buried-verb'));
  assert.ok(fires('The service conducts a retry of the request.', 'buried-verb'));
  assert.ok(fires('Please give consideration to the alternative.', 'buried-verb'));
});

test('buried-verb leaves plain verbs alone', () => {
  assert.ok(!fires('We will analyze the queue depth.', 'buried-verb'));
  assert.ok(!fires('The committee must decide today.', 'buried-verb'));
  assert.ok(!fires('The service retries the request.', 'buried-verb'));
});

test('buried-verb names the verb it found', () => {
  const [f] = run('We made a decision about the schema.', 'buried-verb');
  assert.match(f.message, /decide/);
});

// inflated ----------------------------------------------------------------

test('inflated catches pompous diction', () => {
  assert.ok(fires('We utilise the existing cache.', 'inflated'));
  assert.ok(fires('Subsequent requests fail.', 'inflated'));
  assert.ok(fires('The job will commence at noon.', 'inflated'));
  assert.ok(fires('Prior to the release, run the tests.', 'inflated'));
});

test('inflated leaves precise technical verbs alone', () => {
  // "terminate the process" and "modify the file" are exact, not inflated.
  assert.ok(!fires('Terminate the process before detaching.', 'inflated'));
  assert.ok(!fires('Modify the file and save it.', 'inflated'));
  assert.ok(!fires('Use the existing cache.', 'inflated'));
});

// dead-weight -------------------------------------------------------------

test('dead-weight catches bureaucratic filler', () => {
  assert.ok(fires('Writes fail due to the fact that the disk is full.', 'dead-weight'));
  assert.ok(fires('We retry in order to avoid data loss.', 'dead-weight'));
  assert.ok(fires('The worker is able to recover.', 'dead-weight'));
});

test('dead-weight reports the longest overlapping match only once', () => {
  const found = run('Writes fail due to the fact that the disk is full.', 'dead-weight');
  assert.equal(found.length, 1, '"the fact that" is inside "due to the fact that"');
  assert.match(found[0].message, /because/);
});

// hedge -------------------------------------------------------------------

test('hedge catches words that drain force', () => {
  assert.equal(run('This is really quite fast.', 'hedge').length, 2);
  assert.ok(fires('It is basically exponential.', 'hedge'));
  assert.ok(fires('The value is sort of arbitrary.', 'hedge'));
});

test('hedge ignores sentences with nothing to hedge', () => {
  assert.ok(!fires('The cache expires after 60 seconds.', 'hedge'));
});

test('hedge does not mistake "rather than" for a flinch', () => {
  // "rather than" is a conjunction doing real work; "rather soft" is a hedge.
  assert.ok(!fires('The counter is a heuristic rather than a dictionary.', 'hedge'));
  assert.ok(!fires('Grain assumes CommonMark rather than another dialect.', 'hedge'));
  assert.ok(fires('The result is rather slow.', 'hedge'));
});

// apology -----------------------------------------------------------------

test('apology catches self-undermining openers', () => {
  assert.ok(fires("I'm not an expert, but the retry loop is unbounded.", 'apology'));
  assert.ok(fires('Sorry to bother you about the build.', 'apology'));
  assert.ok(fires('Just my two cents on the schema.', 'apology'));
});

test('apology ignores confident prose', () => {
  assert.ok(!fires('The retry loop is unbounded.', 'apology'));
});

// throat-clear ------------------------------------------------------------

test('throat-clear catches preambles', () => {
  assert.ok(fires('It is important to note that the cache is stale.', 'throat-clear'));
  assert.ok(fires('There is no doubt that this will regress.', 'throat-clear'));
  assert.ok(fires('Needless to say, the tests must pass.', 'throat-clear'));
});

test('throat-clear only fires at the start of a sentence', () => {
  assert.ok(!fires('Note that the cache is stale.', 'throat-clear'));
  assert.ok(!fires('The cache is stale, and it is worth remembering why.', 'throat-clear'));
});

test('throat-clear points at the preamble, not the whole sentence', () => {
  const source = 'It is worth noting that the cache is stale.';
  const [f] = run(source, 'throat-clear');
  assert.equal(source.slice(f.from, f.to), 'It is worth noting that');
});

// hidden-actor ------------------------------------------------------------

test('hidden-actor catches the actorless passive', () => {
  assert.ok(fires('Mistakes were made.', 'hidden-actor'));
  assert.ok(fires('The migration was run without a backup.', 'hidden-actor'));
  assert.ok(fires('The deadline was missed.', 'hidden-actor'));
});

test('hidden-actor stays quiet when the actor is named', () => {
  assert.ok(!fires('The file was written by the worker.', 'hidden-actor'));
  assert.ok(!fires('The job was queued by the scheduler.', 'hidden-actor'));
});

test('hidden-actor does not mistake adjectives for passives', () => {
  assert.ok(!fires('The retry loop is unbounded.', 'hidden-actor'));
  assert.ok(!fires('The config is based on the template.', 'hidden-actor'));
  assert.ok(!fires('The value is undefined at that point.', 'hidden-actor'));
  assert.ok(!fires('The layout is nested inside a grid.', 'hidden-actor'));
});

test('hidden-actor still catches un-prefixed real passives', () => {
  assert.ok(fires('The feature was unpublished after the report.', 'hidden-actor'));
});

test('hidden-actor does not read adverbs as participles', () => {
  // A generic [a-z]+en pattern matches "often" and "when"; [a-z]+ed matches "indeed".
  assert.ok(!fires('These findings are often right.', 'hidden-actor'));
  assert.ok(!fires('The real problem is when the cache expires.', 'hidden-actor'));
  assert.ok(!fires('That is indeed the case.', 'hidden-actor'));
});

// expletive ---------------------------------------------------------------

test('expletive catches placeholder subjects', () => {
  assert.ok(fires('There are three reasons the build fails.', 'expletive'));
  assert.ok(fires('It is the retry loop that causes the pileup.', 'expletive'));
});

test('expletive ignores sentences with a real subject', () => {
  assert.ok(!fires('The build fails for three reasons.', 'expletive'));
  assert.ok(!fires('The retry loop causes the pileup.', 'expletive'));
});

// zombie-noun -------------------------------------------------------------

test('zombie-noun catches abstractions doing the acting', () => {
  assert.ok(fires('This approach allows us to reduce latency.', 'zombie-noun'));
  assert.ok(fires('The framework provides a way to retry.', 'zombie-noun'));
});

test('zombie-noun ignores people and concrete subjects', () => {
  assert.ok(!fires('We reduce latency by caching the manifest.', 'zombie-noun'));
  assert.ok(!fires('The worker retries the request.', 'zombie-noun'));
});

// long-sentence -----------------------------------------------------------

test('long-sentence fires past the threshold', () => {
  const long = 'The worker, which the supervisor starts at boot and which owns the connection pool for every outbound request that the gateway forwards to it, will retry any request that fails with a transient error up to five times before giving up and writing a line to the log.';
  assert.ok(fires(long, 'long-sentence'));
});

test('long-sentence leaves ordinary prose alone', () => {
  assert.ok(!fires('The worker retries transient failures five times, then logs and gives up.', 'long-sentence'));
});

// echo --------------------------------------------------------------------

test('echo catches a repeated word in one sentence', () => {
  const found = run('The resolver resolves the resolver chain and returns a resolved path.', 'echo');
  assert.ok(found.length > 0);
  assert.match(found[0].message, /resolver/);
});

test('echo ignores short sentences', () => {
  assert.ok(!fires('The cache caches.', 'echo'));
});

test('echo respects the configured glossary', () => {
  const text = 'The resolver resolves the resolver chain and returns a resolved path.';
  assert.ok(fires(text, 'echo'));
  assert.ok(!fires(text, 'echo', { glossary: ['resolver'] }));
});

// monotony ----------------------------------------------------------------

test('monotony catches four same-length sentences', () => {
  const text = 'The worker polls the queue every second. The worker claims a single job. The worker runs the job completely. The worker reports the result back.';
  assert.ok(fires(text, 'monotony'));
});

test('monotony stays quiet when rhythm varies', () => {
  const text = 'The worker polls the queue every second, claims one job, and runs it to completion. Then it reports. It polls again immediately afterwards and the whole cycle repeats until the process is stopped by a supervisor.';
  assert.ok(!fires(text, 'monotony'));
});

test('monotony ignores list items, where parallel length is the point', () => {
  const text = [
    '- water the fern on a three day cycle',
    '- change the filter every six months',
    '- check the pump before the autumn rains',
    '- back up the photographs every month',
    '- call your mother on a Sunday evening',
    '',
  ].join('\n');
  assert.ok(!fires(text, 'monotony'));
});

test('monotony ignores table rows', () => {
  const text = [
    '| Check | Level |',
    '| --- | --- |',
    '| buried verbs | warn level |',
    '| throat clearing | warn level |',
    '| dead weight phrases | warn level |',
    '| inflated diction | warn level |',
    '| hedging words | info level |',
    '',
  ].join('\n');
  assert.ok(!fires(text, 'monotony'));
});

test('the same uniform sentences in flowing prose do fire', () => {
  const text = 'Water the fern on a three day cycle. Change the filter every six months. Check the pump before the autumn rains. Back up the photographs every month.';
  assert.ok(fires(text, 'monotony'));
});

test('monotony is scoped to a paragraph, not the whole document', () => {
  // Four uniform sentences, but a paragraph break sits between each pair, so
  // the reader's sense of rhythm resets and there is no drone.
  const text = [
    'Water the fern on a three day cycle.',
    '',
    'Change the filter every six months.',
    '',
    'Check the pump before the autumn rains.',
    '',
    'Back up the photographs every month.',
    '',
  ].join('\n');
  assert.ok(!fires(text, 'monotony'));
});

test('monotony does not reach across a code fence', () => {
  const text = [
    'Install the package from the registry first.',
    '',
    '```sh',
    'npm install grain --global',
    '```',
    '',
    'Then run it against a document of yours.',
    '',
    'It reports findings with line and column numbers.',
    '',
    'Nothing in the fenced block is ever analysed.',
    '',
  ].join('\n');
  assert.ok(!fires(text, 'monotony'));
});

// cross-cutting -----------------------------------------------------------

test('never flags prose inside a code fence', () => {
  const source = '# Title\n\n```js\nutilize(makeADecision());\nconst x = "very basically fine";\n```\n';
  assert.deepEqual(runChecks(tokenize(source)), []);
});

test('never flags inline code', () => {
  const source = 'Run `npm install` and then `make a decision` to continue.\n';
  const found = runChecks(tokenize(source), { only: ['buried-verb'] });
  assert.deepEqual(found, []);
});

test('skip removes a check entirely', () => {
  const source = 'We utilise the cache in order to make a decision.';
  assert.ok(runChecks(tokenize(source), { only: ['inflated'] }).length > 0);
  assert.deepEqual(runChecks(tokenize(source), { only: ['inflated'], skip: ['inflated'] }), []);
});

test('config severity overrides the default', () => {
  const [f] = runChecks(tokenize('This is really fast.'), {
    only: ['hedge'],
    config: { severity: { hedge: 'error' } },
  });
  assert.equal(f.severity, 'error');
});

test('findings are sorted by position', () => {
  const source = 'It is important to note that we utilise the cache in order to make a decision.';
  const found = runChecks(tokenize(source));
  const offsets = found.map((f) => f.from);
  assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
});

test('findings carry a usable location', () => {
  const source = 'First line is clean.\nWe utilise the cache here.\n';
  const [f] = runChecks(tokenize(source), { only: ['inflated'] });
  assert.equal(f.line, 2);
  assert.equal(source.slice(f.from, f.to), 'utilise');
});

test('snippet underlines the right span', () => {
  const source = 'We utilise the cache in order to avoid data loss.';
  const snippet = makeSnippet(source, 3, 10);
  assert.equal(snippet.caretEnd - snippet.caretStart, 'utilise'.length);
  assert.equal(snippet.text.slice(snippet.caretStart, snippet.caretEnd), 'utilise');
});

test('snippet caps an over-wide underline', () => {
  const source = `${'x'.repeat(200)}`;
  const snippet = makeSnippet(source, 0, 200);
  assert.ok(snippet.text.length <= 200);
});
