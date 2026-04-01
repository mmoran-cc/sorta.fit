# Sorta.Fit -- Adapters

Adapters are the bridge between Sorta and your issue board. Each adapter implements a standard set of `board_*` functions that the recipes call to read cards, update descriptions, post comments, and transition cards between lanes.

## How Adapters Are Loaded

The adapter is selected by the `BOARD_ADAPTER` environment variable in your `.env` file. When `core/config.sh` runs, it:

1. Reads `BOARD_ADAPTER` (e.g., `jira`)
2. Sources `adapters/{BOARD_ADAPTER}.sh` (e.g., `adapters/jira.sh`)
3. Sources `adapters/{BOARD_ADAPTER}.config.sh` (e.g., `adapters/jira.config.sh`)

If the adapter config file does not exist, a warning is printed directing you to copy from the `.example` file.

## The board_* Interface

Every adapter must implement the following functions. Recipes depend on these exact function names and signatures.

### board_get_cards_in_status

```bash
board_get_cards_in_status <status_name> <max_results>
```

Query the board for cards in a given status. Output one card ID per line to stdout. The IDs are opaque -- they can be internal IDs (Jira uses numeric IDs) or keys, as long as `board_get_card_key` can resolve them.

**Parameters:**
- `status_name` -- The status name to query (e.g., "To Do", "Agent", "QA")
- `max_results` -- Maximum number of cards to return

**Output:** One card ID per line, ordered by rank/priority.

### board_get_card_key

```bash
board_get_card_key <card_id>
```

Resolve a card ID to its human-readable key (e.g., `PROJ-42`). The key is used in branch names, commit messages, and comments.

**Parameters:**
- `card_id` -- The internal card ID (as returned by `board_get_cards_in_status`)

**Output:** Single line with the card key.

### board_get_card_title

```bash
board_get_card_title <card_key>
```

Get the title (summary) of a card.

**Parameters:**
- `card_key` -- The card key (e.g., `PROJ-42`)

**Output:** Single line with the card title.

### board_get_card_description

```bash
board_get_card_description <card_key>
```

Get the description body of a card as plain text. If the board stores rich text (Jira uses Atlassian Document Format), the adapter must convert it to plain text.

**Parameters:**
- `card_key` -- The card key

**Output:** Multi-line plain text description.

### board_get_card_comments

```bash
board_get_card_comments <card_key>
```

Get all comments on a card. Each comment should include the author, date, and body text. Comments are separated by `---` lines.

**Parameters:**
- `card_key` -- The card key

**Output:** Multi-line formatted comments. Example:
```
---
Author: Jane Doe
Date: 2026-01-15T10:30:00.000Z
This is the comment body text.
---
Author: John Smith
Date: 2026-01-16T14:00:00.000Z
Another comment.
```

### board_get_card_summary

```bash
board_get_card_summary <card_key>
```

Get a structured summary of a card including key, summary, status, type, and priority. Used for display purposes.

**Parameters:**
- `card_key` -- The card key

**Output:** Multi-line key-value pairs:
```
Key: PROJ-42
Summary: Add user authentication
Status: To Do
Type: Story
Priority: High
```

### board_update_description

```bash
board_update_description <card_key> <markdown_text>
```

Replace the card's description with new content. The adapter must convert the markdown text to the board's native format (e.g., Atlassian Document Format for Jira).

**Parameters:**
- `card_key` -- The card key
- `markdown_text` -- The new description in markdown format (can also be piped via stdin)

**Output:** None (API response may be printed but is not used).

### board_add_comment

```bash
board_add_comment <card_key> <comment_text>
```

Add a comment to a card.

**Parameters:**
- `card_key` -- The card key
- `comment_text` -- The comment body (can also be piped via stdin)

**Output:** None.

### board_transition

```bash
board_transition <card_key> <transition_id>
```

Move a card to a different status using a transition ID. Transition IDs are board-specific and defined in the adapter config file.

**Parameters:**
- `card_key` -- The card key
- `transition_id` -- The numeric transition ID (from the adapter config)

**Output:** None.

### board_discover

```bash
board_discover
```

Print all available statuses and transitions for the configured project. This is a setup helper -- it outputs the IDs needed to populate the adapter config file.

**Parameters:** None.

**Output:** Human-readable list of statuses and transitions with their IDs.

## Adapter Config Files

Each adapter has a config file that maps your board's workflow to Sorta's lane model. The config file defines shell variables for status IDs and transition IDs.

**File naming:** `adapters/{adapter_name}.config.sh`
**Example file:** `adapters/{adapter_name}.config.sh.example`

### Status Variables

Used by recipes to query cards in specific lanes:

