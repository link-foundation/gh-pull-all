// Robust loader for use-m (https://github.com/link-foundation/use-m).
//
// The naive bootstrap used across this project:
//
//   const { use } = eval(await (await fetch('https://unpkg.com/use-m/use.js')).text())
//
// crashes with a confusing error whenever the CDN hiccups. When unpkg (or its
// upstream) returns an error body such as the plain text "Internal Server Error"
// instead of the module source, eval() tries to parse that text as JavaScript and
// throws `SyntaxError: Unexpected identifier 'Server'` — pointing at the eval line
// with no hint that the real problem is a transient network/CDN failure.
// See https://github.com/link-foundation/gh-pull-all/issues/35.
//
// loadUseM() makes the bootstrap resilient:
//   - it validates the HTTP status and the response body before eval(),
//   - it retries and falls back across multiple CDN mirrors, and
//   - it fails with a clear, actionable error message listing every attempt.

const DEFAULT_SOURCES = [
  'https://unpkg.com/use-m/use.js',
  'https://cdn.jsdelivr.net/npm/use-m/use.js',
  'https://esm.sh/use-m/use.js',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// Opt-in diagnostics (off by default). Set GH_PULL_ALL_DEBUG=1 (or DEBUG=gh-pull-all)
// to print which use-m mirror was loaded and the shape of every module that the
// interop helpers below unwrap. This is what pinpointed issue #50.
function isDebugEnabled() {
  const env = (typeof process !== 'undefined' && process.env) || {}
  const flag = String(env.GH_PULL_ALL_DEBUG || '').toLowerCase()
  if (flag && flag !== '0' && flag !== 'false' && flag !== 'no') return true
  return String(env.DEBUG || '').split(',').some((name) => name.trim() === 'gh-pull-all')
}

function debugLog(message) {
  if (isDebugEnabled()) console.error(`[gh-pull-all:use-m] ${message}`)
}

function describeShape(value) {
  if (value === null || value === undefined) return String(value)
  const keys = (typeof value === 'object' || typeof value === 'function') ? Object.keys(value) : []
  const shown = keys.slice(0, 8).join(', ') + (keys.length > 8 ? ', …' : '')
  return `${typeof value}${keys.length ? ` { ${shown} }` : ''}`
}

// Heuristic check that the fetched text is the use-m module source and not a CDN
// error page. Error responses are typically HTML or short plain-text bodies like
// "Internal Server Error" / "Bad Gateway"; the real module is JavaScript that
// defines a `use` function.
function looksLikeUseModule(source) {
  if (typeof source !== 'string') return false
  const trimmed = source.trim()
  if (trimmed.length === 0) return false
  // HTML error pages (e.g. Cloudflare / nginx) start with a tag.
  if (trimmed.startsWith('<')) return false
  // Common CDN/proxy error bodies that would otherwise be eval()'d as code.
  if (/^(internal server error|bad gateway|service unavailable|gateway timeout|not found|forbidden|too many requests)\.?$/i.test(trimmed)) {
    return false
  }
  // The module references `use` and contains JavaScript syntax.
  return trimmed.includes('use') && /[{(=]/.test(trimmed)
}

// GH_PULL_ALL_USE_M_URL lets users pin use-m (comma-separated URLs), e.g.
// GH_PULL_ALL_USE_M_URL=https://unpkg.com/use-m@8.16.4/use.js — an escape hatch
// for future use-m regressions and the way the issue #50 matrix test runs.
function getSourcesFromEnv() {
  const env = (typeof process !== 'undefined' && process.env) || {}
  const urls = String(env.GH_PULL_ALL_USE_M_URL || '').split(',').map((url) => url.trim()).filter(Boolean)
  return urls.length ? urls : null
}

/**
 * Load use-m, returning the object it exports (with a `use` function).
 *
 * @param {object} [options]
 * @param {typeof fetch} [options.fetch] - fetch implementation (defaults to globalThis.fetch)
 * @param {string[]} [options.sources] - ordered list of CDN URLs to try
 * @param {number} [options.maxAttemptsPerSource] - retries per source
 * @param {number} [options.retryDelayMs] - base delay between retries (linear backoff)
 * @returns {Promise<{ use: Function }>}
 */
export async function loadUseM(options = {}) {
  const {
    fetch: fetchImpl = globalThis.fetch,
    sources = getSourcesFromEnv() || DEFAULT_SOURCES,
    maxAttemptsPerSource = 3,
    retryDelayMs = 250,
  } = options

  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'Cannot load use-m: `fetch` is not available in this runtime. ' +
      'Use Node.js >= 18 / Bun, or provide a fetch implementation.'
    )
  }

  const failures = []

  for (const url of sources) {
    for (let attempt = 1; attempt <= maxAttemptsPerSource; attempt++) {
      try {
        const response = await fetchImpl(url)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim())
        }
        const source = await response.text()
        if (!looksLikeUseModule(source)) {
          const preview = source.slice(0, 80).replace(/\s+/g, ' ').trim()
          throw new Error(`response was not the use-m module (got: "${preview}")`)
        }
        const exported = eval(source)
        if (!exported || typeof exported.use !== 'function') {
          throw new Error('loaded module did not export a `use` function')
        }
        debugLog(`loaded use-m from ${response.url || url}`)
        return exported
      } catch (error) {
        failures.push(`${url} (attempt ${attempt}/${maxAttemptsPerSource}): ${error.message}`)
        if (attempt < maxAttemptsPerSource && retryDelayMs > 0) {
          await sleep(retryDelayMs * attempt)
        }
      }
    }
  }

  throw new Error(
    'Failed to load use-m from every CDN mirror. This is usually a transient ' +
    'network or CDN outage — please check your connection and try again.\n' +
    'Attempts:\n  - ' + failures.join('\n  - ')
  )
}

