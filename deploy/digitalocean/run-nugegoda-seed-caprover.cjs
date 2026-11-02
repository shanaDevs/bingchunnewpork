/**
 * @deprecated CapRover / backend/.env (208.x) is NOT live DigitalOcean bingchun-pg.
 */
console.error(
  [
    'run-nugegoda-seed-caprover.cjs is disabled.',
    'Live Nugegoda seed must target DO Postgres (doadmin), not backend/.env.',
    'Use: node deploy/digitalocean/run-nugegoda-seed-local.cjs',
    'Requires DOADMIN_DATABASE_URL in secrets.env or deploy/digitalocean/audit-doadmin.url',
  ].join('\n'),
);
process.exit(1);
