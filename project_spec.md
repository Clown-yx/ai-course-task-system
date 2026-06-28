# AI Course Task System - Project Spec

## 1. Background
The user is Chinese,so use Chinese to talk to him.

This project is an AI-powered course information structuring system.

It converts unstructured university course information (text or screenshots) into structured task management data.

The system supports:
- Course parsing
- Homework extraction
- Exam structure detection
- Deadline identification
- Task board visualization

---

## 2. Goal

Build an AI system that transforms messy academic information into:

- Structured JSON
- Task-based UI system
- Actionable study planning board

Final output is a web-based MVP.

---

## 3. Current Progress

### Completed:
- Figma UI prototype (3 pages):
  1. Input Page
  2. AI Parsing Result Page
  3. Task Board Page

- Functional MVP:
  - DeepSeek API integration
  - Prompt-based structured extraction
  - JSON output system
  - Basic UI rendering

---

## 4. Core System Logic

Input → LLM (DeepSeek) → Editable Parse Result → User Confirmation → Task Board UI → localStorage

The MVP uses three views in the Figma order and style:

1. Text Input
2. AI Parse Result and Confirmation
3. Task Board (`Done → Today → Upcoming`)

Image upload and image recognition are out of scope for the current iteration.

---

## 4.1 Terminology

Use these names consistently in discussions, documentation, CSS, and code comments:

- **Input 页面 (Input Page):** structured manual entry and AI full-text parsing.
- **Confirm 页面 (Confirm Page):** parsed-card preview and user confirmation.
- **Board 页面 (Board Page):** the complete task board.
- **Board 栏目 (Board Column):** one of Done, Today, or Upcoming.
- **任务卡片 (Task Card):** umbrella term for homework and project cards.
- **作业卡片 (Homework Card):** a card generated from one homework item.
- **项目卡片 (Project Card):** a card generated from one project item.
- **结构化填写区 (Structured Entry):** manual course and task fields.
- **AI 整段识别区 (AI Full-text Parser):** free-text input parsed by DeepSeek.

---

## 5. Data Schema

{
  "course_name": string,
  "course_type": "professional | general | elective | other",
  "importance": "high | medium | low",
  "homework": [
    {
      "id": string,
      "content": string,
      "ddl": string | null,
      "status": "pending | done"
    }
  ],
  "projects": [
    {
      "id": string,
      "name": string,
      "requirements": string,
      "submission_method": string,
      "ddl": string | null,
      "status": "pending | done"
    }
  ],
  "exam": {
    "has_exam": boolean,
    "items": {
      "class_questions": boolean,
      "ppt_examples": boolean,
      "homework": boolean,
      "past_exam": boolean,
      "new_questions": boolean
    }
  }
}

`id` and `status` are added by the frontend after user confirmation. The LLM is not responsible for generating them. `course_type` represents the course category, while `importance` controls task-card border weight. The deprecated `exam_content` field must not be used.

Each project requires `name`, `requirements`, and `submission_method`. Existing local tasks using `content` and `format` must be migrated at read time for backward compatibility.

Task placement rules:

- `done` tasks go to Done.
- Pending tasks due today or overdue go to Today.
- Pending future tasks and tasks without a DDL go to Upcoming.

---

## 6. Agent Requirements

You are responsible for:

1. Maintaining system development
2. Improving prompt robustness
3. Improving UI consistency
4. Ensuring JSON schema stability
5. Incremental feature expansion

---

## 7. Logging Requirement (IMPORTANT)

You MUST maintain a file:

👉 fix-log.md

Record actual code, UI, configuration, database, or runtime behavior changes in Chinese. Documentation-only discussion or edits do not enter `fix-log.md`.

### Format:

- Date
- Change
- Reason
- Result

Example:

### 2026-XX-XX
- Updated prompt structure
- Reason: improve ddl extraction stability
- Result: improved accuracy, reduced hallucination

---

## 8. Development Rules

- Do not break JSON schema
- Do not introduce new fields without approval
- Always ensure backward compatibility
- UI must remain consistent with 3-page structure
- Keep the existing monochrome wireframe style; do not introduce non-monochrome colors
- Express focus and overdue states through border weight or line style
- Use square corners only; border radius is not allowed
- Use 3px, 2px, and 1px card borders for high, medium, and low importance
- Animations may change straight-line weight or translate elements horizontally/vertically; do not rotate elements or curve lines
- Display the course name on its own smaller line above the homework or project title; do not join them with a dash
- Keep each Board Column at a fixed height with an independent vertical scrollbar; show two complete Task Cards and the top of the third
- Persist confirmed tasks in browser localStorage for the MVP

---

## 9. Identity and Permission Model

