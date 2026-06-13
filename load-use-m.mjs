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
    sources = DEFAULT_SOURCES,
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

// Exposed for testing.
export { looksLikeUseModule, DEFAULT_SOURCES }
