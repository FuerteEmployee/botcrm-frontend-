// Guards against the 2026-09-21 incident: a production-mode build was shipped
// to staging, so every phone called the production API/database (see
// OPERATIONS.md §0, rule 1, and rule 5 — staging and production never share a
// database). Each `npm run build*` script runs this right after `vite build`
// with the mode it just built, so a build with the wrong API URL baked in
// fails loudly instead of shipping.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";

// Only the two modes that ever get deployed to a live domain. "development"
// is excluded on purpose: it's never shipped anywhere, and a bare "localhost"
// check would false-positive on vendor libraries that use it as a generic
// default (router history origin, socket fallback) for unrelated reasons.
const MODES = ["staging", "production"];

function readApiUrl(mode) {
  const file = path.join(ROOT, `.env.${mode}`);
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^VITE_API_URL=(.+)$/m);
  if (!match) throw new Error(`${file} has no VITE_API_URL`);
  return match[1].trim();
}

// Search for the full scheme+host (e.g. "https://api.beontimeofficial.com"),
// not the bare host. Two reasons: (1) "api.beontimeofficial.com" is a plain
// substring of "staging-api.beontimeofficial.com", which would false-positive
// on every correct staging build; (2) unrelated hardcoded strings (e.g. the
// biometric-device setup screen tells admins to type the bare production
// hostname into a physical ZKTeco device's "Server Address" field, regardless
// of which web build they're viewing it from) don't include the scheme, so
// they no longer collide with this check. This mirrors OPERATIONS.md §6.1's
// own manual grep, which greps for the full "https://..." URL for the same
// reason.
function containsApiUrl(text, url) {
  return text.includes(new URL(url).origin);
}

function listBundleFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listBundleFiles(full));
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function main() {
  const mode = process.argv[2];
  if (!mode || !MODES.includes(mode)) {
    console.error(`Usage: node verify-build-target.js <${MODES.join("|")}>`);
    process.exit(1);
  }

  const urls = Object.fromEntries(MODES.map((m) => [m, readApiUrl(m)]));
  const expectedOrigin = new URL(urls[mode]).origin;

  const distDir = path.join(ROOT, "dist");
  if (!fs.existsSync(distDir)) {
    console.error(`verify-build-target: ${distDir} does not exist — did the build step run first?`);
    process.exit(1);
  }

  const files = listBundleFiles(distDir);
  let expectedFound = false;
  const wrongFound = new Set();

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const otherMode of MODES) {
      if (!containsApiUrl(text, urls[otherMode])) continue;
      if (otherMode === mode) expectedFound = true;
      else wrongFound.add(`${otherMode} (${new URL(urls[otherMode]).origin})`);
    }
  }

  if (wrongFound.size > 0) {
    console.error(
      `verify-build-target: FAILED — this is a "${mode}" build (expects ${expectedOrigin}), ` +
      `but the built bundle also contains the API URL for: ${[...wrongFound].join(", ")}. ` +
      `Refusing to let this ship — check for a stray .env.local overriding .env.${mode}, ` +
      `or that the correct --mode flag was used.`
    );
    process.exit(1);
  }

  if (!expectedFound) {
    console.error(
      `verify-build-target: FAILED — this is a "${mode}" build, but no bundle file contains ` +
      `the expected API URL (${expectedOrigin}). The build did not bake in the right API URL.`
    );
    process.exit(1);
  }

  console.log(`verify-build-target: OK — "${mode}" build correctly points at ${expectedOrigin}.`);
}

main();
