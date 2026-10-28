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
  let content = fs.readFileSync(file, 'utf8');
  const before = content;

  content = content.replace(
    /, credentials: 'include' \}/g,
    (match, offset, full) => {
      // only inside adminAuthHeaders — remove (invalid header key)
      const before = full.slice(Math.max(0, offset - 80), offset);
      if (before.includes('adminAuthHeaders({')) return ' }';
      return match;
    },
  );

  // Broken: closing brace then orphan credentials line
  content = content.replace(
    /\}\),\s*\n\s*, credentials: 'include' \}\)/g,
    '}),\n    credentials: \'include\',\n  })',
  );
  content = content.replace(
    /\}\)\s*,\s*\n\s*, credentials: 'include' \}\)/g,
    '}),\n    credentials: \'include\',\n  })',
  );
  content = content.replace(
    /headers: adminAuthHeaders\([^)]+\)\s*,\s*\n\s*, credentials: 'include' \}\)/g,
    (m) => m.replace(/,\s*\n\s*, credentials: 'include' \}\)/, ',\n    credentials: \'include\',\n  })'),
  );
  content = content.replace(
    /headers: adminAuthHeaders\([^)]+\)\s*,\s*\n\s*, credentials: 'include' \}\);/g,
    (m) =>
      m.replace(
        /,\s*\n\s*, credentials: 'include' \}\);/,
        ',\n    credentials: \'include\',\n  });',
      ),
  );

  // adminFetch pattern missing credentials after headers line
  content = content.replace(
    /(function adminFetch\([^)]*\)[^{]*\{[\s\S]*?headers: adminAuthHeaders\([^)]+\)),\s*\n\s*\}\)\.then/g,
    '$1,\n    credentials: \'include\',\n  }).then',
  );
  content = content.replace(
    /(async function adminFetch\([^)]*\)[^{]*\{[\s\S]*?headers: adminAuthHeaders\([^)]+\)),\s*\n\s*\}\);/g,
    '$1,\n    credentials: \'include\',\n  });',
  );

  if (content !== before) {
    fs.writeFileSync(file, content);
    changed++;
  }
}

console.log(`Fixed fetch syntax in ${changed} files`);
