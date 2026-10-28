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

let changed = 0;
for (const file of walk(root)) {
  if (file.includes('adminApi.ts')) continue;
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('adminAuthHeaders')) continue;

  const before = content;
  // fetch(..., { ... headers: adminAuthHeaders(...) }) without credentials before closing
  content = content.replace(
    /(fetch\([^)]+\{[\s\S]{0,400}?headers:\s*adminAuthHeaders\([^)]*\))(\s*,?\s*\n?\s*)(\}\))/g,
    (match, head, mid, tail) => {
      if (match.includes('credentials:')) return match;
      return `${head},\n    credentials: 'include',\n  ${tail}`;
    },
  );

  if (content !== before) {
    fs.writeFileSync(file, content);
    changed++;
  }
}

console.log(`Added credentials to ${changed} files`);
