const STORAGE_KEY = "course-ai-tasks-v1";
const API_URL = "./api/parse";
const BOARD_LIST_IDS = ["done-list", "today-list", "upcoming-list"];

const COURSE_TYPE_LABELS = {
    professional: "专业课",
    general: "通识课",
    elective: "选修课",
    other: "其他"
};

const IMPORTANCE_LABELS = {
    high: "高",
    medium: "中",
    low: "低"
};

const EXAM_ITEM_LABELS = {
    class_questions: "课堂例题",
    ppt_examples: "PPT 例题",
    homework: "平时作业",
    past_exam: "往年题",
    new_questions: "新题型"
};

let tasks = loadTasks();
let pendingDraft = null;
let pendingConfirmation = null;
let lastFocusedElement = null;
let deleteAnimationState = null;
let taskTransferState = null;

document.addEventListener("DOMContentLoaded", () => {
    bindStaticEvents();
    addTaskRow("homework");
    renderBoard();
});

function bindStaticEvents() {
    document.getElementById("add-homework").addEventListener("click", () => addTaskRow("homework"));
    document.getElementById("add-project").addEventListener("click", () => addTaskRow("project"));
    document.getElementById("preview-manual").addEventListener("click", createPreview);
    document.getElementById("parse-ai").addEventListener("click", runAI);
    document.getElementById("back-to-input").addEventListener("click", () => showPage("input-page"));
    document.getElementById("confirm-add").addEventListener("click", confirmDraft);
    document.getElementById("add-course").addEventListener("click", () => showPage("input-page"));
    document.getElementById("view-board").addEventListener("click", () => showPage("board-page"));
    document.getElementById("open-trash").addEventListener("click", () => showPage("trash-page"));
    document.getElementById("back-to-board").addEventListener("click", () => showPage("board-page"));
    document.getElementById("clear-trash").addEventListener("click", requestClearTrash);
    document.getElementById("modal-cancel").addEventListener("click", closeConfirmation);
    document.getElementById("modal-confirm").addEventListener("click", confirmPendingAction);
    document.getElementById("has-exam").addEventListener("change", toggleExamItems);

    document.querySelector(".board").addEventListener("click", event => {
        const actionButton = event.target.closest("[data-task-action]");
        if (!actionButton) return;
        if (deleteAnimationState || taskTransferState) return;
        if (actionButton.dataset.taskAction === "trash") {
            requestMoveToTrash(actionButton.dataset.taskId, actionButton.closest(".task-card"));
            return;
        }
        changeTaskStatus(actionButton.dataset.taskId, actionButton.dataset.taskAction, actionButton.closest(".task-card"));
    });

    document.getElementById("trash-list").addEventListener("click", event => {
        const actionButton = event.target.closest("[data-trash-action]");
        if (!actionButton) return;
        if (actionButton.dataset.trashAction === "restore") {
            restoreTask(actionButton.dataset.taskId, actionButton.closest(".task-card"));
            return;
        }
        requestPermanentDelete(actionButton.dataset.taskId);
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && deleteAnimationState?.phase === "waiting") {
            event.preventDefault();
            cancelCardDeleteAnimation();
            return;
        }
        if (event.key === "Escape" && !document.getElementById("confirm-modal").hidden) {
            closeConfirmation();
        }
    });
}

function addTaskRow(kind, data = {}) {
    const list = document.getElementById(kind === "project" ? "project-list" : "homework-list");
    const row = document.createElement("div");
    row.className = `task-row ${kind === "project" ? "project-row" : ""}`;
    row.dataset.kind = kind;

    if (kind === "project") {
        const projectName = data.name || data.project_name || data.content || "";
        const requirements = typeof data.requirements === "string"
            ? data.requirements
            : (data.name ? data.content : "") || "";
        const submissionMethod = data.submission_method || data.format || "";
        row.innerHTML = `
            <input class="project-name" type="text" maxlength="100" placeholder="项目名称" value="${escapeAttribute(projectName)}">
            <input class="project-requirements" type="text" maxlength="500" placeholder="内容及要求" value="${escapeAttribute(requirements)}">
            <input class="project-submission" type="text" maxlength="200" placeholder="云盘链接 / SPOC / 邮箱地址 / ……" value="${escapeAttribute(submissionMethod)}">
            <input class="task-ddl" type="date" aria-label="DDL 日期" value="${isISODate(data.ddl) ? data.ddl : ""}">
            <button class="line-button remove-row" type="button" aria-label="删除此项">×</button>
        `;
    } else {
        row.innerHTML = `
            <input class="task-content" type="text" maxlength="300" placeholder="作业内容" value="${escapeAttribute(data.content || "")}">
            <input class="task-ddl" type="date" aria-label="DDL 日期" value="${isISODate(data.ddl) ? data.ddl : ""}">
            <button class="line-button remove-row" type="button" aria-label="删除此项">×</button>
        `;
    }

    const dateInput = row.querySelector(".task-ddl");
    lockDateToPicker(dateInput);
    row.querySelector(".remove-row").addEventListener("click", () => row.remove());
    list.appendChild(row);
}

