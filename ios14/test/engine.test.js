import { test } from "node:test"
import assert from "node:assert/strict"
import {
  INSTANCE_LIST_URL,
  bookmarklet,
  ensureOptions,
  fillEmptyInstances,
  incomingLink,
  loadInstanceList,
  parseInput,
  saveOptions,
  sanitizeInstanceList,
  serviceCatalog,
  toFrontend,
  withServiceOption,
} from "../src/engine.js"

const LIST = {
  invidious: { clearnet: ["https://inv.example"], tor: ["http://x.onion"] },
  redlib: { clearnet: ["https://redlib.example"] },
  bad: { clearnet: ["javascript:alert(1)"] },
  breezeWiki: { clearnet: ["https://bw.example"] },
}

async function freshOptions() {
  await globalThis.browser.storage.local.clear()
  return ensureOptions()
}

test("ensureOptions migrates options that lack a service (after an upstream sync)", async () => {
  const options = await freshOptions()
  const { youtube, ...withoutYoutube } = options
  assert.equal(youtube.enabled, true)
  await saveOptions({ ...withoutYoutube, invidious: ["https://kept.example"] })
  const migrated = await ensureOptions()
  assert.equal(typeof migrated.youtube, "object")
  assert.equal(migrated.youtube.frontend, "invidious")
  assert.deepEqual(migrated.invidious, ["https://kept.example"])
})

test("parseInput: schemes, bare hosts, junk", () => {
  assert.equal(parseInput("youtu.be/abc").href, "https://youtu.be/abc")
  assert.equal(parseInput(" http://a.b/c ").href, "http://a.b/c")
  assert.equal(parseInput("ftp://a.b"), null)
  assert.equal(parseInput("javascript:alert(1)"), null)
  assert.equal(parseInput(""), null)
  assert.equal(parseInput("https://"), null)
})

