const crypto = require("node:crypto");

const { hashPassword, verifyPassword, assertUsablePassword } = require("./password.js");
const {
    createSession,
    getSessionUser,
    revokeSession,
    getSessionTokenFromRequest,
    buildSessionCookie,
    buildExpiredSessionCookie
} = require("./session.js");

function createAuthRouter(db, options = {}) {
    return async function handleAuthRequest(request, response, context = {}) {
        const pathname = context.pathname;
        const body = context.body || {};

        if (request.method === "POST" && pathname === "/api/auth/login") {
            return login(db, request, response, body, options);
        }
        if (request.method === "POST" && pathname === "/api/auth/logout") {
            return logout(db, request, response);
        }
        if (request.method === "GET" && pathname === "/api/auth/me") {
            return me(db, request, response);
        }
        if (request.method === "POST" && pathname === "/api/auth/change-password") {
            return changePassword(db, request, response, body);
        }

        response.status(404).json({ error: "认证接口不存在。" });
    };
}

function createPilotUser(db, user) {
    const id = user.id || crypto.randomUUID();
    const initialPassword = user.initialPassword || process.env.INITIAL_PASSWORD;
    if (!initialPassword) {
        throw new Error("创建内测用户需要 INITIAL_PASSWORD 或 initialPassword。");
    }

    const passwordHash = hashPassword(initialPassword);
    db.prepare(
        `INSERT INTO users (
            id, student_id, display_name, password_hash, must_change_password, global_role
         ) VALUES (?, ?, ?, ?, 1, ?)`
    ).run(
        id,
        user.studentId,
        user.displayName,
        passwordHash,
        user.globalRole || "member"
    );

    return id;
}

function login(db, request, response, body, options) {
    const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!studentId || !password) {
        response.status(400).json({ error: "请输入学号和密码。" });
        return;
    }

    const user = db.prepare(
        `SELECT id, student_id, display_name, password_hash, must_change_password, global_role, is_active
         FROM users
         WHERE student_id = ?`
    ).get(studentId);

    if (!user || user.is_active !== 1 || !verifyPassword(password, user.password_hash)) {
        response.status(401).json({ error: "学号或密码错误。" });
        return;
    }

    const session = createSession(db, user.id, {
        userAgent: request.headers["user-agent"] || null,
        ipAddress: request.socket?.remoteAddress || null,
        ttlMs: options.sessionTtlMs
    });

    response.setHeader("Set-Cookie", buildSessionCookie(session.token, {
        ttlMs: options.sessionTtlMs,
        secure: options.secureCookies
    }));
    response.status(200).json({
        user: serializeUser(user),
        mustChangePassword: user.must_change_password === 1
    });
}

function logout(db, request, response) {
    revokeSession(db, getSessionTokenFromRequest(request));
    response.setHeader("Set-Cookie", buildExpiredSessionCookie());
    response.status(200).json({ ok: true });
}

function me(db, request, response) {
    const user = getSessionUser(db, getSessionTokenFromRequest(request));
    if (!user) {
        response.status(401).json({ error: "未登录。" });
        return;
    }
    response.status(200).json({ user });
}

function changePassword(db, request, response, body) {
    const user = getSessionUser(db, getSessionTokenFromRequest(request));
    if (!user) {
        response.status(401).json({ error: "未登录。" });
        return;
    }

    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);

    if (!row || !verifyPassword(currentPassword, row.password_hash)) {
        response.status(401).json({ error: "当前密码错误。" });
        return;
    }

    try {
        assertUsablePassword(newPassword);
    } catch (error) {
        response.status(400).json({ error: error.message });
        return;
    }

    if (newPassword === currentPassword) {
        response.status(400).json({ error: "新密码不能与当前密码相同。" });
        return;
    }

    db.prepare(
        "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?"
    ).run(hashPassword(newPassword), user.id);

    response.status(200).json({ ok: true });
}

function serializeUser(user) {
    return {
        id: user.id,
        studentId: user.student_id,
        displayName: user.display_name,
        mustChangePassword: user.must_change_password === 1,
        globalRole: user.global_role
    };
}

module.exports = {
    createAuthRouter,
    createPilotUser
};