function lockDateToPicker(input) {
    input.addEventListener("keydown", event => event.preventDefault());
    input.addEventListener("paste", event => event.preventDefault());
    input.addEventListener("drop", event => event.preventDefault());
    input.addEventListener("click", () => {
        if (typeof input.showPicker === "function") input.showPicker();
    });
}

function toggleExamItems() {
    const hasExam = document.getElementById("has-exam").checked;
    const container = document.getElementById("exam-items");
    container.setAttribute("aria-disabled", String(!hasExam));
    container.querySelectorAll("input").forEach(input => {
        input.disabled = !hasExam;
        if (!hasExam) input.checked = false;
    });
}

function collectFormData() {
    const courseName = document.getElementById("course-name").value.trim();
    const taskRows = [...document.querySelectorAll(".task-row")];
    const parsedTasks = taskRows.map(row => {
        const kind = row.dataset.kind;
        const ddl = row.querySelector(".task-ddl").value || null;
        if (kind === "project") {
            const name = row.querySelector(".project-name").value.trim();
            const requirements = row.querySelector(".project-requirements").value.trim();
            const submissionMethod = row.querySelector(".project-submission").value.trim();
            if (!name && !requirements && !submissionMethod && !ddl) return null;
            if (!name || !requirements || !submissionMethod) {
                throw new Error("项目名称、内容及要求、提交方式必须全部填写。 ");
            }
            return { kind, name, requirements, submission_method: submissionMethod, ddl };
        }

        const content = row.querySelector(".task-content").value.trim();
        return content ? { kind, content, ddl } : null;
    }).filter(Boolean);

    if (!courseName) throw new Error("请填写课程名称。 ");
    if (!parsedTasks.length) throw new Error("请至少填写一条作业或项目。 ");

    const hasExam = document.getElementById("has-exam").checked;
    const examItems = {};
    document.querySelectorAll("[data-exam-item]").forEach(input => {
        examItems[input.dataset.examItem] = hasExam && input.checked;
    });

    return {
        course_name: courseName,
        course_type: document.getElementById("course-type").value,
        importance: document.getElementById("importance").value,
        tasks: parsedTasks,
        exam: { has_exam: hasExam, items: examItems }
    };
}

function createPreview() {
    const status = document.getElementById("ai-status");
    try {
        pendingDraft = collectFormData();
        status.className = "status-box";
        status.textContent = "";
        renderConfirmation(pendingDraft);
        showPage("confirm-page");
    } catch (error) {
        showStatus(error.message, "error");
    }
}

function renderConfirmation(draft) {
    const examSummary = draft.exam.has_exam
        ? Object.entries(draft.exam.items).filter(([, enabled]) => enabled).map(([key]) => EXAM_ITEM_LABELS[key]).join(" / ") || "有考试，范围未指定"
        : "无考试";

    document.getElementById("confirm-summary").innerHTML = `
        <div class="summary-card">
            <div class="summary-item"><span>课程名称</span><strong>${escapeHtml(draft.course_name)}</strong></div>
            <div class="summary-item"><span>课程类型</span><strong>${COURSE_TYPE_LABELS[draft.course_type]}</strong></div>
            <div class="summary-item"><span>重要程度</span><strong>${IMPORTANCE_LABELS[draft.importance]}</strong></div>
            <div class="summary-item"><span>考试</span><strong>${escapeHtml(examSummary)}</strong></div>
        </div>
    `;

    document.getElementById("confirm-cards").innerHTML = draft.tasks
        .map((task, index) => createTaskCardHtml({
            ...task,
            course_name: draft.course_name,
            course_type: draft.course_type,
            importance: draft.importance
        }, { preview: true, index }))
        .join("");
}

