# grain

**Find where your prose is hiding.**

`grain` is a linter for precision, not grammar. It reads markdown and plain text, then points at the places where a sentence does less work than it could. Verbs buried inside nouns. Preambles before the point. Hedges that drain force. Abstractions posing as actors. Apologies that undercut you before you have said anything.

It flags and explains. It never rewrites your prose.

Zero dependencies. Offline. Node 20 or newer.

## Why another writing tool

Spell-checkers and grammar checkers hunt for correctness. That is the easy half. A sentence can be grammatically perfect and still hide what the writer means.

The interesting failures are habits rather than typos:

- **Buried verbs.** `make a decision` wraps `decide` in three extra words. Nominalisation is the most expensive habit in English prose, because it hides the actor at the same time.
- **Throat-clearing.** `It is important to note that X` says `X`, plus a claim about the importance of `X` that nobody needed.
- **Hedging.** `very`, `quite`, `basically`, `sort of`. Hedges protect the writer and cost the reader certainty.
- **Actorless passives.** `Mistakes were made` is a complete sentence with nobody in it.
- **Zombie nouns.** `This approach allows us to...` — approaches do not allow things, people build them.
- **Apologies.** `I'm not an expert, but...` disqualifies you before the argument starts.

`grain` names each one, underlines the exact span, and says what it costs. What you do about it is your business.

A tool that rewrites your sentences stops you learning to write them.

## Install

```sh
git clone https://github.com/rossbuckley1990-hash/grain.git
cd grain
npm link        # puts `grain` on your PATH
grain --help
```

Or run it straight from the checkout, with no install step:

```sh
node /path/to/grain/bin/grain.js README.md
```

## Quick start

```sh
grain README.md              # one file
grain docs/                  # a directory, walked recursively
cat draft.md | grain         # stdin
grain --diff                 # only prose you changed
```

Here is real output from `examples/before.md`, with one long note elided:

```
examples/before.md
  3:1     warn  throat-clear
         "it is important to note that" delays the point
    > # Release notes It is important to note that the worker will perform an…
                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         Delete the preamble. Your sentence starts at "the worker will perform
         an analysis of the queue depth due to the fact that the previous…".

  3:46    warn  buried-verb
         "perform an analysis" buries the verb "analyze"
    > …note that the worker will perform an analysis of the queue depth due to…
                                 ^^^^^^^^^^^^^^^^^^^
         Noun forms hide the actor and cost extra words. Prefer "analyze".

  4:7     warn  dead-weight
         "due to the fact that" means "because"
    > …analysis of the queue depth due to the fact that the previous implementation…
                                   ^^^^^^^^^^^^^^^^^^^^
         Replace with "because".

  12:53   info  hidden-actor
         "were made" hides who did it
    > …somewhat arbitrary. Mistakes were made when the timeout was chosen.…
                                    ^^^^^^^^^
         Name the actor, or ignore this if there genuinely is none.

1 file · 4 warnings, 14 notes
172 words · 16 sentences · avg 10.8 · longest sentence 29 words · reading ease 65
```

`examples/after.md` is the same document rewritten, and `grain` reports nothing on it.

## The checks

| Check | Level | What it catches |
| --- | --- | --- |
| `buried-verb` | warn | `perform an analysis` for `analyze` |
| `throat-clear` | warn | `it should be noted that` before the point |
| `dead-weight` | warn | `due to the fact that` for `because` |
| `inflated` | warn | `utilise` for `use` |
| `long-sentence` | warn | a sentence past 38 words |
| `hedge` | info | `very`, `really`, `quite`, `sort of` |
| `apology` | info | `I'm not an expert, but` |
| `hidden-actor` | info | passive voice with the actor deleted |
| `expletive` | info | `There are three reasons` for `The build fails for three reasons` |
| `zombie-noun` | info | `this approach allows` making an abstraction the actor |
| `echo` | info | the same word twice in one sentence |
| `monotony` | info | four consecutive sentences of near-identical length |

Run `grain --list` for the live table, or `grain --why buried-verb` for the long argument behind any single check, with before-and-after examples. `grain --why` prints all of them.

Severity is a claim about confidence, not importance. `warn` marks patterns that are almost always worth changing. `info` marks patterns that are often fine and occasionally load-bearing, so `grain` shows them without failing your build.

## Reviewing a change

`grain` exists for this workflow. Pointing it at a large existing repository produces a wall of findings nobody will read. Pointing it at your diff produces four findings you will act on today.

```sh
grain --diff              # prose added in the working tree
grain --staged            # prose you are about to commit
grain --diff=main         # prose added on this branch since main
```

