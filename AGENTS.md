# Repository Guidelines

## Project Structure & Module Organization

This repository is a browser-based course information organizer. `index.html` defines the page structure, `app.js` handles browser state and rendering, and `style.css` contains visual styles. `api/parse.js` is the shared DeepSeek proxy used by Vercel and the local Node.js server in `server/index.js`. Automated tests live under `tests/`, while screenshots and demo media live under `docs/`. `project_spec.md` records product requirements, `ROADMAP.md` tracks the 0–8 delivery stages, and `fix-log.md` documents actual changes.

## Build, Test, and Development Commands

No build step or package manager is currently required. Run the syntax and API tests with:

```powershell
node --check app.js
node --check api/parse.js
npm test
```

Run the complete local service with `npm run start:env` after creating an ignored `.env.local`. The default address is `http://127.0.0.1:8000`. Opening `index.html` directly supports manual entry and the local task board, but AI parsing requires the same-origin `/api/parse` backend. Use the browser console (F12) to inspect JavaScript and network errors during manual testing.

## Coding Style & Naming Conventions

Use four-space indentation in HTML, CSS, and JavaScript. Prefer `const` by default and `let` only for reassigned values. Use `camelCase` for JavaScript functions and variables (`runAI`, `renderCard`), and lowercase kebab-case for future filenames. Keep DOM access and API handling explicit. Add defensive checks for AI-generated values before calling methods such as `.map()`. Keep user-facing messages in Chinese unless product requirements change.

## Testing Guidelines

Keep automated tests under `tests/` and name them after the source unit. Manually test empty input, valid course text, malformed AI JSON, API failure, unexpected field types, mobile layout, and localStorage persistence. Confirm that the page never remains indefinitely on “AI解析中...”.

## Commit & Pull Request Guidelines

The repository uses short imperative conventional commits such as `fix: handle non-array homework data`. Keep unrelated changes separate. Pull requests should explain the user-visible change, list verification steps, link relevant issues, and include screenshots for UI changes.

## Security & Agent Instructions

Never publish or commit a live DeepSeek API key. Keep AI requests behind the serverless proxy and load credentials only from backend environment variables. Before modifying files or running commands, agents must first present a concrete plan and wait for the user’s approval. Communicate reasoning and execution updates in Chinese.
