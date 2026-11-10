// Bundles the converter page for Safari 14 (iOS 14.0-14.8). esbuild fails the build on
// syntax that Safari 14 cannot parse and that esbuild cannot lower.
import { build } from "esbuild"
import { copyFileSync, mkdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "dist")
mkdirSync(out, { recursive: true })

const result = await build({
  entryPoints: [join(here, "src", "main.js")],
  bundle: true,
  format: "iife",
  target: ["safari14"],
  minify: true,
  legalComments: "eof",
  outfile: join(out, "app.js"),
  logLevel: "warning",
  metafile: true,
  // Upstream services.js has a dead duplicate `case "imdb"` (harmless). Any OTHER warning,
  // for example an unsupported feature for safari14, still fails the build.
  logOverride: { "duplicate-case": "silent" },
})
if (result.warnings.length) throw new Error(`esbuild warnings: ${result.warnings.length}`)

copyFileSync(join(here, "web", "index.html"), join(out, "index.html"))

// Safari < 16.4 throws SyntaxError on regex lookbehind; esbuild only defers it to runtime.
const js = readFileSync(join(out, "app.js"), "utf8")
if (/\(\?<[=!]/.test(js)) throw new Error("dist/app.js contains regex lookbehind (Safari 14 SyntaxError)")
process.stdout.write(`built ${join(out, "app.js")} ${js.length} bytes\n`)