function confirmDraft() {
    if (!pendingDraft) return;

    const createdTasks = pendingDraft.tasks.map(task => ({
        ...task,
        id: createId(),
        course_name: pendingDraft.course_name,
        course_type: pendingDraft.course_type,
        importance: pendingDraft.importance,
        status: "pending",
        exam: pendingDraft.exam
    }));

    tasks.push(...createdTasks);
    saveTasks();
    pendingDraft = null;
    renderBoard();
    resetForm();
    showPage("board-page");
}

function renderBoard() {
    const groups = { done: [], today: [], upcoming: [] };
    const activeTasks = tasks.filter(task => !task.deleted_at);
    activeTasks.forEach(task => groups[classifyTask(task)].push(task));
    const deletedCount = tasks.length - activeTasks.length;

    const viewBoardButton = document.getElementById("view-board");
    viewBoardButton.hidden = tasks.length === 0;
    viewBoardButton.textContent = `查看任务看板（${activeTasks.length}）→`;
    document.getElementById("open-trash").textContent = `回收站（${deletedCount}）`;

    renderTaskList("done", groups.done);
    renderTaskList("today", groups.today);
    renderTaskList("upcoming", groups.upcoming);
    renderTrash();
}

function renderTrash() {
    const deletedTasks = tasks.filter(task => task.deleted_at);
    const trashList = document.getElementById("trash-list");
    document.getElementById("trash-count").textContent = String(deletedTasks.length);
    document.getElementById("clear-trash").disabled = deletedTasks.length === 0;
    trashList.innerHTML = deletedTasks.length
        ? deletedTasks.map((task, index) => createTaskCardHtml(task, { trash: true, index })).join("")
        : `<div class="empty-state">回收站为空</div>`;
}

function renderTaskList(group, groupTasks) {
    const list = document.getElementById(`${group}-list`);
    const count = document.getElementById(`${group}-count`);
    if (!list || !count) return;

    count.textContent = String(groupTasks.length);
    list.innerHTML = groupTasks.length
        ? groupTasks.map(task => createTaskCardHtml(task, { group })).join("")
        : `<div class="empty-state">暂无任务</div>`;
}

function createTaskCardHtml(task, options = {}) {
    const overdue = !options.trash && task.status !== "done" && isOverdue(task.ddl);
    const isProject = task.kind === "project";
    const kindLabel = isProject ? "PROJECT CARD" : "HOMEWORK CARD";
    const ddlLabel = task.ddl || "未设置 DDL";
    const taskTitle = isProject ? (task.name || task.project_name || task.content || "未命名项目") : task.content;
    const requirements = isProject ? (task.requirements || "") : "";
    const submissionMethod = isProject ? (task.submission_method || task.format || "") : "";
    const projectDetails = isProject ? `
        <p class="card-requirements" title="${escapeAttribute(requirements)}">${escapeHtml(requirements || "未填写内容及要求")}</p>
        <p class="card-submission" title="${escapeAttribute(submissionMethod)}">提交方式：${escapeHtml(submissionMethod || "未填写")}</p>
    ` : "";
    let action = "";
    if (options.trash) {
        action = `
            <div class="trash-card-actions">
                <button class="line-button" type="button" data-trash-action="restore" data-task-id="${escapeAttribute(task.id)}">恢复</button>
                <button class="line-button" type="button" data-trash-action="permanent" data-task-id="${escapeAttribute(task.id)}">永久删除</button>
            </div>
        `;
    } else if (!options.preview) {
        action = `
            <button class="line-button" type="button" data-task-action="${task.status === "done" ? "restore" : "complete"}" data-task-id="${escapeAttribute(task.id)}">
                ${task.status === "done" ? "恢复任务 →" : "完成任务 →"}
            </button>
        `;
    }

    const deleteControl = options.preview || options.trash ? "" : `
        <button class="card-delete" type="button" data-task-action="trash" data-task-id="${escapeAttribute(task.id)}" aria-label="删除任务：${escapeAttribute(taskTitle)}">×</button>
    `;

    return `
        <article class="task-card importance-${task.importance || "medium"} ${overdue ? "overdue" : ""}" data-task-id="${escapeAttribute(task.id || "preview")}" style="animation-delay:${(options.index || 0) * 35}ms">
            ${deleteControl}
            <div class="card-kind">${kindLabel}${overdue ? " / OVERDUE" : ""}</div>
            <p class="card-course" title="${escapeAttribute(task.course_name)}">${escapeHtml(task.course_name)}</p>
            <h3 title="${escapeAttribute(taskTitle)}">${escapeHtml(taskTitle)}</h3>
            ${projectDetails}
            <p class="card-meta">${escapeHtml(COURSE_TYPE_LABELS[task.course_type] || "其他")} · 重要程度 ${escapeHtml(IMPORTANCE_LABELS[task.importance] || "中")}</p>
            <p class="card-ddl">DDL：${escapeHtml(ddlLabel)}</p>
            ${action}
        </article>
    `;
}

