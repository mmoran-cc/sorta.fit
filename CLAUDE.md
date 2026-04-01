# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sorta.Fit is an AI-powered sprint automation system that connects issue boards (Jira, Linear, GitHub Issues) to Claude Code CLI. It runs a polling loop that reads cards from a board, renders prompt templates, and passes them to Claude Code for hands-off card refinement, implementation, PR review, and bug triage.

**Stack:** Bash orchestration, Node.js (JSON/ADF parsing, template rendering), Git, GitHub CLI, Claude Code CLI.

## Running the System

```bash
# Start the polling loop (main entry point)
bash core/runner.sh

# Run a single recipe manually
bash recipes/refine.sh
bash recipes/code.sh
bash recipes/review.sh
bash recipes/triage.sh
bash recipes/bounce.sh

# Generate release notes (manual, not part of the loop)
bash recipes/release-notes.sh <since-tag-or-date> [output-file]

# Launch the setup wizard (web UI on port 3456)
bash setup.sh          # macOS/Linux
setup.bat              # Windows (double-click)
```

There is no automated test suite. Testing is manual: create a test project on the board and run recipes individually.

## Architecture

### Core Loop

`core/runner.sh` → loads config (`core/config.sh`) → validates dependencies → acquires `.automation.lock` → runs enabled recipes in sequence → sleeps `POLL_INTERVAL` → repeats. `core/utils.sh` provides logging, lock management, template rendering (`{{KEY}}` substitution via Node.js), and git helpers.

### Adapter Layer

Adapters in `adapters/` implement a standard `board_*` function interface, making the system board-agnostic. Each adapter has a companion `*.config.sh` for status/transition IDs.

**Interface:** `board_get_cards_in_status`, `board_get_card_key`, `board_get_card_title`, `board_get_card_description`, `board_get_card_comments`, `board_update_description`, `board_add_comment`, `board_transition`, `board_discover`.

Currently implemented: Jira Cloud (`adapters/jira.sh`). Linear and GitHub Issues are planned.

### Recipes

Each recipe in `recipes/` follows the same pattern: query cards from a source lane → fetch details → render a prompt from `prompts/*.md` → pass to Claude Code CLI (`claude -p`) → update the board → transition the card.

- **refine** — Generates structured specs from raw cards (To Do → Refined)
- **code** — Creates branch, worktree, runs Claude for implementation, opens PR (Agent → QA)
- **review** — Fetches PR diff, runs Claude review, posts verdict to GitHub (QA lane)
- **triage** — Analyzes bug reports, appends root-cause analysis (To Do → Refined)
- **bounce** — Detects rejected PRs, routes back for rework or escalates after `MAX_BOUNCES` (QA → Agent)

### Prompt Templates

`prompts/*.md` files use `{{KEY}}` placeholders (e.g., `{{CARD_KEY}}`, `{{CARD_TITLE}}`), rendered at runtime by `render_template` in `core/utils.sh`.

## Code Conventions

- All scripts use `#!/usr/bin/env bash` and `set -euo pipefail`
- Logging via `log_info`, `log_warn`, `log_error`, `log_step` from `core/utils.sh` — no bare `echo`
- UPPERCASE for env/exported variables, lowercase for locals
- 2-space indentation, LF line endings only
- Allowed dependencies: Bash, Git, Node.js, curl, gh (GitHub CLI), claude — no Python, jq, or other external tools
- No hardcoded values; use env vars and config

## Safety Invariants

- The `code` recipe uses **isolated git worktrees** (`.worktrees/`); the main working tree is never modified
- Branches named `main`, `master`, `dev`, `develop` are **never checked out** by recipes
- AI-created branches are always prefixed `claude/{ISSUE_KEY}-{slug}`
- No `git push --force` or destructive git operations
- `.automation.lock` prevents overlapping polling cycles

## Extension Points

- **New recipe:** Create `recipes/{name}.sh` + `prompts/{name}.md`, add to `RECIPES_ENABLED` in `.env`
- **New adapter:** Create `adapters/{name}.sh` implementing all `board_*` functions + `adapters/{name}.config.sh.example`

## Configuration

All config lives in `.env` (see `.env.example`). Key variables: `BOARD_ADAPTER`, `BOARD_DOMAIN`, `BOARD_API_TOKEN`, `BOARD_PROJECT_KEY`, `GIT_BASE_BRANCH`, `POLL_INTERVAL`, `RECIPES_ENABLED`, and per-recipe `MAX_CARDS_*` / `RECIPE_*_FROM` / `RECIPE_*_TO` lane routing.