// ---------------------------------------------------------------------------
// Module-shape interop for values returned by use-m's `use()`.
//
// use-m does not guarantee a stable shape for what `use()` returns: it depends
// on the use-m release, the Node.js/Bun version, and on whether the package
// entry it resolves is CommonJS or ESM. For example `use('yargs@17.7.2')`
// returned:
//   - use-m <= 8.16.1: { default: yargs, 'module.exports': yargs }
//   - use-m 8.16.2:    yargs itself (callable, with a `default` property)
//   - use-m >= 8.16.3: yargs itself (callable, NO `default` property), because
//                      use-m now resolves yargs' ESM entry via `exports` and
//                      unwraps single-`default` ESM namespaces.
// So destructuring `{ default: yargs }` from `use('yargs@17.7.2')` gave `undefined`
// and gh-pull-all crashed with `TypeError: yargs is not a function`.
// See https://github.com/link-foundation/gh-pull-all/issues/50.
//
// These helpers accept every one of those shapes.

function unwrapCandidates(mod) {
  const candidates = []
  const seen = new Set()
  const add = (value) => {
    if (value === undefined || value === null || seen.has(value)) return
    seen.add(value)
    candidates.push(value)
  }
  add(mod)
  if (mod && (typeof mod === 'object' || typeof mod === 'function')) {
    add(mod.default)
    add(mod['module.exports'])
    if (mod.default && (typeof mod.default === 'object' || typeof mod.default === 'function')) {
      add(mod.default.default)
    }
  }
  return candidates
}

/**
 * Return the default export of a module loaded by use-m, regardless of whether
 * use-m already unwrapped it.
 *
 * @param {*} mod - value returned by `await use(...)`
 * @param {object} [options]
 * @param {string} [options.name] - module name used in error/debug messages
 * @param {string} [options.type] - required `typeof` of the export (e.g. 'function')
 * @param {string[]} [options.members] - functions the export must provide
 *   (e.g. ['ensureDir', 'remove'] for fs-extra); needed for object exports,
 *   where both the namespace and the default export are objects.
 */
export function getDefaultExport(mod, { name = 'module', type, members = [] } = {}) {
  const isMatch = (candidate) =>
    (!type || typeof candidate === type) &&
    members.every((member) => typeof candidate[member] === 'function')
  const match = (type || members.length)
    ? unwrapCandidates(mod).find(isMatch)
    : (mod && mod.default !== undefined ? mod.default : mod)
  debugLog(`${name}: use() returned ${describeShape(mod)}; default export -> ${describeShape(match)}`)
  if (match === undefined || match === null) {
    const expected = [type, members.length ? `with ${members.join(', ')}` : ''].filter(Boolean).join(' ')
    throw new TypeError(
      `Could not find the default export of '${name}' loaded via use-m ` +
      `(expected ${expected || 'a value'}, got ${describeShape(mod)}). ` +
      'This usually means use-m changed the shape of the modules it returns; ' +
      'please report it at https://github.com/link-foundation/gh-pull-all/issues ' +
      '(re-run with GH_PULL_ALL_DEBUG=1 for details).'
    )
  }
  return match
}

/**
 * Return a named export of a module loaded by use-m, looking through any
 * `default` / `module.exports` wrapper that use-m may or may not have removed.
 *
 * @param {*} mod - value returned by `await use(...)`
 * @param {string} exportName - the export to look up
 * @param {object} [options]
 * @param {string} [options.name] - module name used in error/debug messages
 * @param {string} [options.type] - required `typeof` of the export (e.g. 'function')
 * @param {boolean} [options.optional] - return undefined instead of throwing
 */
export function getNamedExport(mod, exportName, { name = 'module', type, optional = false } = {}) {
  for (const candidate of unwrapCandidates(mod)) {
    const value = candidate[exportName]
    if (value !== undefined && (!type || typeof value === type)) {
      debugLog(`${name}: named export '${exportName}' -> ${describeShape(value)}`)
      return value
    }
  }
  debugLog(`${name}: named export '${exportName}' not found in ${describeShape(mod)}`)
  if (optional) return undefined
  throw new TypeError(
    `Could not find export '${exportName}' of '${name}' loaded via use-m ` +
    `(got ${describeShape(mod)}). Re-run with GH_PULL_ALL_DEBUG=1 for details.`
  )
}

// Exposed for testing.
export { looksLikeUseModule, DEFAULT_SOURCES, isDebugEnabled, getSourcesFromEnv }