function classifyTask(task) {
    if (task.status === "done") return "done";
    if (!task.ddl) return "upcoming";
    return task.ddl <= getLocalDateString() ? "today" : "upcoming";
}

function changeTaskStatus(taskId, action, card) {
    const task = tasks.find(item => item.id === taskId);
    if (!task || !card || taskTransferState || deleteAnimationState) return;
    startTaskTransfer(task, action, card).catch(error => {
        console.error("任务状态动画失败：", error);
        cleanupTaskTransfer(true);
    });
}

function requestMoveToTrash(taskId, card) {
    const task = tasks.find(item => item.id === taskId && !item.deleted_at);
    if (!task || !card || deleteAnimationState || taskTransferState) return;
    startCardDeleteAnimation(task, card).catch(error => {
        console.error("删除动画失败：", error);
        cleanupCardDeleteAnimation(true);
    });
}

async function startCardDeleteAnimation(task, card) {
    const sourceRect = card.getBoundingClientRect();
    const sourceStyle = getComputedStyle(card);
    const sourceList = card.closest(".card-list");
    const deleteButton = card.querySelector(".card-delete");
    const overlay = document.createElement("div");
    const morph = document.createElement("div");
    const cardFace = card.cloneNode(true);
    const confirmFace = document.createElement("div");

    overlay.className = "card-morph-overlay";
    morph.className = "card-morph-window";
    cardFace.classList.add("card-morph-face");
    cardFace.classList.remove("delete-placeholder", "moving-left", "moving-right", "moving-trash");
    cardFace.removeAttribute("data-task-id");
    cardFace.querySelectorAll("button").forEach(button => {
        button.tabIndex = -1;
        button.removeAttribute("data-task-action");
    });

    confirmFace.className = "card-morph-confirm";
    confirmFace.setAttribute("role", "dialog");
    confirmFace.setAttribute("aria-modal", "true");
    confirmFace.innerHTML = `
        <p class="page-index">DELETE / PERSONAL TASK</p>
        <h2>确认删除</h2>
        <p>是否将“${escapeHtml(getTaskTitle(task))}”移入回收站？之后仍可恢复。</p>
        <div class="confirm-actions">
            <button class="line-button morph-cancel" type="button">取消</button>
            <button class="line-button strong morph-confirm" type="button">确认删除</button>
        </div>
    `;

    setRectStyle(morph, sourceRect);
    morph.style.borderWidth = sourceStyle.borderTopWidth;
    morph.style.borderStyle = sourceStyle.borderTopStyle;
    morph.style.borderColor = sourceStyle.borderTopColor;
    cardFace.style.padding = sourceStyle.padding;
    morph.append(cardFace, confirmFace);
    overlay.append(morph);
    document.body.append(overlay);
    card.classList.add("delete-placeholder");

    const stopScroll = event => event.preventDefault();
    overlay.addEventListener("wheel", stopScroll, { passive: false });
    overlay.addEventListener("touchmove", stopScroll, { passive: false });

    const cancelButton = confirmFace.querySelector(".morph-cancel");
    const confirmButton = confirmFace.querySelector(".morph-confirm");
    cancelButton.addEventListener("click", cancelCardDeleteAnimation);
    confirmButton.addEventListener("click", confirmCardDeleteAnimation);

    deleteAnimationState = {
        task,
        originalCard: card,
        originalDeleteButton: deleteButton,
        overlay,
        morph,
        confirmFace,
        sourceRect,
        sourceBorderWidth: sourceStyle.borderTopWidth,
        sourceBorderStyle: sourceStyle.borderTopStyle,
        sourceListId: sourceList?.id || "",
        phase: "opening"
    };

    await nextAnimationFrame();
    const targetRect = getDeleteDialogRect();
    setRectStyle(morph, targetRect);
    morph.style.borderWidth = "3px";
    morph.style.borderStyle = "solid";
    morph.classList.add("to-confirm");
    await waitForMotion(340);

    if (!deleteAnimationState) return;
    deleteAnimationState.phase = "waiting";
    confirmButton.focus();
}

