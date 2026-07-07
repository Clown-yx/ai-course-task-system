const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_NODE_MAJOR = 20;

function main() {
    loadEnvFile(".env.local");

    const env = process.env;
    const warnings = [];
    const errors = [];

    checkNodeVersion(errors);
    checkSecret("INITIAL_PASSWORD", env.INITIAL_PASSWORD, errors);
    checkOptionalSecret("DEEPSEEK_API_KEY", env.DEEPSEEK_API_KEY, warnings);
    checkAccounts(env, errors);
    checkDatabasePath(env.DATABASE_PATH, warnings, errors);
    checkHost(env.HOST, warnings);
    checkRoster(env.PILOT_ROSTER_PATH, errors);

    printResult({ warnings, errors });

    if (errors.length > 0) {
        process.exitCode = 1;
    }
}

function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const index = trimmed.indexOf("=");
        if (index === -1) continue;
        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim();
        if (key && process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}

function checkNodeVersion(errors) {
    const major = Number(process.versions.node.split(".")[0]);
    if (!Number.isInteger(major) || major < REQUIRED_NODE_MAJOR) {
        errors.push(`Node.js 版本过低：当前 ${process.versions.node}，需要 ${REQUIRED_NODE_MAJOR}.6 或更高。`);
    }
}

function checkSecret(name, value, errors) {
    if (!value || !value.trim()) {
        errors.push(`缺少 ${name}。`);
    }
}

function checkOptionalSecret(name, value, warnings) {
    if (!value || !value.trim()) {
        warnings.push(`未配置 ${name}：手动录入可用，AI 解析将不可用。`);
    }
}

function checkAccounts(env, errors) {
    const hasOwner = Boolean(env.PILOT_OWNER_STUDENT_ID && env.PILOT_OWNER_DISPLAY_NAME);
    const hasRoster = Boolean(env.PILOT_ROSTER_PATH);

    if (!hasOwner && !hasRoster) {
        errors.push("缺少内测账号来源：请配置 PILOT_OWNER_STUDENT_ID/PILOT_OWNER_DISPLAY_NAME 或 PILOT_ROSTER_PATH。");
    }
}

function checkDatabasePath(databasePath, warnings, errors) {
    const value = databasePath || "data/app.sqlite";
    const normalized = value.replaceAll("\\", "/");

    if (value === ":memory:") {
        errors.push("内测不能使用 DATABASE_PATH=:memory:，否则重启后数据会丢失。");
        return;
    }

    if (!normalized.startsWith("data/")) {
        warnings.push("DATABASE_PATH 不在 data/ 下，请确认该数据库文件不会进入 Git。");
    }
}

function checkHost(host, warnings) {
    const value = host || "127.0.0.1";
    if (value === "0.0.0.0") {
        warnings.push("HOST=0.0.0.0 会暴露到局域网；只允许在受控热点或私人路由下使用。");
    }
    if (value !== "127.0.0.1" && value !== "0.0.0.0") {
        warnings.push(`HOST=${value} 不是常用内测配置，请确认手机能访问该地址。`);
    }
}

function checkRoster(rosterPath, errors) {
    if (!rosterPath) return;

    const absolutePath = path.resolve(rosterPath);
    if (!fs.existsSync(absolutePath)) {
        errors.push(`PILOT_ROSTER_PATH 指向的文件不存在：${rosterPath}`);
        return;
    }

    let users;
    try {
        users = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    } catch (error) {
        errors.push(`PILOT_ROSTER_PATH 不是合法 JSON：${error.message}`);
        return;
    }

    if (!Array.isArray(users)) {
        errors.push("PILOT_ROSTER_PATH 必须是用户数组 JSON。");
        return;
    }

    if (users.length === 0) {
        errors.push("PILOT_ROSTER_PATH 用户数组不能为空。");
        return;
    }

    if (users.length > 5) {
        errors.push(`当前阶段只允许 5 人以内内测，roster 中有 ${users.length} 人。`);
    }

    users.forEach((user, index) => {
        const studentId = user.studentId || user.student_id;
        const displayName = user.displayName || user.display_name;
        if (!studentId || !displayName) {
            errors.push(`roster 第 ${index + 1} 项缺少 studentId/displayName。`);
        }
    });
}

function printResult({ warnings, errors }) {
    console.log("内测配置自检结果");
    console.log(`错误：${errors.length}`);
    console.log(`警告：${warnings.length}`);

    if (errors.length) {
        console.log("");
        console.log("错误项：");
        errors.forEach(error => console.log(`- ${error}`));
    }

    if (warnings.length) {
        console.log("");
        console.log("警告项：");
        warnings.forEach(warning => console.log(`- ${warning}`));
    }

    if (!errors.length) {
        console.log("");
        console.log("配置可以用于本地内测。不要提交 .env.local、数据库、roster 或会话数据。");
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    checkRoster,
    loadEnvFile,
    main
};
