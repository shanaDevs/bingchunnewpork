# 23 — Maintenance Guide

## 1. Backups

| Asset | Recommendation |
|-------|----------------|
| MySQL | Daily automated dumps (`mysqldump` or managed backup); retain per policy |
| Object storage | Spaces versioning/lifecycle if enabled |
| CapRover app configs | Export env vars securely offline |
| Secrets | Store in password manager / CI variables — not git |

Before schema changes: take a full DB backup and verify restore on staging.

**In-repo backup utilities:** `backend/backup-roles.ts` / `restore-roles.ts` exist for roles JSON backup — not a full DB backup solution.

---

## 2. Logs

| Source | How to access |
|--------|----------------|
| Backend container | CapRover app logs / `docker logs bingchun-backend` |
| Frontend container | CapRover / Docker logs |
| GitLab CI | Pipeline job logs |
| Application logger | Console via `logger` util |

**Centralized log stack (ELK, Loki, Datadog):** Not Implemented in repository.

---

## 3. Monitoring

| Capability | Status |
|------------|--------|
| `GET /health` | Implemented |
| CapRover health / restart | Platform-level |
| APM / metrics dashboards | Not Implemented |
| Alerting on error rate / PayHere failures | Not Implemented (configure externally) |

Suggested external checks: uptime on frontend + `/health`, synthetic checkout weekly.

---

## 4. Updates

1. Develop on feature branch
2. Run unit + E2E tests
3. Merge to `main` → CI builds images → CapRover deploy
4. Verify smoke checklist ([22_Deployment_Checklist.md](22_Deployment_Checklist.md))
5. Monitor logs for 30–60 minutes

Dependency updates: bump workspace packages carefully; regenerate Prisma client after Prisma upgrades.

Flutter: bump separately; rebuild store artifacts with correct dart-defines.

---

## 5. Schema & data maintenance

| Task | Command / note |
|------|----------------|
| Sync schema | `npm run db:push` (non-prod) |
| Seed | `npm run db:seed` |
| Dummy data | `npm run db:feed` |
| Wallet backfill | `npm run backfill:wallets -w @bingchun/backend` (and related scripts under `src/scripts/`) |
| Boot ensure* | Automatic additive patches — review logs after deploy |

Avoid re-seeding production.

---

## 6. Recovery

### Application failure

1. Check CapRover app status and recent deploy
2. Roll back to previous image tag
3. Confirm `/health`

### Database corruption / bad migration

1. Stop writes (scale down backend)
2. Restore MySQL from last good backup
3. Redeploy matching application version
4. Validate wallet balances vs orders for recent window

### Secrets leak

1. Rotate JWT secrets (forces re-login)
2. Rotate PayHere, Spaces, Firebase, CapRover tokens
3. Invalidate compromised admin accounts

---

## 7. Routine ops checklist (weekly)

- [ ] Disk / DB size
- [ ] Failed payment / pending orders review
- [ ] Pending withdrawals
- [ ] Delivery jobs stuck in `IN_PROGRESS`
- [ ] Error spikes in logs
- [ ] Certificate expiry (CapRover)

---

## Related

- [13_Deployment_Guide.md](13_Deployment_Guide.md)
- [18_Known_Issues.md](18_Known_Issues.md)
