# Repository Guidelines

## Project Structure & Module Organization

This repository is a small browser-based course information organizer. `index.html` defines the page structure and loads the other source files. `app.js` handles DeepSeek API requests, JSON parsing, error reporting, and board rendering. `style.css` contains all visual styles. `project_spec.md` records product requirements, while `fix-log.md` documents previous fixes. There is currently no dedicated `tests/` or assets directory. Add tests under `tests/` and static resources under `assets/` if the project grows.

## Build, Test, and Development Commands

No build step or package manager is required. For a quick check, open `index.html` in a browser. A local HTTP server is preferable because browser behavior is more representative:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`. Use the browser console (F12) to inspect JavaScript and network errors. No automated test command is configured yet.

## Coding Style & Naming Conventions

Use four-space indentation in HTML, CSS, and JavaScript. Prefer `const` by default and `let` only for reassigned values. Use `camelCase` for JavaScript functions and variables (`runAI`, `renderCard`), and lowercase kebab-case for future filenames. Keep DOM access and API handling explicit. Add defensive checks for AI-generated values before calling methods such as `.map()`. Keep user-facing messages in Chinese unless product requirements change.

## Testing Guidelines

Manually test empty input, valid course text, malformed AI JSON, API failure, and unexpected field types. Confirm that the page never remains indefinitely on “AI解析中...”. When automated tests are introduced, place them in `tests/` and name them after the source unit, for example `tests/app.test.js`.

## Commit & Pull Request Guidelines

This directory currently has no Git history, so no existing convention can be inferred. Use short imperative commits such as `fix: handle non-array homework data`. Pull requests should explain the user-visible change, list verification steps, link relevant issues, and include screenshots for UI changes. Keep unrelated changes separate.

## Security & Agent Instructions

Never publish or commit a live DeepSeek API key. Keep AI requests behind the serverless proxy and load credentials only from backend environment variables. Before modifying files or running commands, agents must first present a concrete plan and wait for the user’s approval. Communicate reasoning and execution updates in Chinese.
