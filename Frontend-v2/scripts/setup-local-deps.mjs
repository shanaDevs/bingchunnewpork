// One-time local setup for Frontend-v2 (run `npm run setup:frontend-v2` from the repo root after pulling).
//
// 1. Packages. Frontend-v2 is a plain folder, not an npm workspace, so it has no install of its own: Node
//    finds its packages by walking up to the repo root's node_modules, which `npm ci` at the root already
//    fills. The exception is the few packages npm installs inside Frontend/node_modules instead of the root
//    (because the root holds a different version, e.g. date-fns 2 there vs 4 here). This copies those from
//    Frontend/node_modules, so both versions run on exactly the same packages.
// 2. Images. Frontend-v2/public is not a copy: it is a link to Frontend/public (a directory junction on
//    Windows, which needs no admin rights; a symlink elsewhere), so both versions share one set of images.
//    It is git-ignored and created here. Anything added or deleted through either folder affects both.
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, symlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const v2 = join(here, "..");
const v1 = join(v2, "..", "Frontend");

// --- 1. Packages only Frontend has in its own node_modules ---
const source = join(v1, "node_modules");
const target = join(v2, "node_modules");

if (!existsSync(source)) {
  console.error(`Missing ${source}.\nRun \`npm ci\` at the repo root first, then run this again.`);
  process.exit(1);
}

mkdirSync(target, { recursive: true });
const packages = readdirSync(source).filter((name) => !name.startsWith("."));
for (const name of packages) {
  cpSync(join(source, name), join(target, name), { recursive: true, force: true });
  console.log(`copied ${name}`);
}

// --- 2. Shared public/ (images, icons, fonts) ---
const publicLink = join(v2, "public");
const publicTarget = join(v1, "public");
const linkExists = (() => {
  try {
    return lstatSync(publicLink);
  } catch {
    return null;
  }
})();

if (!linkExists) {
  symlinkSync(publicTarget, publicLink, process.platform === "win32" ? "junction" : "dir");
  console.log("linked public -> ../Frontend/public");
} else if (linkExists.isSymbolicLink()) {
  console.log("public is already linked to ../Frontend/public");
} else {
  // A real folder here would be a separate copy; leave it alone rather than delete anything.
  console.warn("Frontend-v2/public is a real folder, not a link. Remove it and run this again to share Frontend/public.");
}

console.log(`Frontend-v2 is ready: ${packages.length} package folder(s) copied; images shared with Frontend.`);
