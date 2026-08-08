import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import json from "@rollup/plugin-json";

// Bundles src/plugin.js → backend/plugin.cjs
// - SDK (@eniac/flexdesigner) is BUNDLED into the output (official flexcli strategy)
// - @napi-rs/canvas and .node natives stay external; canvas package is copied into
//   the plugin dir node_modules at build time (see scripts/copy-canvas.sh)
export default {
  input: "com.dylanL.maccontrol.plugin/src/plugin.js",
  output: {
    file: "com.dylanL.maccontrol.plugin/backend/plugin.cjs",
    format: "cjs",
    exports: "auto"
  },
  plugins: [
    json(),
    nodeResolve({ browser: false, exportConditions: ["node"], preferBuiltins: true }),
    commonjs(),
    terser()
  ],
  external: (id) =>
    id === "@napi-rs/canvas" ||
    id.startsWith("node:") ||
    id.endsWith(".node")
};
