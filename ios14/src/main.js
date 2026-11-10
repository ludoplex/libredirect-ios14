// Converter page for iPhone 7 / iOS 14 Safari. Builds DOM with textContent only (no innerHTML).
import {
  bookmarklet,
  ensureOptions,
  fillEmptyInstances,
  incomingLink,
  loadInstanceList,
  parseInput,
  saveOptions,
  serviceCatalog,
  toFrontend,
  withServiceOption,
} from "./engine.js"

const LOADED_FLAG = "instancesLoaded"

async function refreshInstances(options) {
  $("instances-status").textContent = "Loading instance list..."
  try {
    const lists = await loadInstanceList(url => fetch(url, { cache: "no-store", referrerPolicy: "no-referrer" }))
    const next = fillEmptyInstances(options, lists)
    await saveOptions(next)
    await globalThis.browser.storage.local.set({ [LOADED_FLAG]: true })
    $("instances-status").textContent = "Instance list loaded."
    return next
  } catch (error) {
    $("instances-status").textContent = "Could not load the instance list: " + error.message
    return options
  }
}

const $ = id => document.getElementById(id)

const MESSAGES = {
  "invalid-url": "That is not an http or https link.",
  "no-redirect": "No enabled service matches this link.",
  "no-instance": "The selected front end has no instance in the list.",
}

function showResult(result, original) {
  const box = $("result")
  box.textContent = ""
  if (!result.ok) {
    box.textContent = MESSAGES[result.reason] || result.reason
    // Only http(s): a crafted "#javascript:..." link must never become a clickable anchor.
    const safe = parseInput(original)
    if (safe) box.appendChild(link(safe.href, "Open the original link"))
    return
  }
  if (result.navigable) box.appendChild(link(result.target, result.target))
  else box.appendChild(document.createTextNode(result.target))
}

function link(href, text) {
  const a = document.createElement("a")
  a.href = href
  a.textContent = text
  a.rel = "noreferrer"
  a.style.display = "block"
  return a
}

async function convert(input, navigate) {
  const result = await toFrontend(input)
  if (navigate && result.ok && result.navigable) {
    location.replace(result.target)
    return
  }
  showResult(result, input)
}

function option(value, text, selected) {
  const o = document.createElement("option")
  o.value = value
  o.textContent = text
  o.selected = selected
  return o
}

function renderSettings(options) {
  const list = $("services")
  list.textContent = ""
  let current = options
  for (const svc of serviceCatalog()) {
    const row = document.createElement("label")
    row.className = "svc"
    const check = document.createElement("input")
    check.type = "checkbox"
    check.checked = !!(current[svc.service] && current[svc.service].enabled)
    const name = document.createElement("span")
    name.textContent = svc.name
    const select = document.createElement("select")
    for (const f of svc.frontends) select.appendChild(option(f.id, f.name, current[svc.service].frontend === f.id))
    const update = patch => {
      current = withServiceOption(current, svc.service, patch)
      saveOptions(current)
    }
    check.addEventListener("change", () => update({ enabled: check.checked }))
    select.addEventListener("change", () => update({ frontend: select.value }))
    row.append(check, name, select)
    list.appendChild(row)
  }
}

async function start() {
  const page = location.href.split("#")[0].split("?")[0]
  $("bookmarklet").href = bookmarklet(page)
  $("bookmarklet-code").textContent = bookmarklet(page)
  $("shortcut-url").textContent = page + "#"
  $("form").addEventListener("submit", event => {
    event.preventDefault()
    convert($("input").value, false)
  })
  let options = await ensureOptions()
  const flag = await globalThis.browser.storage.local.get(LOADED_FLAG)
  if (!flag[LOADED_FLAG]) options = await refreshInstances(options)
  $("reload-instances").addEventListener("click", async () => {
    renderSettings(await refreshInstances(await ensureOptions()))
  })
  renderSettings(options)
  const incoming = incomingLink(location.hash, location.search)
  if (incoming) {
    $("input").value = incoming
    await convert(incoming, true)
  }
}

start().catch(error => {
  $("result").textContent = "Error: " + (error && error.message ? error.message : String(error))
})
