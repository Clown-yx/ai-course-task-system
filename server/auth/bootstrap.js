const fs = require("node:fs");
const path = require("node:path");

const { createPilotUser } = require("./routes.js");

function bootstrapPilotUsers(db, env = process.env) {
    const initialPassword = env.INITIAL_PASSWORD;
    const result = { created: 0, skipped: 0 };

    if (env.PILOT_OWNER_STUDENT_ID) {
        ensurePilotUser(db, {
            studentId: env.PILOT_OWNER_STUDENT_ID,
            displayName: env.PILOT_OWNER_DISPLAY_NAME || "平台管理员",
            globalRole: "platform_owner",
            initialPassword
        }, result);
    }

    if (env.PILOT_ROSTER_PATH) {
        const rosterPath = path.resolve(env.PILOT_ROSTER_PATH);
        const users = JSON.parse(fs.readFileSync(rosterPath, "utf8"));
        if (!Array.isArray(users)) {
            throw new Error("PILOT_ROSTER_PATH 必须指向用户数组 JSON 文件。");
        }

        for (const user of users) {
            ensurePilotUser(db, {
                studentId: user.studentId || user.student_id,
                displayName: user.displayName || user.display_name,
                globalRole: user.globalRole || user.global_role || "member",
                initialPassword
            }, result);
        }
    }

    return result;
}

function ensurePilotUser(db, user, result) {
    if (!user.studentId || !user.displayName) {
        throw new Error("内测用户需要 studentId 和 displayName。");
    }
    if (!user.initialPassword) {
        throw new Error("导入内测用户需要配置 INITIAL_PASSWORD。");
    }

    const existing = db.prepare("SELECT id FROM users WHERE student_id = ?").get(user.studentId);
    if (existing) {
        result.skipped += 1;
        return existing.id;
    }

    result.created += 1;
    return createPilotUser(db, user);
}

module.exports = {
    bootstrapPilotUsers
};
