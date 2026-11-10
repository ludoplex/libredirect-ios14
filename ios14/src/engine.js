// Page-side API over the unmodified upstream redirect engine.
import { config } from "./install.js"
import services from "../../src/assets/javascripts/services.js"

const NO_INSTANCE_HOST = "no-instance.libredirect.invalid"

const readOptions = async () => (await globalThis.browser.storage.local.get("options")).options

/**
 * Stored options, created from upstream defaults on first use. When an upstream sync adds or
 * removes services, upstream's own processUpdate() migrates the stored options.
 * @returns {Promise<object>}
 */
export async function ensureOptions() {
  const stored = await readOptions()
  if (!stored) {
    await services.initDefaults()
    return readOptions()
  }
  const outdated = Object.keys(config.services).some(s => !stored[s] || typeof stored[s] !== "object")
  if (!outdated) return stored
  await services.processUpdate(stored)
  return readOptions()
}

/** @param {object} options */
export function saveOptions(options) {
  return globalThis.browser.storage.local.set({ options })
}

/**
 * Accepts "https://x", "http://x" or a bare "youtube.com/watch?v=..." and returns a URL.
 * @param {string} input
 * @returns {URL | null}
 */
export function parseInput(input) {
  const text = String(input || "").trim()
  if (!text) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  let url
  try {
    url = new URL(withScheme)
  } catch {
    return null
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : null
}

/**
 * @typedef {{ ok: true, target: string, navigable: boolean } | { ok: false, reason: string }} Conversion
 */

/**
 * @param {string} input original link
 * @returns {Promise<Conversion>}
 */
export async function toFrontend(input) {
  const url = parseInput(input)
  if (!url) return { ok: false, reason: "invalid-url" }
  await ensureOptions()
  let target
  try {
    target = await services.redirectAsync(url, "main_frame", null, null, false, false)
  } catch (error) {
    return { ok: false, reason: `engine-error: ${error && error.message ? error.message : String(error)}` }
  }
  if (!target || target === "CANCEL" || target === "BYPASSTAB") return { ok: false, reason: "no-redirect" }
  const out = parseTarget(target)
  if (out && out.hostname === NO_INSTANCE_HOST) return { ok: false, reason: "no-instance" }
  return { ok: true, target, navigable: !!out && (out.protocol === "https:" || out.protocol === "http:") }
}

function parseTarget(target) {
  try {
    return new URL(target)
  } catch {
    return null
  }
}

/** @returns {{ service: string, name: string, frontends: { id: string, name: string }[] }[]} */
export function serviceCatalog() {
  return Object.entries(config.services).map(([service, info]) => ({
    service,
    name: info.name || service,
    frontends: Object.entries(info.frontends).map(([id, f]) => ({ id, name: f.name || id })),
  }))
}

/**
 * Returns a NEW options object with one service changed.
 * @param {object} options
 * @param {string} service
 * @param {{ enabled?: boolean, frontend?: string }} patch
 */
export function withServiceOption(options, service, patch) {
  if (!config.services[service]) throw new Error(`unknown service: ${service}`)
  if (patch.frontend !== undefined && !config.services[service].frontends[patch.frontend]) {
    throw new Error(`unknown frontend ${patch.frontend} for ${service}`)
  }
  return { ...options, [service]: { ...options[service], ...patch } }
}

/** Same source the upstream extension uses (utils.getList, option fetchInstances = "github"). */
export const INSTANCE_LIST_URL = "https://raw.githubusercontent.com/libredirect/instances/main/data.json"

const isHttpsList = v => Array.isArray(v) && v.every(x => typeof x === "string" && /^https:\/\/[^\s/]+/.test(x))

// Upstream "clearnet" lists include overlay-network hosts (for example inv.nadeko.ygg) that
// stock Safari cannot resolve. A random pick of one gives a failed page load.
const OVERLAY_TLD = /\.(ygg|i2p|onion|loki|bit)$/i
const reachable = href => {
  try {
    return !OVERLAY_TLD.test(new URL(href).hostname)
  } catch {
    return false
  }
}

/**
 * Keeps only { frontend: { clearnet: ["https://..."] } } entries; drops anything malformed
 * and hosts on overlay networks.
 * @param {unknown} data parsed data.json
 * @returns {Record<string, string[]>}
 */
export function sanitizeInstanceList(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("instance list is not an object")
  const out = {}
  for (const [frontend, entry] of Object.entries(data)) {
    if (!entry || !isHttpsList(entry.clearnet)) continue
    const usable = entry.clearnet.filter(reachable)
    if (usable.length) out[frontend] = usable
  }
  out.invidiousMusic = out.invidiousMusic || out.invidious
  return out
}

/**
 * Returns NEW options where each EMPTY instance list is filled from the downloaded list.
 * Lists the user already has are kept.
 * @param {object} options
 * @param {Record<string, string[]>} lists output of sanitizeInstanceList
 */
export function fillEmptyInstances(options, lists) {
  const next = { ...options }
  for (const [frontend, current] of Object.entries(options)) {
    if (Array.isArray(current) && current.length === 0 && lists[frontend] && lists[frontend].length) {
      next[frontend] = lists[frontend].slice()
    }
  }
  return next
}

/**
 * @param {(url: string) => Promise<{ ok: boolean, status: number, json(): Promise<unknown> }>} fetchImpl
 */
export async function loadInstanceList(fetchImpl) {
  const response = await fetchImpl(INSTANCE_LIST_URL)
  if (!response.ok) throw new Error(`instance list HTTP ${response.status}`)
  return sanitizeInstanceList(await response.json())
}

/**
 * javascript: bookmark that sends the current page to this converter.
 * @param {string} pageUrl absolute URL of the converter page (no hash)
 */
export function bookmarklet(pageUrl) {
  const base = pageUrl.split("#")[0]
  return `javascript:location.href=${JSON.stringify(base + "#")}+encodeURIComponent(location.href)`
}

/**
 * Reads the link handed to the page: "#<encoded url>" (bookmarklet, Shortcut) or "?url=".
 * @param {string} hash location.hash
 * @param {string} search location.search
 */
export function incomingLink(hash, search) {
  const h = (hash || "").replace(/^#/, "")
  if (h) {
    try {
      return decodeURIComponent(h)
    } catch {
      return h
    }
  }
  return new URLSearchParams(search || "").get("url")
}
