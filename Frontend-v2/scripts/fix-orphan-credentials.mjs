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

const reps = [
  [
    /,\r?\n  , credentials: 'include' \}/g,
    ",\n    credentials: 'include',\n  }",
  ],
  [
    /,\r?\n    , credentials: 'include' \}/g,
    ",\n      credentials: 'include',\n    }",
  ],
  [
    /,\r?\n      , credentials: 'include' \}/g,
    ",\n        credentials: 'include',\n      }",
  ],
];

let changed = 0;
for (const file of walk(root)) {
  let content = fs.readFileSync(file, 'utf8');
  const before = content;
  for (const [pattern, replacement] of reps) {
    content = content.replace(pattern, replacement);
  }
  if (content !== before) {
    fs.writeFileSync(file, content);
    changed++;
  }
}

console.log(`Fixed ${changed} files`);
