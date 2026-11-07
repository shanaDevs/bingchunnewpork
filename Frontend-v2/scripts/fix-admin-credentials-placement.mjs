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

const BAD_SPREAD =
  ", ...(options?.headers as Record<string, string> | undefined) , credentials: 'include' }";
const GOOD_SPREAD = ', ...(options?.headers as Record<string, string> | undefined) }';

const BAD_JSON = "adminAuthHeaders({ 'Content-Type': 'application/json' , credentials: 'include' })";
const GOOD_JSON = "adminAuthHeaders({ 'Content-Type': 'application/json' })";

let changed = 0;
for (const file of walk(root)) {
  let content = fs.readFileSync(file, 'utf8');
  const before = content;

  if (content.includes(BAD_SPREAD)) {
    content = content.split(BAD_SPREAD).join(GOOD_SPREAD);
  }
  if (content.includes(BAD_JSON)) {
    content = content.split(BAD_JSON).join(GOOD_JSON);
  }

  // fetch(..., { headers: adminAuthHeaders(...), });  -> add credentials before closing
  content = content.replace(
    /(fetch\([^)]+\{[^}]*headers:\s*adminAuthHeaders\([^)]+\))\s*,\s*\}\)/g,
    '$1, credentials: \'include\' })',
  );
  content = content.replace(
    /(await fetch\([^,]+,\s*\{\s*\n?\s*\.\.\.options,\s*\n?\s*headers:\s*adminAuthHeaders\([^)]+\))\s*,?\s*\n?\s*\}\);/g,
    '$1,\n    credentials: \'include\',\n  });',
  );

  if (content !== before) {
    fs.writeFileSync(file, content);
    changed++;
  }
}

console.log(`Fixed credentials placement in ${changed} files`);
