// Side-effect module. It must be imported BEFORE upstream services.js, because services.js
// reads `browser` and calls fetch("/config.json") while it is evaluated.
import config from "../../src/config.json" with { type: "json" }
import { installBrowserShim, installConfigFetch, localStorageBackend, memoryBackend } from "./shim.js"

const g = globalThis
const backend = localStorageBackend(g.localStorage) || memoryBackend()
installBrowserShim(g, backend)
installConfigFetch(g, config)

export { config, backend }
