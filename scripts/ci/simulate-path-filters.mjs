#!/usr/bin/env node
/**
 * Local mirror of dorny/paths-filter rules in .github/workflows/ci-cd-new-server.yml.
 * Usage: node scripts/ci/simulate-path-filters.mjs <base-ref> <head-ref>
 * Example: node scripts/ci/simulate-path-filters.mjs 349f75b 86c7bb3
 */
import { execSync } from 'node:child_process';

const [base, head] = process.argv.slice(2);
if (!base || !head) {
  console.error('Usage: node scripts/ci/simulate-path-filters.mjs <base-ref> <head-ref>');
  process.exit(1);
}

const names = execSync(`git diff --name-only ${base} ${head}`, { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(Boolean);

function anyMatch(globs) {
  return names.some((file) => globs.some((g) => matchGlob(g, file)));
}

function matchGlob(glob, file) {
  const pattern = glob
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<<GLOBSTAR>>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<<GLOBSTAR>>>/g, '.*');
  const re = new RegExp(`^${pattern}$`);
  return re.test(file.replace(/\\/g, '/'));
}

const shared = [
  'package.json',
  'package-lock.json',
  'packages/db/**',
  'packages/delivery-domain/**',
];

const filters = {
  core: [...shared, 'backend/**'],
  orders: [...shared, 'services/orders/**'],
  payments: [...shared, 'services/payment/**'],
  delivery: [...shared, 'delivery-service/**'],
  notify: [...shared, 'services/notification/**'],
  frontend: ['Frontend/**', 'packages/settlement/**', 'package.json', 'package-lock.json'],
  delivery_frontend: [
    'delivery-frontend/**',
    'packages/settlement/**',
    'package.json',
    'package-lock.json',
  ],
};

console.log(`Changed files (${base}..${head}): ${names.length}`);
for (const f of names) console.log(`  ${f}`);
console.log('');

const results = {};
for (const [key, globs] of Object.entries(filters)) {
  results[key] = anyMatch(globs);
  console.log(`${key}: ${results[key] ? 'true' : 'false'}`);
}

const deployJobs = Object.entries(results).filter(([, v]) => v).map(([k]) => k);
console.log('');
console.log(
  deployJobs.length
    ? `Would run deploy for: ${deployJobs.join(', ')}`
    : 'No path-filtered deploy jobs would run (use deploy_all or merge-from-main rule).',
);
