const crypto = require("node:crypto");

const SESSION_COOKIE_NAME = "course_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function createSession(db, userId, options = {}) {
    const token = crypto.randomBytes(32).toString("base64url");
    const sessionHash = hashSessionToken(token);
    const sessionId = crypto.randomUUID();
    const now = options.now || new Date();
    const expiresAt = new Date(now.getTime() + (options.ttlMs || SESSION_TTL_MS)).toISOString();

    db.prepare(
        `INSERT INTO sessions (id, user_id, session_hash, expires_at, user_agent, ip_address)
         VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
        sessionId,
        userId,
        sessionHash,
        expiresAt,
        options.userAgent || null,
        options.ipAddress || null
    );

    return { token, sessionId, expiresAt };
}

function getSessionUser(db, token, now = new Date()) {
    if (!token) return null;
    const sessionHash = hashSessionToken(token);
    const row = db.prepare(
        `SELECT
            sessions.id AS session_id,
            sessions.expires_at,
            users.id,
            users.student_id,
            users.display_name,
            users.must_change_password,
            users.global_role,
            users.is_active
         FROM sessions
         JOIN users ON users.id = sessions.user_id
         WHERE sessions.session_hash = ?
           AND sessions.revoked_at IS NULL`
    ).get(sessionHash);

    if (!row || row.is_active !== 1) return null;
    if (new Date(row.expires_at).getTime() <= now.getTime()) return null;

    return {
        sessionId: row.session_id,
        id: row.id,
        studentId: row.student_id,
        displayName: row.display_name,
        mustChangePassword: row.must_change_password === 1,
        globalRole: row.global_role
    };
}

function revokeSession(db, token) {
    if (!token) return false;
    const sessionHash = hashSessionToken(token);
    const result = db.prepare(
        "UPDATE sessions SET revoked_at = datetime('now') WHERE session_hash = ? AND revoked_at IS NULL"
    ).run(sessionHash);
    return result.changes > 0;
}

function hashSessionToken(token) {
    return crypto.createHash("sha256").update(token).digest("base64url");
}

function parseCookies(cookieHeader) {
    const cookies = new Map();
    if (!cookieHeader) return cookies;

    for (const pair of cookieHeader.split(";")) {
        const index = pair.indexOf("=");
        if (index === -1) continue;
        const name = pair.slice(0, index).trim();
        const value = pair.slice(index + 1).trim();
        if (name) cookies.set(name, decodeURIComponent(value));
    }

    return cookies;
}

function getSessionTokenFromRequest(request) {
    return parseCookies(request.headers.cookie).get(SESSION_COOKIE_NAME) || "";
}

function buildSessionCookie(token, options = {}) {
    const parts = [
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
        "HttpOnly",
        "SameSite=Lax",
        "Path=/",
        `Max-Age=${Math.floor((options.ttlMs || SESSION_TTL_MS) / 1000)}`
    ];
    if (options.secure) parts.push("Secure");
    return parts.join("; ");
}

function buildExpiredSessionCookie() {
    return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

module.exports = {
    SESSION_COOKIE_NAME,
    SESSION_TTL_MS,
    createSession,
    getSessionUser,
    revokeSession,
    getSessionTokenFromRequest,
    buildSessionCookie,
    buildExpiredSessionCookie,
    hashSessionToken
};
