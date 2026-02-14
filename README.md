# Background Coding Agent MVP (Slack → Worker → OpenCode → GitHub PR)

This scaffold gives you a quick MVP for "start a background coding task from Slack and get a PR."

## What’s included
- Slack slash command bot: `/agent <repo> <task>`
- Orchestrator API: session creation, status tracking, and event log
- In-process queue/runner: clones repo, runs OpenCode, commits, pushes, opens PR
- Local JSON store in `data/sessions.json`

## Quick start
1. Install dependencies
   - `npm install`
2. Copy environment file
   - `cp .env.example .env`
3. Fill `.env` values
4. Start API
   - `npm run api`
5. Start Slack bot (new terminal)
   - `npm run bot`
6. In Slack, run:
   - `/agent owner/repo update auth middleware to handle token refresh`

## Required env vars
- `SLACK_BOT_TOKEN`
- `SLACK_SIGNING_SECRET`
- `SLACK_APP_TOKEN` (required for socket mode)
- `DEFAULT_GITHUB_TOKEN` (or configure per user in your mapping later)
- `GITHUB_BASE_BRANCH` (default `main`)
- `OPENCODE_COMMAND_TEMPLATE` (command string used to run coding task inside repo)
- `GIT_USER_NAME` and `GIT_USER_EMAIL` (git commit identity)

## Configure OpenCode command
Set `OPENCODE_COMMAND_TEMPLATE` to a shell command that executes your coding agent in the checked-out repo.

Examples:
- Placeholder test command:
  - `bash -lc "echo \"Would run OpenCode here\""`
- Replace with real OpenCode call if installed in PATH:
  - `bash -lc "cd \"$OPENCODE_WORKDIR\" && opencode run --prompt-file \"$OPENCODE_PROMPT_FILE\" --model \"$OPENCODE_MODEL\""`

Available variables in the command:
- `$OPENCODE_WORKDIR`
- `$OPENCODE_PROMPT_FILE`
- `$OPENCODE_MODEL`
- `$OPENCODE_SESSION_ID`

## API endpoints
- `POST /api/sessions` -> create session
- `GET /api/sessions/:id` -> fetch session status
- `GET /api/sessions/:id/events` -> fetch timeline events
- `GET /api/health` -> healthcheck
- `GET /api/sessions` -> list sessions

## Notes
- This is intentionally minimal. It is designed for iteration, not hard production hardening.
- Security work still needed before team use:
  - per-user GitHub token mapping
  - auth on API endpoints
  - repo allowlists
  - richer runner isolation (actual Modal sandbox integration)
