# Sorta.Fit

AI-powered sprint automation that connects your issue board to Claude Code for hands-off card refinement, implementation, and PR review.

```
                +-------------+
                | Issue Board |
                | (Jira, ...) |
                +------+------+
                       |
                  read |  cards
                       v
              +--------+--------+
              |  Sorta   |
              |  (runner loop)  |
              +--------+--------+
                       |
                render |  prompts
                       v
              +--------+--------+
              |   Claude Code   |
              |   (CLI agent)   |
              +--------+--------+
                       |
            implement  |  review
                       v
              +--------+--------+
              |   Git / GitHub  |
              | (branches, PRs) |
              +--------+--------+
                       |
              comment  |  transition
                       v
                +------+------+
                | Issue Board |
                | (updated)   |
                +-------------+
```

## What It Does

- **Refines cards** -- picks up To Do items, runs Claude against your codebase, and writes structured specs with acceptance criteria, technical context, and testing requirements back to the card.
- **Implements cards** -- picks up Agent lane items, creates an isolated worktree, runs Claude Code to build the feature, pushes a branch, opens a PR, and moves the card to QA.
- **Reviews PRs** -- picks up QA cards, fetches the PR diff, runs Claude for a code review, and posts the review directly on GitHub.
- **Triages bugs** -- analyzes bug reports against the codebase, identifies likely root causes and affected files, and writes a triage report back to the card.

## Quick Start

**Windows:**
Double-click `setup.bat` to launch the setup wizard in your browser.

**macOS / Linux:**
```bash
bash setup.sh
```

The wizard walks you through configuring your board connection, discovering status/transition IDs, and selecting which recipes to enable. Once complete, it writes your `.env` and adapter config files.

For manual setup without the wizard, see the [Setup Guide](docs/setup-guide.md).

## Recipes

| Recipe | What It Does | Lane Flow |
|--------|-------------|-----------|
| `refine` | Generates structured spec from card title | To Do --> Refined |
| `code` | Implements card, creates branch and PR | Agent --> QA |
| `review` | Reviews PR diff, posts GitHub review | QA --> QA (stays) |
| `triage` | Analyzes bug report, writes triage to card | To Do --> Refined |
| `release-notes` | Generates grouped changelog from git history | Manual run |

Full documentation for each recipe: [docs/recipes.md](docs/recipes.md)

## Supported Boards

| Board | Status |
|-------|--------|
| Jira Cloud | Ready |
| Linear | Planned |
| GitHub Issues | Planned |

Adapter documentation and how to write your own: [docs/adapters.md](docs/adapters.md)

## How It Works

Sorta is a set of bash scripts orchestrated by a simple polling loop.

1. **Runner** (`core/runner.sh`) starts a loop that fires every `POLL_INTERVAL` seconds.
2. Each cycle, it runs the enabled **recipes** in order (e.g., `refine`, then `code`).
3. Each recipe queries the issue board for cards in its source lane using the **adapter** interface.
4. For each card, the recipe renders a **prompt template** with the card's details and passes it to Claude Code CLI.
5. Claude's output is written back to the board (updated descriptions, comments, transitions) and/or to GitHub (branches, PRs, reviews).

The adapter layer means Sorta is not tied to any one board. Implement the `board_*` functions for your platform and everything else works unchanged.

## Safety Features

- **Worktrees** -- The `code` recipe works in isolated git worktrees. Your main working tree is never modified.
- **Protected branch checks** -- Branches named `main`, `master`, `dev`, or `develop` are never checked out or pushed to.
- **Lock files** -- A lock file prevents overlapping cycles if a previous run is still in progress.
- **No force push** -- Sorta never uses `git push --force` or any destructive git operation.
- **Branch naming** -- All AI-created branches are prefixed with `claude/` and include the issue key for traceability.

## Configuration

All configuration is done through environment variables in a `.env` file. See the [Setup Guide](docs/setup-guide.md) for a complete reference of every variable.

## Contributing

Contributions are welcome. See [docs/contributing.md](docs/contributing.md) for the fork-branch-PR workflow, code style guide, and instructions for adding recipes and adapters.

## License

AGPL-3.0 -- see [LICENSE](LICENSE).
