const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { openDatabase } = require("../server/db/index.js");
const { bootstrapPilotUsers } = require("../server/auth/bootstrap.js");

test("bootstraps pilot owner and ignored roster users without resetting existing users", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "course-roster-"));
    const rosterPath = path.join(tempRoot, "pilot-users.json");
    fs.writeFileSync(rosterPath, JSON.stringify([
        { studentId: "24000002", displayName: "内测成员一" },
        { student_id: "24000003", display_name: "内测成员二", global_role: "member" }
    ]));

    const db = openDatabase({ databasePath: ":memory:" });
    try {
        const first = bootstrapPilotUsers(db, {
            INITIAL_PASSWORD: "Initial-123456",
            PILOT_OWNER_STUDENT_ID: "24000001",
            PILOT_OWNER_DISPLAY_NAME: "平台所有者",
            PILOT_ROSTER_PATH: rosterPath
        });
        const second = bootstrapPilotUsers(db, {
            INITIAL_PASSWORD: "Initial-123456",
            PILOT_OWNER_STUDENT_ID: "24000001",
            PILOT_OWNER_DISPLAY_NAME: "平台所有者",
            PILOT_ROSTER_PATH: rosterPath
        });
        const rows = db.prepare(
            "SELECT student_id, display_name, global_role, must_change_password FROM users ORDER BY student_id"
        ).all();

        assert.deepEqual(first, { created: 3, skipped: 0 });
        assert.deepEqual(second, { created: 0, skipped: 3 });
        assert.deepEqual(rows.map(row => row.student_id), ["24000001", "24000002", "24000003"]);
        assert.equal(rows[0].global_role, "platform_owner");
        assert.equal(rows.every(row => row.must_change_password === 1), true);
    } finally {
        db.close();
    }
});
