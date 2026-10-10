/**
 * Turn dist-single/index.html into the flat fragment the Claude Artifact
 * publisher expects: no <!doctype>, <html>, <head> or <body> of our own -
 * it supplies those. Everything else (title, font link, inlined CSS and JS)
 * is preserved in order.
 *
 *   npm run build:single && node scripts/artifact.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../dist-single/index.html");
const out = resolve(here, "../../index.html");

const html = readFileSync(src, "utf8");

const head = (html.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [, ""])[1];
const body = (html.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, ""])[1];

// The wrapper already provides charset and viewport; ours would be duplicates.
const keptHead = head
  .replace(/<meta\s+charset=[^>]*>\s*/gi, "")
  .replace(/<meta\s+name=["']viewport["'][^>]*>\s*/gi, "")
  .trim();

const banner = `<!-- Built from app/src - do not edit. Regenerate with:
     npm run build:single && node scripts/artifact.mjs -->`;

writeFileSync(out, `${banner}\n${keptHead}\n\n${body.trim()}\n`, "utf8");
console.log("wrote", out, `(${(keptHead.length + body.length) / 1024 | 0} kB)`);