test("toFrontend: upstream defaults redirect YouTube once instances exist", async () => {
  const options = await freshOptions()
  assert.equal(options.youtube.enabled, true)
  assert.deepEqual(await toFrontend("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), { ok: false, reason: "no-instance" })
  await saveOptions(fillEmptyInstances(options, sanitizeInstanceList(LIST)))
  const r = await toFrontend("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
  assert.equal(r.ok, true)
  assert.equal(r.navigable, true)
  assert.equal(r.target, "https://inv.example/watch?v=dQw4w9WgXcQ")
})

test("toFrontend: disabled service, unmatched host, invalid input", async () => {
  await freshOptions()
  assert.deepEqual(await toFrontend("https://www.reddit.com/r/privacy/"), { ok: false, reason: "no-redirect" })
  assert.deepEqual(await toFrontend("https://example.com/"), { ok: false, reason: "no-redirect" })
  assert.deepEqual(await toFrontend("ftp://x"), { ok: false, reason: "invalid-url" })
})

test("toFrontend: enabling a service through withServiceOption", async () => {
  const options = fillEmptyInstances(await freshOptions(), sanitizeInstanceList(LIST))
  await saveOptions(withServiceOption(options, "reddit", { enabled: true, frontend: "redlib" }))
  const r = await toFrontend("https://www.reddit.com/r/privacy/")
  assert.equal(r.ok, true)
  assert.match(r.target, /^https:\/\/(redlib\.example|safereddit\.com)\/r\/privacy/)
})

test("BreezeWiki rewrite (former lookbehind regexes) still maps w:c: links", async () => {
  const options = fillEmptyInstances(await freshOptions(), sanitizeInstanceList(LIST))
  await saveOptions(withServiceOption(options, "fandom", { enabled: true, frontend: "breezeWiki" }))
  const sub = await toFrontend("https://minecraft.fandom.com/wiki/Creeper")
  assert.equal(sub.ok, true)
  assert.equal(new URL(sub.target).pathname, "/minecraft/wiki/Creeper")
  // The bare host skips upstream's subdomain branch and runs the patched w:c: branch.
  const wc = await toFrontend("https://fandom.com/wiki/w:c:minecraft:Creeper")
  assert.equal(wc.ok, true)
  assert.equal(new URL(wc.target).pathname, "/minecraft/wiki/Creeper")
})

test("capture-group regexes equal the upstream lookbehind regexes", () => {
  const oldWiki = /(?<=wiki\/w:c:)[a-zA-Z0-9-]+(?=:)/
  const oldPath = /(?<=wiki\/w:c:[a-zA-Z0-9-]+:).+/
  const newWiki = /wiki\/w:c:([a-zA-Z0-9-]+):/
  const newPath = /wiki\/w:c:[a-zA-Z0-9-]+:(.+)/
  const cases = ["/wiki/w:c:minecraft:Creeper", "/wiki/w:c:a-b:c:d", "/wiki/w:c:x:", "/wiki/Main", "/x/wiki/w:c:q1:p/q?r", "/wiki/w:c::a"]
  for (const p of cases) {
    const ow = p.match(oldWiki), nw = newWiki.exec(p)
    assert.equal(ow ? ow[0] : null, nw ? nw[1] : null, `wiki ${p}`)
    const op = p.match(oldPath), np = newPath.exec(p)
    assert.equal(op ? op[0] : null, np ? np[1] : null, `path ${p}`)
  }
})

test("sanitizeInstanceList: keeps https clearnet only, mirrors invidiousMusic, rejects non-objects", () => {
  const s = sanitizeInstanceList(LIST)
  assert.deepEqual(s.invidious, ["https://inv.example"])
  assert.deepEqual(s.invidiousMusic, ["https://inv.example"])
  assert.equal("bad" in s, false)
  assert.throws(() => sanitizeInstanceList(null), /not an object/)
  assert.throws(() => sanitizeInstanceList([1]), /not an object/)
})

test("fillEmptyInstances: fills only empty lists and returns a new object", () => {
  const before = { invidious: [], redlib: ["https://mine.example"], youtube: { enabled: true } }
  const after = fillEmptyInstances(before, sanitizeInstanceList(LIST))
  assert.notEqual(after, before)
  assert.deepEqual(before.invidious, [])
  assert.deepEqual(after.invidious, ["https://inv.example"])
  assert.deepEqual(after.redlib, ["https://mine.example"])
})

test("loadInstanceList: fetches the upstream URL and validates the status", async () => {
  let asked
  const ok = await loadInstanceList(url => ((asked = url), Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(LIST) })))
  assert.equal(asked, INSTANCE_LIST_URL)
  assert.deepEqual(ok.redlib, ["https://redlib.example"])
  await assert.rejects(loadInstanceList(() => Promise.resolve({ ok: false, status: 503 })), /HTTP 503/)
})

test("withServiceOption: immutability and validation", () => {
  const o = { youtube: { enabled: true, frontend: "invidious" } }
  const n = withServiceOption(o, "youtube", { enabled: false })
  assert.equal(o.youtube.enabled, true)
  assert.deepEqual(n.youtube, { enabled: false, frontend: "invidious" })
  assert.throws(() => withServiceOption(o, "nope", {}), /unknown service/)
  assert.throws(() => withServiceOption(o, "youtube", { frontend: "nope" }), /unknown frontend/)
})

test("serviceCatalog lists every upstream service with frontends", () => {
  const cat = serviceCatalog()
  const yt = cat.find(s => s.service === "youtube")
  assert.ok(cat.length > 40)
  assert.ok(yt.frontends.some(f => f.id === "invidious"))
})

test("bookmarklet and incomingLink round-trip", () => {
  const bm = bookmarklet("https://ludoplex.github.io/libredirect-ios14/#old")
  assert.equal(bm, 'javascript:location.href="https://ludoplex.github.io/libredirect-ios14/#"+encodeURIComponent(location.href)')
  const original = "https://www.youtube.com/watch?v=a&t=1"
  assert.equal(incomingLink("#" + encodeURIComponent(original), ""), original)
  assert.equal(incomingLink("#%E0%A4%A", ""), "%E0%A4%A")
  assert.equal(incomingLink("", "?url=" + encodeURIComponent(original)), original)
  assert.equal(incomingLink("", ""), null)
})
