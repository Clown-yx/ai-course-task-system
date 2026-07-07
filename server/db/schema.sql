-- SQLite schema for the local pilot.
-- This file defines structure only. Real database files, rosters, sessions,
-- logs, and secrets must stay outside Git.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
    global_role TEXT NOT NULL DEFAULT 'member' CHECK (global_role IN ('platform_owner', 'member')),
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS classes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    creator_user_id TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (creator_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS class_members (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    class_role TEXT NOT NULL CHECK (class_role IN ('creator', 'admin', 'member')),
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    left_at TEXT,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (class_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_class_members_one_active_class_per_user
ON class_members(user_id)
WHERE left_at IS NULL;

CREATE TABLE IF NOT EXISTS personal_tasks (
    id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL,
    course_name TEXT NOT NULL,
    course_type TEXT NOT NULL DEFAULT 'other' CHECK (course_type IN ('professional', 'general', 'elective', 'other')),
    importance TEXT NOT NULL DEFAULT 'medium' CHECK (importance IN ('high', 'medium', 'low')),
    task_type TEXT NOT NULL CHECK (task_type IN ('homework', 'project')),
    title TEXT NOT NULL,
    requirements TEXT,
    submission_method TEXT,
    ddl TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'migration')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_personal_tasks_owner_active
ON personal_tasks(owner_user_id, deleted_at, status, ddl);

CREATE TABLE IF NOT EXISTS class_tasks (
    id TEXT PRIMARY KEY,
    class_id TEXT NOT NULL,
    publisher_user_id TEXT NOT NULL,
    course_name TEXT NOT NULL,
    course_type TEXT NOT NULL DEFAULT 'other' CHECK (course_type IN ('professional', 'general', 'elective', 'other')),
    importance TEXT NOT NULL DEFAULT 'medium' CHECK (importance IN ('high', 'medium', 'low')),
    task_type TEXT NOT NULL CHECK (task_type IN ('homework', 'project')),
    title TEXT NOT NULL,
    requirements TEXT,
    submission_method TEXT,
    ddl TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai', 'migration')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    withdrawn_at TEXT,
    withdrawn_by_user_id TEXT,
    FOREIGN KEY (class_id) REFERENCES classes(id),
    FOREIGN KEY (publisher_user_id) REFERENCES users(id),
    FOREIGN KEY (withdrawn_by_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_class_tasks_class_active
ON class_tasks(class_id, withdrawn_at, ddl);

CREATE TABLE IF NOT EXISTS user_task_states (
    id TEXT PRIMARY KEY,
    class_task_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at TEXT,
    FOREIGN KEY (class_task_id) REFERENCES class_tasks(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (class_task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_task_states_user_active
ON user_task_states(user_id, deleted_at, status);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    revoked_at TEXT,
    user_agent TEXT,
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_active
ON sessions(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS audit_events (
    id TEXT PRIMARY KEY,
    actor_user_id TEXT,
    event_type TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
ON audit_events(created_at);
