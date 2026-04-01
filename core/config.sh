#!/usr/bin/env bash
# Sorta.Fit — Configuration loader
# Sources .env and validates required variables

set -euo pipefail

SORTA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load .env
if [[ -f "$SORTA_ROOT/.env" ]]; then
  set -a
  while IFS='=' read -r key value; do
    [[ -z "$key" || "$key" =~ ^# ]] && continue
    value="${value%\"}"
    value="${value#\"}"
    export "$key=$value"
  done < "$SORTA_ROOT/.env"
  set +a
fi

# Required vars
: "${BOARD_ADAPTER:?BOARD_ADAPTER not set (jira, linear, github-issues)}"
: "${BOARD_DOMAIN:?BOARD_DOMAIN not set}"
: "${BOARD_API_TOKEN:?BOARD_API_TOKEN not set}"
: "${BOARD_PROJECT_KEY:?BOARD_PROJECT_KEY not set}"

# Optional with defaults
export GIT_BASE_BRANCH="${GIT_BASE_BRANCH:-main}"
export POLL_INTERVAL="${POLL_INTERVAL:-3600}"
export MAX_CARDS_REFINE="${MAX_CARDS_REFINE:-5}"
export MAX_CARDS_CODE="${MAX_CARDS_CODE:-2}"
export MAX_CARDS_REVIEW="${MAX_CARDS_REVIEW:-10}"
export MAX_CARDS_TRIAGE="${MAX_CARDS_TRIAGE:-5}"
export MAX_CARDS_BOUNCE="${MAX_CARDS_BOUNCE:-10}"
export RECIPES_ENABLED="${RECIPES_ENABLED:-refine,code}"

# Adapter-specific
export BOARD_EMAIL="${BOARD_EMAIL:-}"

# Recipe lane routing — where each recipe reads from and transitions to
# FROM = status name on the board (used in queries)
# TO = transition key suffix (maps to TRANSITION_* in adapter config, empty = don't move)
export RECIPE_REFINE_FROM="${RECIPE_REFINE_FROM:-To Do}"
export RECIPE_REFINE_TO="${RECIPE_REFINE_TO:-REFINED}"

export RECIPE_CODE_FROM="${RECIPE_CODE_FROM:-Agent}"
export RECIPE_CODE_TO="${RECIPE_CODE_TO:-QA}"

export RECIPE_REVIEW_FROM="${RECIPE_REVIEW_FROM:-QA}"
export RECIPE_REVIEW_TO="${RECIPE_REVIEW_TO:-}"

export RECIPE_TRIAGE_FROM="${RECIPE_TRIAGE_FROM:-To Do}"
export RECIPE_TRIAGE_TO="${RECIPE_TRIAGE_TO:-REFINED}"

export RECIPE_BOUNCE_FROM="${RECIPE_BOUNCE_FROM:-QA}"
export RECIPE_BOUNCE_TO="${RECIPE_BOUNCE_TO:-AGENT}"
export MAX_BOUNCES="${MAX_BOUNCES:-3}"
export RECIPE_BOUNCE_ESCALATE="${RECIPE_BOUNCE_ESCALATE:-}"

# Load adapter config
ADAPTER_CONFIG="$SORTA_ROOT/adapters/${BOARD_ADAPTER}.config.sh"
if [[ -f "$ADAPTER_CONFIG" ]]; then
  source "$ADAPTER_CONFIG"
else
  echo "WARNING: Adapter config not found: $ADAPTER_CONFIG"
  echo "Run the setup wizard or copy from ${ADAPTER_CONFIG}.example"
fi
