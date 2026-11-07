import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'src');

const skip = new Set([
  path.normalize('src/lib/adminSession.ts'),
  path.normalize('src/lib/adminProtectedFile.test.ts'),
  path.normalize('src/lib/api.ts'),
]);

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}

function rel(p) {
  return path.relative(process.cwd(), p).replace(/\\/g, '/');
}

function ensureImport(content) {
  if (!content.includes('adminAuthHeaders')) return content;
  if (content.includes("from '@/lib/adminSession'") || content.includes('from "@/lib/adminSession"')) {
    if (content.includes('adminAuthHeaders')) return content;
  }
  const hasAdminSessionImport = /import\s*\{([^}]+)\}\s*from\s*'@\/lib\/adminSession'/.exec(content);
  if (hasAdminSessionImport) {
    const names = hasAdminSessionImport[1];
    if (!names.includes('adminAuthHeaders')) {
      return content.replace(
        hasAdminSessionImport[0],
        `import { ${names.trim()}, adminAuthHeaders } from '@/lib/adminSession'`,
      );
    }
    return content;
  }
  const importLine = "import { adminAuthHeaders } from '@/lib/adminSession';\n";
  if (content.startsWith("'use client';\n")) {
    return content.replace("'use client';\n", `'use client';\n\n${importLine}`);
  }
  return importLine + content;
}

const replacements = [
  [
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{getToken\(\)\}`\s*\}/g,
    "headers: adminAuthHeaders(), credentials: 'include'",
  ],
  [
    /headers:\s*\{\s*'Content-Type':\s*'application\/json',\s*Authorization:\s*`Bearer \$\{getToken\(\)\}`\s*\}/g,
    "headers: adminAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'include'",
  ],
  [
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{getToken\(\)\}`,\s*'Content-Type':\s*'application\/json'\s*\}/g,
    "headers: adminAuthHeaders({ 'Content-Type': 'application/json' }), credentials: 'include'",
  ],
  [
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\}/g,
    "headers: adminAuthHeaders(), credentials: 'include'",
  ],
  [
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{token \|\| ''\}`\s*\}/g,
    "headers: adminAuthHeaders(), credentials: 'include'",
  ],
  [/^\s*getToken=\{getToken\}\n/gm, ''],
  [/^\s*getToken=\{getToken\},\n/gm, ''],
  [
    /const getToken = \(\) => \(typeof window !== 'undefined' \? localStorage\.getItem\('bc_admin_token'\) : ''\);\n/g,
    '',
  ],
  [/const getToken = \(\) => localStorage\.getItem\('bc_admin_token'\);\n/g, ''],
  [
    /const token = typeof window !== 'undefined' \? localStorage\.getItem\('bc_admin_token'\) : '';\n/g,
    '',
  ],
  [/const token = localStorage\.getItem\('bc_admin_token'\);\n/g, ''],
  [/const token = localStorage\.getItem\('bc_admin_token'\) \?\? '';\n/g, ''],
  [/const adminToken = localStorage\.getItem\('bc_admin_token'\);\n/g, ''],
  [/const adminToken = localStorage\.getItem\('bc_admin_token'\) \|\| undefined;\n/g, ''],
];

function patchFile(filePath) {
  const r = rel(filePath);
  if (skip.has(r)) return false;

  let content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('bc_admin_token') && !content.includes('getToken()')) return false;

  const before = content;
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }

  if (content !== before) {
    content = ensureImport(content);
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

const changed = walk(root).filter(patchFile);
console.log(`Updated ${changed.length} files`);

/** Regression: Bearer ${token} without a local token definition breaks admin pages at runtime. */
const bearerHits = [];
for (const filePath of walk(root)) {
  const r = rel(filePath);
  if (skip.has(r)) continue;
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes('Bearer ${token}')) continue;
  const hasLocalToken =
    /const token\s*=/.test(content) ||
    /let token\s*=/.test(content) ||
    /function[^(]*\([^)]*\btoken\b/.test(content);
  if (!hasLocalToken) bearerHits.push(r);
}

if (bearerHits.length) {
  console.error('Regression: Bearer ${token} without local token definition:');
  bearerHits.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}