`--diff` restricts findings to lines git reports as added, so a finding on a paragraph you did not touch never appears.

### Pre-commit hook

```sh
#!/bin/sh
exec grain --diff --staged --quiet
```

### GitHub Actions

```yaml
- name: Check changed prose
  run: grain --diff=origin/${{ github.base_ref }} --format concise
```

`--format concise` prints one `file:line:col: level [check] message` line per finding, which GitHub Actions turns into annotations.

## Configuration

`grain` walks up from the working directory looking for `.grainrc.json`:

```json
{
  "skip": ["hedge", "monotony"],
  "severity": { "long-sentence": "error", "zombie-noun": "warn" },
  "glossary": ["kubernetes", "etcd", "Postgres"],
  "ignore": ["vendor/**", "CHANGELOG.md"],
  "extensions": [".md", ".mdx", ".txt"]
}
```

- `skip` turns checks off everywhere.
- `severity` overrides a check's default level, which changes whether it fails the build.
- `glossary` exempts domain terms from `echo`. Technical writing repeats its nouns on purpose. Nobody keeps a linter installed that complains about it.
- `ignore` takes gitignore-style patterns. A `.grainignore` file works the same way, one pattern per line.
- `extensions` decides which files a directory walk collects. `node_modules`, `.git`, `dist` and `build` are always skipped.

An explicit file argument is always checked, even when an ignore pattern would otherwise exclude it.

## Output formats

| Flag | Audience |
| --- | --- |
| `--format human` | you, in a terminal. The default. |
| `--format concise` | your editor, or `grep` |
| `--format json` | a script |
| `--format markdown` | a pull request comment |

`--quiet` keeps the findings and drops the snippets. `--no-color` strips ANSI codes, and `grain` also respects `NO_COLOR` and disables colour automatically when stdout is not a terminal.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | clean, or nothing at or above `--fail-on` |
| 1 | findings at or above `--fail-on` (default `warn`) |
| 2 | usage error, unreadable file, bad config |
| 3 | unexpected failure |

`--fail-on error` reports warnings without failing. `--fail-on never` always exits 0, which suits an advisory check in CI.

## How it works

`grain` builds a **mask** of your document: a copy of the source, the same length, where every character that is not prose has been replaced with a space. Code blocks go blank, along with inline spans, link targets, images, HTML tags, YAML front matter, table separators and markdown syntax.

Because the mask is the same length as the source, offsets carry over directly. Checks analyse the mask and report real `line:col` positions. Nothing inside a code block can produce a finding. `snake_case` identifiers survive, because an underscore between two word characters is not an emphasis marker.

The mask feeds a sentence splitter that knows about hard-wrapped prose, abbreviations (`Dr.`, `e.g.`, `U.S.`, `5 p.m.`), decimal numbers, list items, headings and tables. Each sentence carries its offsets, its words and its word count, so checks receive position information for free.

Reading ease uses a heuristic syllable counter rather than a pronouncing dictionary. That keeps the dependency count at zero and is accurate enough for a proxy, so `grain` labels the number as an estimate and never fails a build on it.

## What grain will never do

- **Rewrite your prose.** It has no autofix flag and never will. Showing you a problem and solving it for you are different acts, and only the first one teaches.
- **Enforce a house style.** No rule about the Oxford comma, no British-versus-American spelling preference, no opinion on paragraph length.
- **Score you.** The metrics at the end describe the document. They are not a grade, and nothing fails because of them.
- **Phone home.** No network calls, no telemetry, no config outside your repository.

## Limitations

`grain` matches patterns; it does not parse English. It will miss a buried verb it has no pattern for, and it will occasionally flag a passive that is genuinely the right construction. Every check ships at a severity that reflects how often it is right, and `--skip` exists because you know your document better than any linter does.

The syllable counter is a heuristic. The markdown masker assumes CommonMark rather than some other wiki dialect.

## Development

```sh
npm test              # 129 tests, node:test, no dependencies
npm run demo          # run grain against examples/before.md
npm run lint          # run grain against this README
```

The test suite covers the mask invariants, so length and newline positions must survive masking. It covers sentence splitting on abbreviations and hard wraps. Each check gets a positive case and a negative one. The glob matcher, all four output formats and each exit code have their own tests, as do `--diff` and `--staged` against throwaway git repositories.

One test runs `grain` against this README and fails if it finds anything at `warn` or above. The project holds itself to the bar it sets.

Checks live in `src/checks/`. Each is an object with an `id`, a default `severity`, a `scope` of `sentence` or `document`, a `why` that argues the case, `examples`, and a `run` function returning spans. Adding a check means writing one object and its tests.

## License

MIT. See [LICENSE](LICENSE).
