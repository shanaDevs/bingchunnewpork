import fs from 'fs';
import path from 'path';

const root = path.join(process.cwd(), 'src');

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}

function ensureImport(content, importLine) {
  if (content.includes(importLine.trim())) return content;
  if (content.startsWith("'use client';\n")) {
    return content.replace("'use client';\n", `'use client';\n\n${importLine}`);
  }
  if (content.startsWith('"use client";\n')) {
    return content.replace('"use client";\n', `"use client";\n\n${importLine}`);
  }
  return `${importLine}${content}`;
}

const replacements = [
  [
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`,\s*'Content-Type':\s*'application\/json',\s*\.\.\.\(options\?\.headers[^)]*\)\s*\}/g,
    "headers: adminAuthHeaders({ 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined) })",
  ],
  [
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`,\s*'Content-Type':\s*'application\/json'\s*\}/g,
    "headers: adminAuthHeaders({ 'Content-Type': 'application/json' })",
  ],
  [
    /headers:\s*\{\s*'Content-Type':\s*'application\/json',\s*Authorization:\s*`Bearer \$\{token\}`\s*\}/g,
    "headers: adminAuthHeaders({ 'Content-Type': 'application/json' })",
  ],
  [
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\}/g,
    'headers: adminAuthHeaders()',
  ],
  [
    /headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`,\s*'Content-Type':\s*'application\/json',\s*\.\.\.\(options\?\.headers[^)]*\)\s*\}/g,
    "headers: adminAuthHeaders({ 'Content-Type': 'application/json', ...(options?.headers as Record<string, string> | undefined) })",
  ],
  [/\{\s*headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\}\s*\}/g, '{ headers: adminAuthHeaders(), credentials: "include" as RequestCredentials }'],
  [
    /\{\s*headers:\s*\{\s*Authorization:\s*`Bearer \$\{token\}`\s*\},\s*/g,
    '{ headers: adminAuthHeaders(), credentials: "include" as RequestCredentials, ',
  ],
];

function addCredentialsAfterFetch(content) {
  return content.replace(
    /(fetch\(`\$\{getApiBaseUrl\(\)\}[^`]+`,\s*\{[^}]*headers:\s*adminAuthHeaders\([^)]*\)[^}]*)\}/g,
    (match) => {
      if (match.includes('credentials:')) return match;
      return match.replace(/\}$/, ', credentials: \'include\' }');
    },
  );
}

const importLine = "import { adminAuthHeaders } from '@/lib/adminSession';\n";

let changed = 0;
let remaining = [];

for (const file of walk(root)) {
  if (file.includes('lib\\api.ts') || file.includes('lib/api.ts')) continue;

  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('Bearer ${token}')) continue;

  const before = content;
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  content = addCredentialsAfterFetch(content);

  if (content.includes('adminAuthHeaders(') && !content.includes("from '@/lib/adminSession'")) {
    content = ensureImport(content, importLine);
  }

  // fetch calls with adminAuthHeaders but missing credentials on same object
  content = content.replace(
    /fetch\(([^,]+),\s*\{([^}]*adminAuthHeaders[^}]*)\}\)/g,
    (full, url, inner) => {
      if (inner.includes('credentials:')) return full;
      return `fetch(${url}, {${inner}, credentials: 'include' })`;
    },
  );

  if (content !== before) {
    fs.writeFileSync(file, content);
    changed++;
  }

  if (content.includes('Bearer ${token}')) {
    remaining.push(path.relative(process.cwd(), file));
  }
}

console.log(`Patched ${changed} files`);
if (remaining.length) {
  console.error('Still contain Bearer ${token}:');
  remaining.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}
