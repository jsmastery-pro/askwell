// Builds the widget loader (apps/widget) straight into public/widget.js, so
// the app serves it at /widget.js. Runs before `next build` and `next dev`
// (see package.json); it's a plain script, not a pnpm pre/post hook.
//
// It writes to public/ directly instead of copying apps/widget/dist: the root
// `pnpm build` also builds apps/widget in parallel, and two builds writing and
// reading the same dist file could race. The 5 kb budget check still runs.
// public/widget.js is gitignored.
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const web = resolve(import.meta.dirname, "..");
const widget = resolve(web, "../widget");

execFileSync(
  process.execPath,
  [resolve(widget, "build.mjs"), "--outfile", resolve(web, "public/widget.js")],
  { cwd: widget, stdio: "inherit" },
);
