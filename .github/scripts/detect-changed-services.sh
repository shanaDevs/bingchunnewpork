#!/usr/bin/env bash
# Detect which Bing Chun microservices changed in the current CI run.
# Used for CapRover deploy gating only — images are always built.
#
# Core microservice groups:
#   Customer side : shop API + customer web (bing-chun)
#   Admin side    : admin API + admin-web + pos API + pos-web
#   Delivery side : delivery-service + delivery-frontend
#   Shared core   : core (migrations/shared)
set -euo pipefail

core=false
shop=false
pos=false
admin=false
delivery=false
frontend=false
pos_web=false
admin_web=false
delivery_frontend=false

set_all_true() {
  core=true
  shop=true
  pos=true
  admin=true
  delivery=true
  frontend=true
  pos_web=true
  admin_web=true
  delivery_frontend=true
}

AFTER="${GITHUB_SHA}"

if [ "${DEPLOY_ALL:-false}" = "true" ]; then
  echo "Mode: deploy all CapRover apps (deploy_all input)"
  set_all_true
else
  BEFORE=""
  if [ "${GITHUB_EVENT_NAME}" = "push" ]; then
    BEFORE="${GITHUB_EVENT_BEFORE:-}"
    if [ "$BEFORE" = "0000000000000000000000000000000000000000" ] || [ -z "$BEFORE" ]; then
      BEFORE="$(git rev-parse "${AFTER}^" 2>/dev/null || true)"
    fi
  else
    BEFORE="$(git rev-parse HEAD~1 2>/dev/null || true)"
  fi

  if [ -z "$BEFORE" ]; then
    echo "Could not determine diff base; treating as deploy-all"
    set_all_true
  else
    echo "Diff range: ${BEFORE}..${AFTER}"
    git diff --name-only "$BEFORE" "$AFTER" | tee /tmp/changed-files.txt

    if [ ! -s /tmp/changed-files.txt ]; then
      echo "No changed files in diff range"
    fi

    # Check if this commit was a merge from main
    HEAD_MSG="$(git log -1 --pretty=%B "$AFTER" 2>/dev/null || true)"
    if printf '%s' "$HEAD_MSG" | grep -qiE 'merge.*main'; then
      echo "Detected merge from main: deploying all services"
      set_all_true
    else
      shared=false
      if grep -qE '^(package\.json|package-lock\.json|packages/db/|packages/cors/|packages/delivery-domain/|packages/settlement/)' /tmp/changed-files.txt; then
        shared=true
      fi

      # backend/ changes affect all 4 API surfaces
      if [ "$shared" = true ] || grep -qE '^backend/' /tmp/changed-files.txt; then
        core=true
        shop=true
        pos=true
        admin=true
      fi

      # Delivery backend service
      if [ "$shared" = true ] || grep -qE '^delivery-service/' /tmp/changed-files.txt; then
        delivery=true
      fi

      # Frontend web apps
      if [ "$shared" = true ] || grep -qE '^Frontend/' /tmp/changed-files.txt; then
        frontend=true
        pos_web=true
        admin_web=true
      fi

      # Delivery frontend
      if [ "$shared" = true ] || grep -qE '^delivery-frontend/' /tmp/changed-files.txt; then
        delivery_frontend=true
      fi
    fi
  fi
fi

any=false
for flag in "$core" "$shop" "$pos" "$admin" "$delivery" "$frontend" "$pos_web" "$admin_web" "$delivery_frontend"; do
  if [ "$flag" = true ]; then
    any=true
    break
  fi
done

{
  echo "core=$core"
  echo "shop=$shop"
  echo "pos=$pos"
  echo "admin=$admin"
  echo "delivery=$delivery"
  echo "frontend=$frontend"
  echo "pos_web=$pos_web"
  echo "admin_web=$admin_web"
  echo "delivery_frontend=$delivery_frontend"
  echo "any=$any"
} >> "${GITHUB_OUTPUT}"

echo "core=$core shop=$shop pos=$pos admin=$admin delivery=$delivery frontend=$frontend pos_web=$pos_web admin_web=$admin_web delivery_frontend=$delivery_frontend any=$any"
