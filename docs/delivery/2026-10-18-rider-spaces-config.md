# 2026-10-18 — rider photo storage

**Date:** 2026-10-18

## Changed

- Creating or updating a rider returns a clear error when DigitalOcean Spaces is not configured, instead of failing inside the upload client because the bucket name is empty.
- The backend container in docker-compose now receives `DO_SPACES_KEY`, `DO_SPACES_SECRET`, `DO_SPACES_BUCKET`, `DO_SPACES_REGION`, `DO_SPACES_ENDPOINT`, and `DO_SPACES_PREFIX` from the host environment.
