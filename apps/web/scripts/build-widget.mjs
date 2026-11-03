// Builds the widget loader (apps/widget) straight into public/widget.js, so
// the app serves it at /widget.js. Plain scripts, not pnpm pre/post hooks:
//
//   node scripts/build-widget.mjs              build once (before `next build`)
//   node scripts/build-widget.mjs --dev [...]  build once, then watch the widget
//                                              while running `next dev [...]`
//
// It writes to public/ directly instead of copying apps/widget/dist: the root
// `pnpm dev` also runs apps/widget's own watcher on dist, and reading a file
// another process may be writing could race. The 5 kb budget check runs on
// every one-off build. public/widget.js is gitignored.
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const web = resolve(import.meta.dirname, "..");
const widget = resolve(web, "../widget");
const build = [resolve(widget, "build.mjs"), "--outfile", resolve(web, "public/widget.js")];

execFileSync(process.execPath, build, { cwd: widget, stdio: "inherit" });

const devAt = process.argv.indexOf("--dev");
if (devAt > -1) {
  const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
  const watcher = spawn(process.execPath, [...build, "--watch"], { cwd: widget, stdio: "inherit" });
  const next = spawn(process.execPath, [nextBin, "dev", ...process.argv.slice(devAt + 1)], {
    cwd: web,
    stdio: "inherit",
  });

  const stop = (signal) => {
    watcher.kill(signal);
    next.kill(signal);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));
  next.on("exit", (code) => {
    watcher.kill();
    process.exit(code ?? 0);
  });
  watcher.on("exit", (code) => {
    if (code) console.error(`widget watcher exited with code ${code}`);
  });
}
