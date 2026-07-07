const crypto = require("node:crypto");

const { getSessionTokenFromRequest, getSessionUser } = require("../auth/session.js");

function createPersonalTaskRouter(db) {
    return async function handlePersonalTaskRequest(request, response, context = {}) {
        const user = requireReadyUser(db, request, response);
        if (!user) return;

        const pathname = context.pathname || "";
        const body = context.body || {};
        const taskId = getTaskId(pathname);

        if (request.method === "GET" && pathname === "/api/tasks/personal") {
            return listTasks(db, response, user.id);
        }
        if (request.method === "POST" && pathname === "/api/tasks/personal") {
            return createTasks(db, response, user.id, body);
        }
        if (request.method === "PATCH" && taskId) {
            return updateTask(db, response, user.id, taskId, body);
        }
        if (request.method === "POST" && pathname.endsWith("/trash") && taskId) {
            return softDeleteTask(db, response, user.id, taskId);
        }
        if (request.method === "POST" && pathname.endsWith("/restore") && taskId) {
            return restoreTask(db, response, user.id, taskId);
        }
        if (request.method === "DELETE" && taskId) {
            return permanentlyDeleteTask(db, response, user.id, taskId);
        }

        response.status(404).json({ error: "个人任务接口不存在。" });
    };
}

function requireReadyUser(db, request, response) {
    const user = getSessionUser(db, getSessionTokenFromRequest(request));
    if (!user) {
        response.status(401).json({ error: "未登录。" });
        return null;
    }
    if (user.mustChangePassword) {
        response.status(403).json({ error: "首次登录必须先修改密码。" });
        return null;
    }
    return user;
}

function listTasks(db, response, ownerUserId) {
    const rows = db.prepare(
        `SELECT *
         FROM personal_tasks
         WHERE owner_user_id = ?
         ORDER BY created_at ASC, id ASC`
    ).all(ownerUserId);

    response.status(200).json({ tasks: rows.map(serializeTask) });
}

function createTasks(db, response, ownerUserId, body) {
    const inputTasks = Array.isArray(body.tasks) ? body.tasks : [body.task || body];
    const normalizedTasks = inputTasks.map(normalizeTaskInput);
    if (!normalizedTasks.length) {
        response.status(400).json({ error: "请至少提供一个任务。" });
        return;
    }

    const insert = db.prepare(
        `INSERT INTO personal_tasks (
            id, owner_user_id, course_name, course_type, importance, task_type,
            title, requirements, submission_method, ddl, status, source, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const transaction = db.transaction(tasks => {
        return tasks.map(task => {
            const id = crypto.randomUUID();
            insert.run(
                id,
                ownerUserId,
                task.course_name,
                task.course_type,
                task.importance,
                task.kind,
                task.title,
                task.requirements,
                task.submission_method,
                task.ddl,
                task.status,
                task.source,
                null
            );
            return getOwnedTask(db, ownerUserId, id);
        });
    });

    const createdTasks = transaction(normalizedTasks).map(serializeTask);
    response.status(201).json({ tasks: createdTasks });
}

function updateTask(db, response, ownerUserId, taskId, body) {
    const existing = getOwnedTask(db, ownerUserId, taskId);
    if (!existing) {
        response.status(404).json({ error: "任务不存在。" });
        return;
    }

    const status = body.status;
    if (!["pending", "done"].includes(status)) {
        response.status(400).json({ error: "任务状态无效。" });
        return;
    }

    db.prepare(
        "UPDATE personal_tasks SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_user_id = ?"
    ).run(status, taskId, ownerUserId);

    response.status(200).json({ task: serializeTask(getOwnedTask(db, ownerUserId, taskId)) });
}

function softDeleteTask(db, response, ownerUserId, taskId) {
    const existing = getOwnedTask(db, ownerUserId, taskId);
    if (!existing) {
        response.status(404).json({ error: "任务不存在。" });
        return;
    }

    db.prepare(
        "UPDATE personal_tasks SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND owner_user_id = ?"
    ).run(taskId, ownerUserId);

    response.status(200).json({ task: serializeTask(getOwnedTask(db, ownerUserId, taskId)) });
}

function restoreTask(db, response, ownerUserId, taskId) {
    const existing = getOwnedTask(db, ownerUserId, taskId);
    if (!existing) {
        response.status(404).json({ error: "任务不存在。" });
        return;
    }

    db.prepare(
        "UPDATE personal_tasks SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND owner_user_id = ?"
    ).run(taskId, ownerUserId);

    response.status(200).json({ task: serializeTask(getOwnedTask(db, ownerUserId, taskId)) });
}

function permanentlyDeleteTask(db, response, ownerUserId, taskId) {
    const result = db.prepare(
        "DELETE FROM personal_tasks WHERE id = ? AND owner_user_id = ? AND deleted_at IS NOT NULL"
    ).run(taskId, ownerUserId);

    if (result.changes === 0) {
        response.status(404).json({ error: "任务不存在或尚未进入回收站。" });
        return;
    }

    response.status(200).json({ ok: true });
}

function getTaskId(pathname) {
    const match = pathname.match(/^\/api\/tasks\/personal\/([^/]+)(?:\/(?:trash|restore))?$/);
    return match ? decodeURIComponent(match[1]) : "";
}

function getOwnedTask(db, ownerUserId, taskId) {
    return db.prepare("SELECT * FROM personal_tasks WHERE id = ? AND owner_user_id = ?").get(taskId, ownerUserId);
}

function normalizeTaskInput(input) {
    if (!input || typeof input !== "object") {
        throw new Error("任务数据无效。");
    }

    const kind = input.kind || input.task_type;
    const isProject = kind === "project";
    const title = isProject
        ? input.name || input.project_name || input.title || input.content
        : input.content || input.title;

    if (!["homework", "project"].includes(kind)) {
        throw new Error("任务类型无效。");
    }
    if (!isNonEmptyString(input.course_name) || !isNonEmptyString(title)) {
        throw new Error("课程名称和任务标题不能为空。");
    }

    return {
        course_name: input.course_name.trim(),
        course_type: normalizeEnum(input.course_type, ["professional", "general", "elective", "other"], "other"),
        importance: normalizeEnum(input.importance, ["high", "medium", "low"], "medium"),
        kind,
        title: title.trim(),
        requirements: isProject ? String(input.requirements || "") : null,
        submission_method: isProject ? String(input.submission_method || input.format || "") : null,
        ddl: isISODate(input.ddl) ? input.ddl : null,
        status: normalizeEnum(input.status, ["pending", "done"], "pending"),
        source: normalizeEnum(input.source, ["manual", "ai", "migration"], "manual")
    };
}

function serializeTask(row) {
    const base = {
        id: row.id,
        kind: row.task_type,
        course_name: row.course_name,
        course_type: row.course_type,
        importance: row.importance,
        ddl: row.ddl,
        status: row.status,
        source: row.source,
        created_at: row.created_at,
        updated_at: row.updated_at,
        deleted_at: row.deleted_at
    };

    if (row.task_type === "project") {
        return {
            ...base,
            name: row.title,
            requirements: row.requirements || "",
            submission_method: row.submission_method || ""
        };
    }

    return {
        ...base,
        content: row.title
    };
}

function normalizeEnum(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
}

function isISODate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0;
}

module.exports = {
    createPersonalTaskRouter,
    normalizeTaskInput,
    serializeTask
};
