// Bundles src/index.ts into one file: dist/widget.js (or --outfile <path>).
// Fails the build if the bundle goes over the 5 kb budget.
import { statSync } from "node:fs";
import { resolve } from "node:path";
import * as esbuild from "esbuild";

const MAX_BYTES = 5 * 1024;
const here = import.meta.dirname;
const outArg = process.argv.indexOf("--outfile");
const outfile = outArg > -1 ? resolve(process.argv[outArg + 1]) : resolve(here, "dist/widget.js");

/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: [resolve(here, "src/index.ts")],
  outfile,
  bundle: true,
  minify: true,
  format: "iife",
  // es2020: optional chaining stays native (smaller); every browser since 2020.
  target: "es2020",
  legalComments: "none",
  // Type-only imports from @askwell/shared are erased; nothing from it is bundled.
  tsconfig: resolve(here, "tsconfig.json"),
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log(`widget: watching, writing ${outfile}`);
} else {
  await esbuild.build(options);
  const { size } = statSync(outfile);
  if (size > MAX_BYTES) {
    console.error(`widget: ${outfile} is ${size} bytes, over the ${MAX_BYTES} byte budget`);
    process.exit(1);
  }
  console.log(`widget: ${outfile} ${size} bytes (budget ${MAX_BYTES})`);
}