async function cancelCardDeleteAnimation() {
    const state = deleteAnimationState;
    if (!state || state.phase !== "waiting") return;
    state.phase = "cancelling";
    state.confirmFace.querySelectorAll("button").forEach(button => button.disabled = true);
    state.morph.classList.remove("to-confirm");
    setRectStyle(state.morph, state.sourceRect);
    state.morph.style.borderWidth = state.sourceBorderWidth;
    state.morph.style.borderStyle = state.sourceBorderStyle;
    await waitForMotion(340);

    state.originalCard.classList.remove("delete-placeholder");
    state.overlay.remove();
    deleteAnimationState = null;
    state.originalDeleteButton?.focus();
}

async function confirmCardDeleteAnimation() {
    const state = deleteAnimationState;
    if (!state || state.phase !== "waiting") return;
    state.phase = "confirming";
    state.confirmFace.querySelectorAll("button").forEach(button => button.disabled = true);

    const boardLayout = captureBoardLayout(state.task.id);
    const currentRect = state.morph.getBoundingClientRect();

    state.morph.classList.add("collapsing", "as-line");
    state.morph.style.top = `${currentRect.top + currentRect.height / 2 - 1.5}px`;
    state.morph.style.height = "3px";
    await waitForMotion(200);

    const trashButton = document.getElementById("open-trash");
    const trashRect = trashButton.getBoundingClientRect();
    state.morph.classList.add("flying");
    state.morph.style.left = `${trashRect.left}px`;
    state.morph.style.top = `${trashRect.top + trashRect.height / 2 - 1.5}px`;
    state.morph.style.width = `${trashRect.width}px`;
    state.morph.style.height = "3px";
    await waitForMotion(300);

    trashButton.classList.add("trash-receive");
    state.task.deleted_at = new Date().toISOString();
    saveTasks();
    state.overlay.remove();
    deleteAnimationState = null;
    renderBoardPreservingLayout(boardLayout);
    animateBoardReflow(boardLayout);
    window.setTimeout(endStableBoardRender, getMotionDuration(300));
    window.setTimeout(() => trashButton.classList.remove("trash-receive"), getMotionDuration(180));
}

function cleanupCardDeleteAnimation(restoreCard) {
    const state = deleteAnimationState;
    if (!state) return;
    if (restoreCard) state.originalCard?.classList.remove("delete-placeholder");
    state.overlay?.remove();
    deleteAnimationState = null;
}

function getDeleteDialogRect() {
    const width = Math.min(560, window.innerWidth - 48);
    const height = Math.min(320, window.innerHeight - 48);
    return {
        left: (window.innerWidth - width) / 2,
        top: (window.innerHeight - height) / 2,
        width,
        height
    };
}

function setRectStyle(element, rect) {
    element.style.left = `${rect.left}px`;
    element.style.top = `${rect.top}px`;
    element.style.width = `${rect.width}px`;
    element.style.height = `${rect.height}px`;
}

function captureBoardLayout(excludedTaskId = "") {
    const positions = new Map();
    const scrollTops = {};

    BOARD_LIST_IDS.forEach(listId => {
        const list = document.getElementById(listId);
        if (!list) return;
        scrollTops[listId] = list.scrollTop;
        list.querySelectorAll(".task-card[data-task-id]").forEach(card => {
            if (card.dataset.taskId === excludedTaskId) return;
            const rect = card.getBoundingClientRect();
            positions.set(card.dataset.taskId, { left: rect.left, top: rect.top });
        });
    });

    return { positions, scrollTops };
}

function renderBoardPreservingLayout(layout) {
    document.body.classList.add("stable-board-render");
    renderBoard();
    document.querySelectorAll(".card-list .task-card").forEach(card => {
        card.classList.add("skip-card-entry");
    });
    BOARD_LIST_IDS.forEach(listId => {
        const list = document.getElementById(listId);
        if (!list) return;
        const previousScrollTop = layout.scrollTops[listId] || 0;
        list.scrollTop = Math.min(previousScrollTop, Math.max(0, list.scrollHeight - list.clientHeight));
    });
}

