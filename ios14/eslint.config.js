// eslint-plugin-compat flags Web APIs that Safari on iOS 14 lacks (browserslist "iOS >= 14"
// in package.json). esbuild target safari14 in build.mjs covers syntax.
import compat from "eslint-plugin-compat"
import globals from "globals"

export default [
  {
    files: ["src/**/*.js"],
    ...compat.configs["flat/recommended"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.browser },
  },
  {
    files: ["src/**/*.js"],
    rules: { "no-undef": "error", "no-unused-vars": "error" },
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.browser },
  },
  {
    // The bundle includes upstream services.js/utils.js, so their API use is checked too.
    // ecmaVersion 2021 = what Safari 14 parses (logical assignment, numeric separators).
    files: ["dist/app.js"],
    ...compat.configs["flat/recommended"],
    languageOptions: { ecmaVersion: 2021, sourceType: "script", globals: globals.browser },
  },
  {
    files: ["build.mjs", "test/**/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: globals.node },
  },
]
