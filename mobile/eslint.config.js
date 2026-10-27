// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*", "node_modules/*"],
  },
  {
    // tsc already checks namespace members. This rule reads the compiled JS and
    // skips files whose `export` doesn't start a line, which is how SDK 58
    // packages are built (`/** ... */ export var AndroidImportance = ...`),
    // so it reports real exports as missing.
    files: ["**/*.ts", "**/*.tsx"],
    rules: { "import/namespace": "off" },
  },
]);