function animateBoardReflow(layout, excludedTaskId = "") {
    const movingCards = [];

    BOARD_LIST_IDS.forEach(listId => {
        const list = document.getElementById(listId);
        if (!list) return;
        list.querySelectorAll(".task-card[data-task-id]").forEach(card => {
            if (card.dataset.taskId === excludedTaskId) return;
            const before = layout.positions.get(card.dataset.taskId);
            if (!before) return;
            const after = card.getBoundingClientRect();
            const deltaX = before.left - after.left;
            const deltaY = before.top - after.top;
            if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) return;
            card.style.animation = "none";
            card.style.transition = "none";
            card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            movingCards.push(card);
        });
    });

    if (!movingCards.length) return;
    document.body.getBoundingClientRect();
    requestAnimationFrame(() => {
        movingCards.forEach(card => {
            card.classList.add("reflow-card");
            card.style.transform = "translate(0, 0)";
        });
    });
    window.setTimeout(() => {
        movingCards.forEach(card => {
            card.classList.remove("reflow-card");
            card.style.removeProperty("animation");
            card.style.removeProperty("transition");
            card.style.removeProperty("transform");
        });
    }, getMotionDuration(300));
}

function endStableBoardRender() {
    document.body.classList.remove("stable-board-render");
}

async function startTaskTransfer(task, action, card) {
    const originalStatus = task.status;
    const sourceRect = card.getBoundingClientRect();
    const sourceStyle = getComputedStyle(card);
    const boardLayout = captureBoardLayout(task.id);
    const overlay = document.createElement("div");
    const morph = document.createElement("div");
    const cardFace = createTransferCardFace(card);

    overlay.className = "card-morph-overlay task-transfer-overlay";
    morph.className = "card-morph-window task-transfer-window";
    setRectStyle(morph, sourceRect);
    morph.style.borderWidth = sourceStyle.borderTopWidth;
    morph.style.borderStyle = sourceStyle.borderTopStyle;
    morph.style.borderColor = sourceStyle.borderTopColor;
    cardFace.style.padding = sourceStyle.padding;
    morph.append(cardFace);
    overlay.append(morph);
    document.body.append(overlay);
    card.classList.add("transfer-placeholder");

    const stopScroll = event => event.preventDefault();
    overlay.addEventListener("wheel", stopScroll, { passive: false });
    overlay.addEventListener("touchmove", stopScroll, { passive: false });

    taskTransferState = {
        task,
        originalStatus,
        originalCard: card,
        overlay,
        morph,
        boardLayout,
        statusChanged: false
    };

    await nextAnimationFrame();
    morph.classList.add("transfer-collapsing", "as-line");
    morph.style.top = `${sourceRect.top + sourceRect.height / 2 - 1.5}px`;
    morph.style.height = "3px";
    await waitForMotion(200);

    task.status = action === "complete" ? "done" : "pending";
    taskTransferState.statusChanged = true;
    saveTasks();
    renderBoardPreservingLayout(boardLayout);

    const destinationCard = findBoardCard(task.id);
    if (!destinationCard) throw new Error("未找到任务的目标卡片");
    destinationCard.classList.add("transfer-destination");
    taskTransferState.destinationCard = destinationCard;
    animateBoardReflow(boardLayout, task.id);

    const destinationStyle = getComputedStyle(destinationCard);
    const targetRect = getVisibleCardRect(destinationCard);
    const targetFace = createTransferCardFace(destinationCard);
    targetFace.style.padding = destinationStyle.padding;
    morph.replaceChildren(targetFace);
    morph.classList.remove("transfer-collapsing");
    morph.classList.add("transfer-flying");
    morph.style.left = `${targetRect.left}px`;
    morph.style.top = `${targetRect.top + targetRect.height / 2 - 1.5}px`;
    morph.style.width = `${targetRect.width}px`;
    morph.style.height = "3px";
    await waitForMotion(300);

    morph.classList.remove("transfer-flying", "as-line");
    morph.classList.add("transfer-expanding");
    morph.style.borderWidth = destinationStyle.borderTopWidth;
    morph.style.borderStyle = destinationStyle.borderTopStyle;
    setRectStyle(morph, targetRect);
    await waitForMotion(320);

    destinationCard.classList.remove("transfer-destination");
    overlay.remove();
    taskTransferState = null;
    endStableBoardRender();
}

function createTransferCardFace(card) {
    const face = card.cloneNode(true);
    face.classList.add("card-morph-face");
    face.classList.remove("delete-placeholder", "transfer-placeholder", "transfer-destination", "moving-left", "moving-right", "moving-trash");
    face.removeAttribute("data-task-id");
    face.querySelectorAll("button").forEach(button => {
        button.tabIndex = -1;
        button.removeAttribute("data-task-action");
    });
    return face;
}

