const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const { createServer } = require("../server/index.js");
const { openDatabase } = require("../server/db/index.js");
const { createPilotUser } = require("../server/auth/routes.js");

let db;
let server;
let baseUrl;

before(async () => {
    db = openDatabase({ databasePath: ":memory:" });
    createPilotUser(db, {
        id: "user-auth-test",
        studentId: "24000001",
        displayName: "内测用户",
        initialPassword: "Initial-123456"
    });

    server = createServer({ db, sessionTtlMs: 60 * 60 * 1000, skipBootstrap: true });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    if (server) {
        await new Promise((resolve, reject) => {
            server.close(error => error ? reject(error) : resolve());
        });
    }
    if (db) db.close();
});

test("stores only a password hash for pilot users", () => {
    const row = db.prepare(
        "SELECT password_hash, must_change_password FROM users WHERE student_id = ?"
    ).get("24000001");

    assert.equal(row.must_change_password, 1);
    assert.match(row.password_hash, /^scrypt\$/);
    assert.notEqual(row.password_hash, "Initial-123456");
    assert.equal(row.password_hash.includes("Initial-123456"), false);
});

test("authenticates, forces password change, and rotates credentials", async () => {
    const failedLogin = await postJson("/api/auth/login", {
        studentId: "24000001",
        password: "wrong-password"
    });
    assert.equal(failedLogin.status, 401);

    const login = await postJson("/api/auth/login", {
        studentId: "24000001",
        password: "Initial-123456"
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.studentId, "24000001");
    assert.equal(login.body.user.mustChangePassword, true);
    assert.equal(login.body.user.passwordHash, undefined);
    assert.match(login.cookie, /course_session=/);
    assert.match(login.cookie, /HttpOnly/);

    const me = await getJson("/api/auth/me", login.cookie);
    assert.equal(me.status, 200);
    assert.equal(me.body.user.studentId, "24000001");
    assert.equal(me.body.user.mustChangePassword, true);

    const weakPassword = await postJson("/api/auth/change-password", {
        currentPassword: "Initial-123456",
        newPassword: "short"
    }, login.cookie);
    assert.equal(weakPassword.status, 400);

    const changed = await postJson("/api/auth/change-password", {
        currentPassword: "Initial-123456",
        newPassword: "Changed-123456"
    }, login.cookie);
    assert.equal(changed.status, 200);
    assert.deepEqual(changed.body, { ok: true });

    const oldPassword = await postJson("/api/auth/login", {
        studentId: "24000001",
        password: "Initial-123456"
    });
    assert.equal(oldPassword.status, 401);

    const newLogin = await postJson("/api/auth/login", {
        studentId: "24000001",
        password: "Changed-123456"
    });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.body.user.mustChangePassword, false);

    const logout = await postJson("/api/auth/logout", {}, newLogin.cookie);
    assert.equal(logout.status, 200);

    const afterLogout = await getJson("/api/auth/me", newLogin.cookie);
    assert.equal(afterLogout.status, 401);
});

async function postJson(pathname, payload, cookie = "") {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(cookie ? { Cookie: cookie } : {})
        },
        body: JSON.stringify(payload)
    });

    return {
        status: response.status,
        cookie: response.headers.get("set-cookie") || "",
        body: await response.json()
    };
}

async function getJson(pathname, cookie = "") {
    const response = await fetch(`${baseUrl}${pathname}`, {
        headers: cookie ? { Cookie: cookie } : {}
    });

    return {
        status: response.status,
        body: await response.json()
    };
}
