// Guard against template-literal escape bugs in app/widget.js/route.ts.
//
// The widget's entire JS lives inside a template literal, where "\n"
// and friends get cooked at TS-compile time — a stray backslash can
// turn into a syntax error that kills the widget on every customer
// site (it has, twice). This script re-creates the cooked SOURCE
// string the same way the route does, writes it to a temp file, and
// runs `node --check` on it. Wire into prebuild so a broken widget
// fails the deploy instead of shipping.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const routePath = join(root, "app", "widget.js", "route.ts");
const src = readFileSync(routePath, "utf8");

// Slice out the SOURCE template literal (backtick to backtick). The
// literal opens at the marker below and is the last thing before the
// GET handler.
const openMarker = "const SOURCE = /* javascript */ `";
const start = src.indexOf(openMarker);
if (start === -1) {
  console.error("check-widget-syntax: SOURCE marker not found in route.ts");
  process.exit(1);
}
const afterOpen = start + openMarker.length;
const getIdx = src.indexOf("export async function GET", afterOpen);
const end = src.lastIndexOf("`;", getIdx === -1 ? src.length : getIdx);
if (end === -1 || end <= afterOpen) {
  console.error("check-widget-syntax: could not find end of SOURCE literal");
  process.exit(1);
}
const rawLiteral = src.slice(afterOpen, end);

// Also slice WIDGET_SHELL so its interpolation gets a faithful value.
const shellOpen = "const WIDGET_SHELL = `";
const shellStart = src.indexOf(shellOpen);
const shellEnd = src.indexOf("`;", shellStart);
const rawShell =
  shellStart === -1 || shellEnd === -1
    ? ""
    : src.slice(shellStart + shellOpen.length, shellEnd);

// Cook the literals with JS's own template-literal semantics by
// evaluating a generated module that pastes them verbatim.
const dir = mkdtempSync(join(tmpdir(), "ptk-widget-check-"));
const cookerPath = join(dir, "cook.mjs");
const cookedPath = join(dir, "widget-cooked.js");
const cooker = [
  'const CONVEX_URL = "https://example.convex.cloud";',
  "const WIDGET_SHELL = `" + rawShell + "`;",
  "const SOURCE = `" + rawLiteral + "`;",
  'import { writeFileSync } from "node:fs";',
  "writeFileSync(" + JSON.stringify(cookedPath) + ", SOURCE);",
].join("\n");
writeFileSync(cookerPath, cooker);

try {
  execFileSync(process.execPath, [cookerPath], { stdio: "pipe" });
  execFileSync(process.execPath, ["--check", cookedPath], { stdio: "pipe" });
} catch (err) {
  console.error("check-widget-syntax: FAILED — the cooked widget JS does not parse.");
  console.error("This is the template-literal escape trap. Offending output:");
  console.error(String(err.stderr || err.message).slice(0, 2000));
  process.exit(1);
}
console.log("check-widget-syntax: OK — cooked widget JS parses cleanly.");