The system has one global role and three class roles:

- `platform_owner`: the product owner and highest global authority; can inspect and manage all classes, users, and tasks.
- `creator`: owns one class and manages its members and administrators.
- `admin`: publishes class tasks. Global withdrawal is deferred.
- `member`: receives class tasks and manages personal completion state.

For the first pilot, one user may belong to only one class. Keep membership in a separate `class_members` table and enforce one active membership per user, so multi-class support can be added later without redesigning the database.

Authorization must be enforced by the backend. Hiding controls in the frontend is not a security boundary.

---

## 10. Authentication Requirements

- The backend preloads each user's student ID, display name, class, and class role.
- Student ID is the login identifier; name is display data and is not a credential.
- The shared pilot initial password is supplied through the server environment variable `INITIAL_PASSWORD`; its literal value must never be committed.
- Set `must_change_password = true` for new accounts and block normal application use until the password is changed.
- Store only adaptive password hashes with unique salts. Prefer Argon2id; never store plaintext or reversible passwords.
- The platform owner may reset a password to a new temporary value and revoke sessions, but cannot read a user's current password.
- Student IDs and names are private operational data and must not be included in the public repository.

---

## 11. Backend and Local Pilot Architecture

The next backend phase uses:

- Node.js HTTP API and static frontend server.
- SQLite for the small local pilot.
- Environment variables for secrets and machine-specific configuration.
- A personal hotspot or private router for the development computer and a few test phones.

Initial request path:

`Phone Browser → Local Node.js Server → SQLite / DeepSeek API`

Do not expose the development computer directly to the public internet during the initial pilot. Public hosting, HTTPS, PostgreSQL, and real-time push are later phases.

Recommended database entities:

- `users`: student ID, name, password hash, forced-change state, global role.
- `classes`: class metadata and creator.
- `class_members`: user, class, and class role.
- `personal_tasks`: private tasks, status, and soft-delete time.
- `class_tasks`: one shared class-task record per published task.
- `user_task_states`: each member's independent completion state for a class task.
- `sessions`: login sessions and revocation state.

---

## 12. Personal Recycle Bin

- Clicking the top-right `×` on a personal Task Card opens a confirmation step.
- Confirmed deletion performs a soft delete by setting `deleted_at`; it does not immediately remove the database record.
- The recycle bin supports restore, individual permanent deletion, and clear-all with confirmation.
- Restoring clears `deleted_at` and returns the card to Done, Today, or Upcoming according to its retained status and DDL.
- Class-task withdrawal is a separate administrator workflow and is out of scope for this phase.

---

## 13. API Key and Secret Management

The exposed frontend key has been removed from the source code. The project now uses the `/api/parse` serverless endpoint and reads the replacement key from `DEEPSEEK_API_KEY` at runtime.

1. The previously exposed key must still be revoked in the DeepSeek console.
2. API credentials must never be added to frontend JavaScript or Git history.
3. `.env`, rosters, sessions, logs containing personal data, and generated secrets must remain ignored.
4. Before each public release, scan the complete repository for secrets.

The browser calls the same-origin serverless endpoint and never receives the DeepSeek key.

---

## 14. GitHub and Future Delivery

- The source code may be public, but user data and deployment configuration remain private.
- Commit `.env.example` with placeholder names only; never commit `.env`.
- GitHub is used for version control, collaboration, issues, tests, and optional deployment automation. It is not the application database or backend runtime.
- Vercel serves the pilot frontend and same-origin serverless API. GitHub Pages remains a static-only demonstration option without AI parsing.
- Prefer a PWA as the first lightweight installable version; native packaging, branding, logo, splash animation, and app-store release are later phases.

---

## 15. Dynamic Date Processing (TODO)

Date-sensitive AI extraction must not rely on the model understanding relative expressions such as “this year” or “今年”. The backend must provide an explicit clock reference on every request.

- Compute the current date and year on the server using the `Asia/Shanghai` time zone.
- Inject the full current date (`YYYY-MM-DD`) and current year into the DeepSeek prompt for every parse request.
- When the source notification includes a month and day but omits the year, instruct the model to use the server-provided current year.
- Never hardcode a specific year such as `2026`; the value must update automatically across year boundaries.
- Keep explicitly supplied years unchanged, even when they differ from the current year.
- Add tests for dates without a year, explicit past or future years, December-to-January rollover, and server environments running in UTC.
- Where possible, validate or normalize the returned date in application code instead of depending only on prompt compliance.

This requirement is planned but not yet implemented.

---

## 16. Final Goal

Deliver a functional AI course task system that:
- Accepts input
- Extracts structured data
- Displays task board
- Supports iterative improvement via logs
