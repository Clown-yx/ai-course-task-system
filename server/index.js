const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const parseHandler = require("../api/parse.js");
const { openDatabase } = require("./db/index.js");
const { createAuthRouter } = require("./auth/routes.js");
const { bootstrapPilotUsers } = require("./auth/bootstrap.js");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8000;
const MAX_REQUEST_SIZE = 1024 * 1024;
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PUBLIC_FILES = new Map([
    ["/", { file: "index.html", contentType: "text/html; charset=utf-8" }],
    ["/index.html", { file: "index.html", contentType: "text/html; charset=utf-8" }],
    ["/app.js", { file: "app.js", contentType: "text/javascript; charset=utf-8" }],
    ["/style.css", { file: "style.css", contentType: "text/css; charset=utf-8" }]
]);

function createServer(options = {}) {
    const db = options.db || openDatabase(options.databaseOptions);
    const bootstrapResult = options.skipBootstrap
        ? { created: 0, skipped: 0 }
        : bootstrapPilotUsers(db, options.env || process.env);
    const authRouter = createAuthRouter(db, {
        sessionTtlMs: options.sessionTtlMs,
        secureCookies: options.secureCookies
    });

    const server = http.createServer(async (request, response) => {
        setSecurityHeaders(response);

        let requestUrl;
        try {
            requestUrl = new URL(request.url, `http://${request.headers.host || DEFAULT_HOST}`);
        } catch (error) {
            sendJson(response, 400, { error: "请求地址无效。" });
            return;
        }

        if (requestUrl.pathname === "/api/parse") {
            await handleApiRequest(request, response);
            return;
        }

        if (requestUrl.pathname.startsWith("/api/auth/")) {
            await handleAuthApiRequest(request, response, requestUrl.pathname, authRouter);
            return;
        }

        await handleStaticRequest(request, response, requestUrl.pathname);
    });
    server.bootstrapResult = bootstrapResult;
    return server;
}

async function handleStaticRequest(request, response, pathname) {
    const publicFile = PUBLIC_FILES.get(pathname);
    const isSupportedMethod = request.method === "GET" || request.method === "HEAD";
    if (!publicFile || !isSupportedMethod) {
        sendText(response, 404, "Not Found");
        return;
    }

    try {
        const content = await fs.readFile(path.join(PROJECT_ROOT, publicFile.file));
        response.writeHead(200, {
            "Content-Type": publicFile.contentType,
            "Cache-Control": "no-cache"
        });
        response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
        console.error("读取静态文件失败：", error);
        sendText(response, 500, "Internal Server Error");
    }
}

async function handleApiRequest(request, response) {
    let rawBody;
    try {
        rawBody = await readRequestBody(request);
    } catch (error) {
        sendJson(response, error.statusCode || 400, { error: error.message });
        return;
    }

    let body = rawBody;
    if (rawBody) {
        try {
            body = JSON.parse(rawBody);
        } catch (error) {
            // 交给共享 API 处理器返回统一的 JSON 格式错误。
        }
    }

    await parseHandler(
        { method: request.method, body },
        createApiResponse(response)
    );
}

async function handleAuthApiRequest(request, response, pathname, authRouter) {
    let body = {};
    if (request.method !== "GET" && request.method !== "HEAD") {
        let rawBody;
        try {
            rawBody = await readRequestBody(request);
        } catch (error) {
            sendJson(response, error.statusCode || 400, { error: error.message });
            return;
        }

        if (rawBody) {
            try {
                body = JSON.parse(rawBody);
            } catch (error) {
                sendJson(response, 400, { error: "请求 JSON 格式无效。" });
                return;
            }
        }
    }

    await authRouter(request, createApiResponse(response), { pathname, body });
}

function readRequestBody(request) {
    return new Promise((resolve, reject) => {
        let size = 0;
        let rejected = false;
        const chunks = [];

        request.on("data", chunk => {
            if (rejected) return;
            size += chunk.length;
            if (size > MAX_REQUEST_SIZE) {
                rejected = true;
                const error = new Error("请求内容过大。");
                error.statusCode = 413;
                reject(error);
                return;
            }
            chunks.push(chunk);
        });

        request.on("end", () => {
            if (!rejected) resolve(Buffer.concat(chunks).toString("utf8"));
        });
        request.on("error", error => {
            if (!rejected) reject(error);
        });
    });
}

function createApiResponse(response) {
    return {
        setHeader(name, value) {
            response.setHeader(name, value);
        },
        status(statusCode) {
            response.statusCode = statusCode;
            return this;
        },
        json(payload) {
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify(payload));
            return this;
        }
    };
}

function setSecurityHeaders(response) {
    response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    );
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(response, statusCode, payload) {
    response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
    response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(message);
}

function parsePort(value) {
    if (value === undefined || value === "") return DEFAULT_PORT;
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new RangeError("PORT 必须是 0 到 65535 之间的整数。");
    }
    return port;
}

function startServer(options = {}) {
    const host = options.host ?? process.env.HOST ?? DEFAULT_HOST;
    const port = options.port ?? parsePort(process.env.PORT);
    const server = createServer(options);

    return new Promise((resolve, reject) => {
        const handleError = error => reject(error);
        server.once("error", handleError);
        server.listen(port, host, () => {
            server.off("error", handleError);
            resolve({ server, host, address: server.address() });
        });
    });
}

if (require.main === module) {
    if (!process.env.DEEPSEEK_API_KEY) {
        console.warn("未配置 DEEPSEEK_API_KEY：手动录入可用，AI 解析将返回 503。");
    }

    startServer()
        .then(({ server, host, address }) => {
            const port = typeof address === "object" ? address.port : DEFAULT_PORT;
            console.log(`本地服务已启动：http://${host}:${port}`);
            const bootstrapResult = server.bootstrapResult || { created: 0, skipped: 0 };
            if (bootstrapResult.created || bootstrapResult.skipped) {
                console.log(`内测账号导入：新增 ${bootstrapResult.created} 个，跳过 ${bootstrapResult.skipped} 个。`);
            }
            if (host === "0.0.0.0") {
                console.log("手机访问时请将 0.0.0.0 替换为开发电脑的热点 IPv4 地址。");
            }
        })
        .catch(error => {
            console.error("本地服务启动失败：", error.message);
            process.exitCode = 1;
        });
}

module.exports = {
    createServer,
    parsePort,
    startServer
};
