# 2026-10-16 — register driver retry

**Date:** 2026-10-16

## Changed

- Registering a driver retries the database write once after Postgres resets the connection. If the first insert already committed, the retry returns that rider instead of creating another.