function findBoardCard(taskId) {
    return [...document.querySelectorAll(".card-list .task-card[data-task-id]")]
        .find(card => card.dataset.taskId === taskId) || null;
}

function getVisibleCardRect(card) {
    const rect = card.getBoundingClientRect();
    const list = card.closest(".card-list");
    if (!list) return rect;
    const listRect = list.getBoundingClientRect();
    const visibleHeight = Math.min(rect.height, listRect.height);
    const top = Math.min(Math.max(rect.top, listRect.top), listRect.bottom - visibleHeight);
    return { left: rect.left, top, width: rect.width, height: rect.height };
}

function cleanupTaskTransfer(revertStatus) {
    const state = taskTransferState;
    if (!state) return;
    if (revertStatus && state.statusChanged) {
        state.task.status = state.originalStatus;
        saveTasks();
        renderBoardPreservingLayout(state.boardLayout);
        animateBoardReflow(state.boardLayout);
    } else {
        state.originalCard?.classList.remove("transfer-placeholder");
        state.destinationCard?.classList.remove("transfer-destination");
    }
    state.overlay?.remove();
    taskTransferState = null;
    window.setTimeout(endStableBoardRender, getMotionDuration(300));
}

function nextAnimationFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function getMotionDuration(duration) {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : duration;
}

function waitForMotion(duration) {
    return new Promise(resolve => window.setTimeout(resolve, getMotionDuration(duration)));
}

function restoreTask(taskId, card) {
    const task = tasks.find(item => item.id === taskId && item.deleted_at);
    if (!task) return;
    card?.classList.add("moving-left");
    window.setTimeout(() => {
        delete task.deleted_at;
        saveTasks();
        renderBoard();
    }, card ? 220 : 0);
}

function requestPermanentDelete(taskId) {
    const task = tasks.find(item => item.id === taskId && item.deleted_at);
    if (!task) return;
    openConfirmation({
        title: "永久删除",
        message: `永久删除“${getTaskTitle(task)}”后无法恢复。`,
        confirmLabel: "永久删除",
        onConfirm: () => {
            tasks = tasks.filter(item => item.id !== taskId);
            saveTasks();
            renderBoard();
        }
    });
}

function requestClearTrash() {
    const deletedCount = tasks.filter(task => task.deleted_at).length;
    if (!deletedCount) return;
    openConfirmation({
        title: "清空回收站",
        message: `将永久删除回收站中的 ${deletedCount} 个任务，此操作无法恢复。`,
        confirmLabel: "确认清空",
        onConfirm: () => {
            tasks = tasks.filter(task => !task.deleted_at);
            saveTasks();
            renderBoard();
        }
    });
}

function openConfirmation({ title, message, confirmLabel, onConfirm }) {
    const modal = document.getElementById("confirm-modal");
    lastFocusedElement = document.activeElement;
    pendingConfirmation = onConfirm;
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-message").textContent = message;
    document.getElementById("modal-confirm").textContent = confirmLabel;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    document.getElementById("modal-cancel").focus();
}

function closeConfirmation() {
    document.getElementById("confirm-modal").hidden = true;
    document.body.classList.remove("modal-open");
    pendingConfirmation = null;
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    lastFocusedElement = null;
}

function confirmPendingAction() {
    const action = pendingConfirmation;
    document.getElementById("confirm-modal").hidden = true;
    document.body.classList.remove("modal-open");
    pendingConfirmation = null;
    lastFocusedElement = null;
    if (typeof action === "function") action();
}

function getTaskTitle(task) {
    return task.kind === "project"
        ? task.name || task.project_name || task.content || "未命名项目"
        : task.content || "未命名作业";
}

async function runAI() {
    const input = document.getElementById("ai-input").value.trim();
    if (!input) {
        showStatus("请先粘贴完整课程通知。", "error");
        return;
    }

    showStatus("AI 正在拆解课程信息……", "loading");

    try {
        if (window.location.protocol === "file:") {
            throw new Error("本地文件模式不提供 AI 代理，请部署到 Vercel 后使用 AI 解析。 ");
        }

        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ input })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.error || `API 请求失败（HTTP ${response.status}）`);
        }

        if (!payload.data || typeof payload.data !== "object") {
            throw new Error("API 未返回可解析内容。 ");
        }

        populateForm(normalizeAIData(payload.data));
        showStatus("识别完成，已填入左侧表单。请检查后生成预览。", "success");
    } catch (error) {
        console.error("AI 解析失败：", error);
        showStatus(`AI 解析失败：${error.message}`, "error");
    }
}

