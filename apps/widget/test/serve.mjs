/* global process, console, URL */
// Serves test/index.html on its own port, so it runs on a different origin from the app.
// APP_URL=https://… WIDGET_KEY=pk_… PORT=5500 pnpm --filter @askwell/widget test:page
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 5500);
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const key = process.env.WIDGET_KEY ?? "";

const escape = (value) =>
  value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const template = await readFile(new URL("./index.html", import.meta.url), "utf8");
const html = template.replaceAll("{{APP_URL}}", escape(appUrl)).replaceAll("{{WIDGET_KEY}}", escape(key));

createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, "0.0.0.0", () => {
  console.log(`Test page on http://localhost:${port} (app ${appUrl}, key ${key || "not set"})`);
});
