const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const rootDir = path.join(__dirname, "..");
const schemaPath = path.join(rootDir, "server", "db", "schema.sql");
const gitignorePath = path.join(rootDir, ".gitignore");

function readSchema() {
    return fs.readFileSync(schemaPath, "utf8");
}

function tableBlock(schema, tableName) {
    const pattern = new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\((.*?)\\);`, "is");
    const match = schema.match(pattern);
    assert.ok(match, `missing table: ${tableName}`);
    return match[1];
}

test("schema file exists and defines the pilot tables", () => {
    assert.ok(fs.existsSync(schemaPath));

    const schema = readSchema();
    const requiredTables = [
        "schema_migrations",
        "users",
        "classes",
        "class_members",
        "personal_tasks",
        "class_tasks",
        "user_task_states",
        "sessions",
        "audit_events",
    ];

    for (const tableName of requiredTables) {
        assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName}\\b`, "i"));
    }
});

test("users table stores only password hashes and forced-change state", () => {
    const users = tableBlock(readSchema(), "users");

    assert.match(users, /\bstudent_id\b/i);
    assert.match(users, /\bdisplay_name\b/i);
    assert.match(users, /\bpassword_hash\b/i);
    assert.match(users, /\bmust_change_password\b/i);
    assert.match(users, /\bglobal_role\b/i);
    assert.doesNotMatch(users, /\b(raw_password|plain_password|initial_password|password_text)\b/i);
});

test("class membership supports the single-active-class pilot constraint", () => {
    const schema = readSchema();
    const members = tableBlock(schema, "class_members");

    assert.match(members, /\bclass_role\b/i);
    assert.match(members, /'creator'/i);
    assert.match(members, /'admin'/i);
    assert.match(members, /'member'/i);
    assert.match(schema, /idx_class_members_one_active_class_per_user/i);
    assert.match(schema, /WHERE left_at IS NULL/i);
});

test("task tables support soft delete and independent class-task completion", () => {
    const schema = readSchema();
    const personalTasks = tableBlock(schema, "personal_tasks");
    const classTasks = tableBlock(schema, "class_tasks");
    const userTaskStates = tableBlock(schema, "user_task_states");

    assert.match(personalTasks, /\bdeleted_at\b/i);
    assert.match(personalTasks, /\bstatus\b/i);
    assert.match(classTasks, /\bwithdrawn_at\b/i);
    assert.match(userTaskStates, /\bclass_task_id\b/i);
    assert.match(userTaskStates, /\buser_id\b/i);
    assert.match(userTaskStates, /\bstatus\b/i);
    assert.match(userTaskStates, /\bdeleted_at\b/i);
    assert.match(userTaskStates, /UNIQUE \(class_task_id, user_id\)/i);
});

test("gitignore blocks local databases and private pilot data", () => {
    const gitignoreLines = fs
        .readFileSync(gitignorePath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim());

    for (const pattern of ["*.db", "*.sqlite", "*.sqlite3", "data/", "sessions/", "rosters/"]) {
        assert.ok(gitignoreLines.includes(pattern), `missing .gitignore pattern: ${pattern}`);
    }
});
