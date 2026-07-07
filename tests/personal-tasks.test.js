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
        id: "user-task-a",
        studentId: "24001001",
        displayName: "任务用户甲",
        initialPassword: "Initial-123456"
    });
    createPilotUser(db, {
        id: "user-task-b",
        studentId: "24001002",
        displayName: "任务用户乙",
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

test("rejects personal task access before login and before password change", async () => {
    const anonymous = await getJson("/api/tasks/personal");
    assert.equal(anonymous.status, 401);

    const login = await postJson("/api/auth/login", {
        studentId: "24001001",
        password: "Initial-123456"
    });
    assert.equal(login.status, 200);

    const forcedChange = await getJson("/api/tasks/personal", login.cookie);
    assert.equal(forcedChange.status, 403);
});

test("creates, updates, trashes, restores, and permanently deletes owned tasks", async () => {
    const userA = await readyUser("24001001", "Changed-A-123456");
    const userB = await readyUser("24001002", "Changed-B-123456");

    const created = await postJson("/api/tasks/personal", {
        tasks: [
            {
                kind: "homework",
                course_name: "大学物理",
                course_type: "professional",
                importance: "high",
                content: "完成第三章习题",
                ddl: "2026-07-10"
            },
            {
                kind: "project",
                course_name: "程序设计",
                course_type: "general",
                importance: "medium",
                name: "小组展示",
                requirements: "准备 5 分钟展示",
                submission_method: "课堂提交"
            }
        ]
    }, userA.cookie);
    assert.equal(created.status, 201);
    assert.equal(created.body.tasks.length, 2);
    assert.equal(created.body.tasks[0].content, "完成第三章习题");
    assert.equal(created.body.tasks[1].name, "小组展示");

    const userAList = await getJson("/api/tasks/personal", userA.cookie);
    assert.equal(userAList.status, 200);
    assert.equal(userAList.body.tasks.length, 2);

    const userBList = await getJson("/api/tasks/personal", userB.cookie);
    assert.equal(userBList.status, 200);
    assert.equal(userBList.body.tasks.length, 0);

    const taskId = created.body.tasks[0].id;
    const forbiddenUpdate = await patchJson(`/api/tasks/personal/${taskId}`, { status: "done" }, userB.cookie);
    assert.equal(forbiddenUpdate.status, 404);

    const updated = await patchJson(`/api/tasks/personal/${taskId}`, { status: "done" }, userA.cookie);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.task.status, "done");

    const trashed = await postJson(`/api/tasks/personal/${taskId}/trash`, {}, userA.cookie);
    assert.equal(trashed.status, 200);
    assert.ok(trashed.body.task.deleted_at);

    const restored = await postJson(`/api/tasks/personal/${taskId}/restore`, {}, userA.cookie);
    assert.equal(restored.status, 200);
    assert.equal(restored.body.task.deleted_at, null);

    const trashedAgain = await postJson(`/api/tasks/personal/${taskId}/trash`, {}, userA.cookie);
    assert.equal(trashedAgain.status, 200);

    const removed = await deleteJson(`/api/tasks/personal/${taskId}`, userA.cookie);
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body, { ok: true });

    const finalList = await getJson("/api/tasks/personal", userA.cookie);
    assert.equal(finalList.body.tasks.length, 1);
    assert.equal(finalList.body.tasks[0].kind, "project");
});

async function readyUser(studentId, newPassword) {
    const login = await postJson("/api/auth/login", {
        studentId,
        password: "Initial-123456"
    });
    if (login.status !== 200) {
        const relogin = await postJson("/api/auth/login", { studentId, password: newPassword });
        assert.equal(relogin.status, 200);
        return relogin;
    }

    const changed = await postJson("/api/auth/change-password", {
        currentPassword: "Initial-123456",
        newPassword
    }, login.cookie);
    assert.equal(changed.status, 200);

    const relogin = await postJson("/api/auth/login", { studentId, password: newPassword });
    assert.equal(relogin.status, 200);
    return relogin;
}

async function postJson(pathname, payload, cookie = "") {
    return requestJson("POST", pathname, payload, cookie);
}

async function patchJson(pathname, payload, cookie = "") {
    return requestJson("PATCH", pathname, payload, cookie);
}

async function deleteJson(pathname, cookie = "") {
    return requestJson("DELETE", pathname, undefined, cookie);
}

async function getJson(pathname, cookie = "") {
    return requestJson("GET", pathname, undefined, cookie);
}

async function requestJson(method, pathname, payload, cookie = "") {
    const response = await fetch(`${baseUrl}${pathname}`, {
        method,
        headers: {
            ...(payload !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(cookie ? { Cookie: cookie } : {})
        },
        body: payload === undefined ? undefined : JSON.stringify(payload)
    });

    return {
        status: response.status,
        cookie: response.headers.get("set-cookie") || "",
        body: await response.json()
    };
}
