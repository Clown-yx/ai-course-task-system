const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { getDatabasePath, openDatabase } = require("../server/db/index.js");

test("uses data/app.sqlite as the default database path", () => {
    assert.match(getDatabasePath(), /data[\\/]app\.sqlite$/);
});

test("opens sqlite database and applies schema", () => {
    const db = openDatabase({ databasePath: ":memory:" });
    try {
        const usersTable = db.prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'"
        ).get();
        const migration = db.prepare(
            "SELECT version, name FROM schema_migrations WHERE version = 1"
        ).get();

        assert.deepEqual(usersTable, { name: "users" });
        assert.deepEqual(migration, { version: 1, name: "initial_schema" });
    } finally {
        db.close();
    }
});

test("creates parent directory for file databases", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "course-db-"));
    const databasePath = path.join(tempRoot, "nested", "pilot.sqlite");
    const db = openDatabase({ databasePath });
    try {
        assert.ok(fs.existsSync(databasePath));
    } finally {
        db.close();
    }
});
