# 2026-10-16 — home branch assigned only

**Date:** 2026-10-16

## Changed

- Change home branch on the rider profile now suggests only branches already assigned to the rider. A rider with only one assigned branch sees "You only have one assigned branch, so you cannot change your home branch."
- `POST /api/delivery/me/branch-requests` rejects a home-branch change to the current home, to a branch the rider is not assigned to, or when the rider has no other assigned branch.
