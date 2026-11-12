// Configuration discovery and path matching. No dependencies: the glob
// matcher is thirty lines because that is all this tool needs.

import fs from 'node:fs';
import path from 'node:path';

export const DEFAULTS = {
  skip: [],
  severity: {},
  glossary: [],
  ignore: [],
  extensions: ['.md', '.markdown', '.mdx', '.txt', '.text', '.rst', '.adoc'],
};

const CONFIG_NAME = '.grainrc.json';
const IGNORE_NAME = '.grainignore';

export function globToRegex(pattern) {
  const anchored = pattern.includes('/');
  let src = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        src += '.*';
        i += 1;
        if (pattern[i + 1] === '/') i += 1;
      } else {
        src += '[^/]*';
      }
    } else if (c === '?') {
      src += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      src += `\\${c}`;
    } else {
      src += c;
    }
  }
  return new RegExp(anchored ? `^${src}$` : `(?:^|/)${src}$`);
}

export function isIgnored(relativePath, patterns) {
  const normalised = relativePath.split(path.sep).join('/');
  return patterns.some((regex) => regex.test(normalised));
}

function compileIgnore(patterns) {
  return patterns
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#'))
    .map(globToRegex);
}

/** Walk up from `startDir` looking for the nearest config file. */
function findUpwards(startDir, name) {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, name);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * @param {{ configPath?: string, cwd?: string }} [options]
 */
export function loadConfig(options = {}) {
  const cwd = options.cwd || process.cwd();
  const configPath = options.configPath
    ? path.resolve(options.configPath)
    : findUpwards(cwd, CONFIG_NAME);

  let user = {};
  if (configPath) {
    try {
      user = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (err) {
      throw new Error(`could not read ${configPath}: ${err.message}`);
    }
  }

  const ignorePatterns = [...DEFAULTS.ignore, ...(user.ignore || [])];

  const ignoreFile = findUpwards(cwd, IGNORE_NAME);
  if (ignoreFile) {
    try {
      ignorePatterns.push(...fs.readFileSync(ignoreFile, 'utf8').split('\n'));
    } catch {
      // An unreadable ignore file should not stop a lint run.
    }
  }

  return {
    ...DEFAULTS,
    ...user,
    configPath,
    ignore: compileIgnore(ignorePatterns),
    severity: user.severity || {},
    glossary: user.glossary || [],
    skip: user.skip || [],
  };
}

const ALWAYS_SKIP_DIRS = new Set(['.git', 'node_modules', '.hg', '.svn', 'dist', 'build', '.next']);

function walk(dir, root, config, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(root, full);
    if (entry.isDirectory()) {
      if (ALWAYS_SKIP_DIRS.has(entry.name) || isIgnored(rel, config.ignore)) continue;
      walk(full, root, config, out);
      continue;
    }
    if (!config.extensions.includes(path.extname(entry.name).toLowerCase())) continue;
    if (isIgnored(rel, config.ignore)) continue;
    out.push(full);
  }
  return out;
}

/**
 * Expand CLI paths into a list of files. Directories are walked; explicit file
 * arguments are always checked, even if they would otherwise be ignored.
 */
export function collectFiles(inputs, config, cwd = process.cwd()) {
  const files = [];
  for (const input of inputs) {
    const full = path.resolve(cwd, input);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      throw new Error(`no such file or directory: ${input}`);
    }
    if (stat.isDirectory()) {
      walk(full, full, config, files);
    } else {
      files.push(full);
    }
  }
  return [...new Set(files)].sort();
}
