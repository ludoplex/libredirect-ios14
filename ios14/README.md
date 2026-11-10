# LibRedirect for iPhone 7 / iOS 14 (Safari 14)

This fork runs upstream LibRedirect's redirect engine (`src/config.json` and
`src/assets/javascripts/services.js`, used unchanged except one regex fix) inside a plain web
page, so Safari 14 on iOS 14 can use it.

- Live page: https://ludoplex.github.io/libredirect-ios14/
- Targets: iOS 14.0-14.4 (Safari 14.0) and iOS 14.5-14.8 (Safari 14.1). It also works in later Safari versions.

## Why a web page and not an extension

Upstream is a Manifest V2 extension. It needs a persistent background page and blocking
`webRequest`. In MDN browser-compat-data 8.1.8 (https://unpkg.com/@mdn/browser-compat-data@8.1.8/data.json, read 2026-11-09):

| Feature | iOS Safari |
| --- | --- |
| Web extensions (`manifest.background`) | 15+ (none on iOS 14) |
| `background.persistent: true` | never ("Only non-persistent pages are supported") |
| `webRequest` | 18+ |
| `webRequest.onBeforeRequest` `extraInfoSpec` (blocking) | not supported |
| `declarativeNetRequest` | 15+; `Redirect` action 15.4+ |

So upstream cannot run in any iOS Safari as it is, and iOS 14 Safari has no extension API at
all. iOS 14 can still run bookmarklets, Shortcuts, and normal pages. This fork uses all three.

## How to use it on the iPhone

1. **Paste a link** on the page and tap Convert.
2. **Bookmarklet**: redirects the page that is open. Safari has already loaded the original
   site before you tap it. The page gives the steps.
3. **Shortcut from the Share Sheet**: converts a link *before* Safari opens it, so the original
   site gets no request. Long-press a link, tap Share, then tap the shortcut. The page gives the
   four Shortcuts actions.

Any tool can also link to the page directly: `https://ludoplex.github.io/libredirect-ios14/#<url-encoded link>`
or `...?url=<url-encoded link>`.

Settings (enabled services, front end per service) are saved in Safari `localStorage`. On the
first visit the page downloads the same instance list the extension uses
(`https://raw.githubusercontent.com/libredirect/instances/main/data.json`). It fills only empty
instance lists. Upstream defaults are kept: only YouTube (Invidious) is on. Turn on other
services in the list.

## Compatibility checks (run in CI)

- `esbuild` bundles with `target: safari14`. The build fails on any warning, and it fails if the
  bundle contains regex lookbehind (`(?<=`, `(?<!`). Safari before 16.4 throws SyntaxError on
  lookbehind.
- `eslint-plugin-compat` with browserslist `iOS >= 14` checks Web API use in `src/` and in the
  full bundle (upstream code included). The bundle also has to parse as ES2021.
- `node --test`: 17 tests, line coverage gate 80%.

The upstream change: `services.js` BreezeWiki (`fandom`) rewrite used two lookbehind regexes.
They are now capture groups. A test checks that the old and new regexes give the same result.

## Limitations

- This is not automatic redirection. Without an extension API, iOS 14 needs a tap.
- Front-end sites have their own JavaScript requirements. Some public instances need Safari
  15 or newer, or are down. Use "Reload instance list" and pick a different front end if one fails.
- iPhone 7 can update to iOS 15.8 (https://support.apple.com/en-us/100100). On iOS 15.4+ a
  `declarativeNetRequest` extension could redirect automatically. That is a different port,
  and it is not part of this fork.

## Build

```bash
cd ios14
npm ci
npm run check
```

Output: `ios14/dist/index.html` and `ios14/dist/app.js`.

Deploy: the `pages` job in `.github/workflows/ci.yml` publishes `ios14/dist` when Pages
`build_type` is `workflow`. Until GitHub Actions jobs can run on this account, Pages serves the
`gh-pages` branch, which holds a local `ios14/dist` build (each commit names its source commit).

## Upstream release cadence and sync

From the GitHub releases API (read 2026-11-09): 69 releases from v1.2 (2022-01-27) to v3.5.1
(2026-11-04). 2022: 42, 2023: 12, 2024: 9, 2025: 2, 2026: 4. The median gap is 4 days because
patch releases come in bursts. The longest gap is 265 days. Minor releases since 2024: 2.9.0
(2024-08-04), 3.0.0 (2024-09-13), 3.1.0 (2025-02-01), 3.2.0 (2025-06-28), 3.3.0 (2026-03-20),
3.4.0 (2026-07-24), 3.5.0 (2026-11-03). Upstream had 95 commits in the 90 days to 2026-11-09.

`.github/workflows/upstream-sync.yml` runs weekly. When upstream `master` has new commits, it
merges them into a `sync/upstream-<sha>` branch, runs the iOS 14 checks, and opens a PR
against `ios14`.
