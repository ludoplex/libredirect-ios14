import { test } from "node:test"
import assert from "node:assert/strict"
import { createStorageArea, installConfigFetch, localStorageBackend, memoryBackend } from "../src/shim.js"

test("storage area: set/get with callback and promise", async () => {
  const area = createStorageArea(memoryBackend())
  await area.set({ options: { a: 1 }, other: "x" })
  assert.deepEqual(await area.get("options"), { options: { a: 1 } })
  const viaCb = await new Promise(resolve => area.get(["options", "other", "missing"], resolve))
  assert.deepEqual(viaCb, { options: { a: 1 }, other: "x" })
  assert.deepEqual(await area.get({ other: null }), { other: "x" })
  assert.deepEqual(await area.get(null), { options: { a: 1 }, other: "x" })
})

test("storage area: clear removes only prefixed keys; remove works", async () => {
  const backend = memoryBackend()
  backend.setItem("foreign", "keep")
  const area = createStorageArea(backend)
  await area.set({ a: 1, b: 2 })
  await area.remove("a")
  assert.deepEqual(await area.get(null), { b: 2 })
  let called = false
  await area.clear(() => (called = true))
  assert.equal(called, true)
  assert.deepEqual(await area.get(null), {})
  assert.equal(backend.getItem("foreign"), "keep")
})

test("localStorageBackend: null when missing or throwing, wraps a working one", () => {
  assert.equal(localStorageBackend(undefined), null)
  const throwing = { setItem() { throw new Error("QuotaExceededError") } }
  assert.equal(localStorageBackend(throwing), null)
  const data = new Map()
  const fake = {
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, v),
    removeItem: k => data.delete(k),
    key: i => [...data.keys()][i],
    get length() { return data.size },
  }
  const b = localStorageBackend(fake)
  b.setItem("libredirect-ios14:x", "1")
  assert.deepEqual(b.keys(), ["libredirect-ios14:x"])
  assert.equal(b.getItem("libredirect-ios14:x"), "1")
  b.removeItem("libredirect-ios14:x")
  assert.equal(b.getItem("libredirect-ios14:x"), null)
})

test("config fetch: answers /config.json, passes other URLs through, rejects without fetch", async () => {
  const seen = []
  const target = { fetch: url => (seen.push(url), Promise.resolve("passthrough")) }
  installConfigFetch(target, { services: { s: 1 } })
  const r = await target.fetch("/config.json")
  assert.deepEqual(JSON.parse(await r.text()), { services: { s: 1 } })
  assert.deepEqual(await r.json(), { services: { s: 1 } })
  assert.equal(await target.fetch("https://example.org/"), "passthrough")
  assert.deepEqual(seen, ["https://example.org/"])
  const bare = {}
  installConfigFetch(bare, {})
  await assert.rejects(bare.fetch("https://example.org/"), /fetch is not available/)
})