| Variable | Purpose |
|----------|---------|
| `STATUS_TODO` | Cards awaiting refinement |
| `STATUS_REFINED` | Refined cards ready for implementation |
| `STATUS_AGENT` | Cards assigned to the AI agent |
| `STATUS_IN_PROGRESS` | Cards being worked on (manual) |
| `STATUS_QA` | Cards awaiting review |
| `STATUS_DONE` | Completed cards |
| `STATUS_BACKLOG` | Backlog cards |

### Transition Variables

Used by recipes to move cards between lanes:

| Variable | Purpose |
|----------|---------|
| `TRANSITION_TODO` | Move card to To Do |
| `TRANSITION_REFINED` | Move card to Refined |
| `TRANSITION_AGENT` | Move card to Agent |
| `TRANSITION_IN_PROGRESS` | Move card to In Progress |
| `TRANSITION_QA` | Move card to QA |
| `TRANSITION_BACKLOG` | Move card to Backlog |
| `TRANSITION_DONE` | Move card to Done |

Not all variables are required. Only define the ones your recipes use. At minimum, `STATUS_TODO`, `STATUS_AGENT`, `STATUS_QA`, `TRANSITION_REFINED`, and `TRANSITION_QA` are needed for the default `refine` and `code` recipes.

## Writing a New Adapter

Follow these steps to add support for a new issue board.

### Step 1: Create the Adapter Script

Create `adapters/{name}.sh` with the standard shebang:

```bash
#!/usr/bin/env bash
# Sorta.Fit -- {Name} adapter
# Implements the board_* interface for {Name}

set -euo pipefail
```

### Step 2: Set Up Authentication

Read credentials from the environment variables set in `.env`:
- `BOARD_DOMAIN` -- The board's domain
- `BOARD_API_TOKEN` -- The API token
- `BOARD_PROJECT_KEY` -- The project identifier
- `BOARD_EMAIL` -- (optional) Account email, if the API needs it

```bash
AUTH_HEADER="Authorization: Bearer $BOARD_API_TOKEN"
BASE_URL="https://$BOARD_DOMAIN/api/v1"
```

### Step 3: Implement All board_* Functions

Implement every function listed in the interface section above. Use `curl` for HTTP requests and `node -e` for JSON parsing (Node.js is a guaranteed dependency).

Guidelines:
- Output to stdout only. Use `log_info`, `log_warn`, `log_error` from `core/utils.sh` for diagnostics (these go to stderr via color codes).
- Keep API calls minimal. Cache responses within a function if you need multiple fields from the same endpoint.
- Handle pagination if the board API requires it.
- Convert rich text to plain text in `board_get_card_description` and `board_get_card_comments`.
- Convert markdown to the board's native format in `board_update_description`.

### Step 4: Create the Config Example

Create `adapters/{name}.config.sh.example` with placeholder values and comments explaining how to find the real IDs:

```bash
#!/usr/bin/env bash
# {Name} adapter configuration
# Run board_discover to find these values for your project

STATUS_TODO=your_todo_status_id
STATUS_REFINED=your_refined_status_id
# ... etc
```

### Step 5: Test with board_discover

Source your adapter and run the discover function:

```bash
source core/config.sh
source core/utils.sh
source adapters/{name}.sh
board_discover
```

Verify it outputs the correct statuses and transitions. Then test each function individually:

```bash
# Get cards in To Do
board_get_cards_in_status "To Do" 5

# Get a card's details
board_get_card_key "12345"
board_get_card_title "PROJ-1"
board_get_card_description "PROJ-1"
```

### Step 6: Run a Recipe

Test end-to-end with a single recipe against a test project:

```bash
bash recipes/refine.sh
```

## Reference: Jira Adapter

The Jira adapter (`adapters/jira.sh`) is the reference implementation. Key implementation details:

- **Authentication:** Basic auth using `BOARD_EMAIL:BOARD_API_TOKEN`
- **Base URL:** `https://{BOARD_DOMAIN}/rest/api/3`
- **Card queries:** Uses JQL via the `/search/jql` endpoint
- **Rich text:** Jira uses Atlassian Document Format (ADF). The adapter converts ADF to plain text for reading and markdown to ADF for writing.
- **JSON parsing:** All JSON processing uses inline `node -e` scripts that read from stdin.
- **Transitions:** Uses the `/issue/{key}/transitions` endpoint with numeric transition IDs.

## Planned Adapters

### Linear

Linear uses a GraphQL API with bearer token authentication. The adapter would query issues by state, read/write descriptions in markdown (Linear uses native markdown, so no format conversion is needed), and use state IDs for transitions.

### GitHub Issues

GitHub Issues can be accessed via the `gh` CLI or the REST API. Labels or project board columns would map to Sorta's lane model. Descriptions and comments are native markdown.