function normalizeAIData(data) {
    const legacyImportance = ["professional", "semi", "easy"].includes(data.importance) ? data.importance : null;
    const courseType = normalizeEnum(data.course_type || legacyImportance, Object.keys(COURSE_TYPE_LABELS), "other");
    const importance = normalizeEnum(data.importance, Object.keys(IMPORTANCE_LABELS), "medium");
    const homework = normalizeTaskArray(data.homework, "homework");
    const projects = normalizeTaskArray(data.projects, "project");
    const examSource = data.exam && typeof data.exam === "object" ? data.exam : {};
    const examItems = examSource.items && typeof examSource.items === "object" ? examSource.items : {};

    return {
        course_name: typeof data.course_name === "string" ? data.course_name : "",
        course_type: courseType,
        importance,
        homework,
        projects,
        exam: {
            has_exam: Boolean(examSource.has_exam),
            items: Object.fromEntries(Object.keys(EXAM_ITEM_LABELS).map(key => [key, Boolean(examItems[key])]))
        }
    };
}

function normalizeTaskArray(value, kind) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values.map(item => {
        if (typeof item === "string") {
            return kind === "project"
                ? { kind, name: item, requirements: "", submission_method: "", ddl: null }
                : { kind, content: item, ddl: null };
        }
        if (!item || typeof item !== "object") return null;
        if (kind === "project") {
            const explicitName = item.name || item.project_name || item.title || "";
            return {
                kind,
                name: explicitName || item.content || "",
                requirements: item.requirements || (explicitName ? item.content : "") || "",
                submission_method: item.submission_method || item.format || "",
                ddl: isISODate(item.ddl) ? item.ddl : null
            };
        }
        return {
            kind,
            content: typeof item.content === "string" ? item.content : "",
            ddl: isISODate(item.ddl) ? item.ddl : null
        };
    }).filter(item => item && (kind === "project" ? item.name : item.content));
}

function populateForm(data) {
    document.getElementById("course-name").value = data.course_name;
    document.getElementById("course-type").value = data.course_type;
    document.getElementById("importance").value = data.importance;

    document.getElementById("homework-list").innerHTML = "";
    document.getElementById("project-list").innerHTML = "";
    data.homework.forEach(item => addTaskRow("homework", item));
    data.projects.forEach(item => addTaskRow("project", item));
    if (!data.homework.length) addTaskRow("homework");

    document.getElementById("has-exam").checked = data.exam.has_exam;
    toggleExamItems();
    document.querySelectorAll("[data-exam-item]").forEach(input => {
        input.checked = data.exam.has_exam && Boolean(data.exam.items[input.dataset.examItem]);
    });
}

function resetForm() {
    document.getElementById("course-name").value = "";
    document.getElementById("course-type").value = "professional";
    document.getElementById("importance").value = "medium";
    document.getElementById("ai-input").value = "";
    document.getElementById("homework-list").innerHTML = "";
    document.getElementById("project-list").innerHTML = "";
    addTaskRow("homework");
    document.getElementById("has-exam").checked = false;
    toggleExamItems();
    showStatus("", "");
}

function showPage(pageId) {
    document.querySelectorAll(".page").forEach(page => page.classList.toggle("active", page.id === pageId));
    window.scrollTo({ top: 0, behavior: "auto" });
}

function showStatus(message, type) {
    const status = document.getElementById("ai-status");
    status.className = `status-box ${type || ""}`.trim();
    status.textContent = message;
}

function loadTasks() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(stored)
            ? stored.map(normalizeStoredTask).filter(Boolean)
            : [];
    } catch (error) {
        console.error("本地任务读取失败：", error);
        return [];
    }
}

function normalizeStoredTask(task) {
    if (!task || !task.id) return null;
    if (task.kind !== "project") return task.content ? task : null;

    const name = task.name || task.project_name || task.content || "";
    if (!name) return null;
    return {
        ...task,
        name,
        requirements: typeof task.requirements === "string"
            ? task.requirements
            : (task.name ? task.content : "") || "",
        submission_method: task.submission_method || task.format || ""
    };
}

function saveTasks() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
        console.error("本地任务保存失败：", error);
    }
}

function createId() {
    return typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function isOverdue(ddl) {
    return isISODate(ddl) && ddl < getLocalDateString();
}

function isISODate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeEnum(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
    return escapeHtml(value);
}
