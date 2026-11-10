// Stand-in for the WebExtension `browser` object so upstream services.js and utils.js
// run unmodified inside a plain web page on iOS 14 Safari, which has no extension API.

const PREFIX = "libredirect-ios14:"

/**
 * In-memory backend with the localStorage method subset this file uses.
 * Used when localStorage is missing or throws (for example a locked-down private tab).
 * @returns {{getItem(k:string):string|null, setItem(k:string,v:string):void, removeItem(k:string):void, keys():string[]}}
 */
export function memoryBackend() {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: k => void map.delete(k),
    keys: () => [...map.keys()],
  }
}

/**
 * Wraps window.localStorage in the backend shape. Returns null when storage is unusable.
 * @param {Storage | undefined} ls
 */
export function localStorageBackend(ls) {
  try {
    if (!ls) return null
    const probe = PREFIX + "probe"
    ls.setItem(probe, "1")
    ls.removeItem(probe)
  } catch {
    return null
  }
  return {
    getItem: k => ls.getItem(k),
    setItem: (k, v) => ls.setItem(k, v),
    removeItem: k => ls.removeItem(k),
    keys: () => Array.from({ length: ls.length }, (_, i) => ls.key(i)),
  }
}

function normalizeKeys(keys, backend) {
  if (keys === null || keys === undefined) {
    return backend
      .keys()
      .filter(k => k.startsWith(PREFIX))
      .map(k => k.slice(PREFIX.length))
  }
  if (typeof keys === "string") return [keys]
  if (Array.isArray(keys)) return keys
  return Object.keys(keys)
}

/**
 * chrome.storage.local-compatible area: callback and Promise styles both work.
 * @param {ReturnType<typeof memoryBackend>} backend
 */
export function createStorageArea(backend) {
  const done = (cb, value) => {
    if (typeof cb === "function") cb(value)
    return Promise.resolve(value)
  }
  return {
    get(keys, cb) {
      const out = {}
      for (const key of normalizeKeys(keys, backend)) {
        const raw = backend.getItem(PREFIX + key)
        if (raw !== null) out[key] = JSON.parse(raw)
      }
      return done(cb, out)
    },
    set(items, cb) {
      for (const [key, value] of Object.entries(items)) backend.setItem(PREFIX + key, JSON.stringify(value))
      return done(cb)
    },
    remove(keys, cb) {
      for (const key of normalizeKeys(keys, backend)) backend.removeItem(PREFIX + key)
      return done(cb)
    },
    clear(cb) {
      for (const key of normalizeKeys(null, backend)) backend.removeItem(PREFIX + key)
      return done(cb)
    },
  }
}

/**
 * Installs `browser` (and `window` when absent, for Node tests) on the target global.
 * @param {object} target usually globalThis
 * @param {ReturnType<typeof memoryBackend>} backend
 */
export function installBrowserShim(target, backend) {
  if (!target.window) target.window = target
  target.browser = {
    runtime: {},
    storage: {
      local: createStorageArea(backend),
      onChanged: { addListener() {} },
    },
  }
  target.chrome = target.browser
  return target.browser
}

/**
 * utils.getConfig() fetches "/config.json" from the extension root. A web page on a
 * project subpath cannot serve that path, so answer it from the bundled config.
 * @param {object} target usually globalThis
 * @param {object} config parsed src/config.json
 */
export function installConfigFetch(target, config) {
  const original = typeof target.fetch === "function" ? target.fetch.bind(target) : null
  const body = JSON.stringify(config)
  target.fetch = (input, init) => {
    if (input === "/config.json") {
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body), json: () => Promise.resolve(JSON.parse(body)) })
    }
    if (!original) return Promise.reject(new Error("fetch is not available"))
    return original(input, init)
  }
}
