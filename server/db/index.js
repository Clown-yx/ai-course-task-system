const fs = require("node:fs");
const path = require("node:path");

const Database = require("better-sqlite3");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_DATABASE_PATH = path.join(PROJECT_ROOT, "data", "app.sqlite");
const SCHEMA_PATH = path.join(__dirname, "schema.sql");

function getDatabasePath(env = process.env) {
    return env.DATABASE_PATH || DEFAULT_DATABASE_PATH;
}

function openDatabase(options = {}) {
    const databasePath = options.databasePath || getDatabasePath(options.env);
    if (databasePath !== ":memory:") {
        fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }

    const db = new Database(databasePath);
    db.pragma("foreign_keys = ON");
    applySchema(db);
    return db;
}

function applySchema(db) {
    const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
    db.exec(schema);
    db.prepare(
        "INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (?, ?)"
    ).run(1, "initial_schema");
}

module.exports = {
    DEFAULT_DATABASE_PATH,
    getDatabasePath,
    openDatabase,
    applySchema
};
