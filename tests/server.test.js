const assert = require("node:assert/strict");
const { after, before, test } = require("node:test");

const { createServer, parsePort } = require("../server/index.js");

let server;
let baseUrl;

before(async () => {
    server = createServer({ skipBootstrap: true });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
    if (!server) return;
    await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
});

test("serves the frontend with security headers", async () => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^text\/html/);
    assert.match(response.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(html, /<title>Course AI System<\/title>/);
});

test("supports HEAD for static files", async () => {
    const response = await fetch(`${baseUrl}/app.js`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
});

test("returns 404 for files outside the public allowlist", async () => {
    const response = await fetch(`${baseUrl}/.env`);
    assert.equal(response.status, 404);
});

test("routes parse requests to the shared API handler", async () => {
    const originalApiKey = process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;

    try {
        const response = await fetch(`${baseUrl}/api/parse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ input: "大学物理作业" })
        });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: "服务端尚未配置 DeepSeek API Key。" });
    } finally {
        if (originalApiKey === undefined) {
            delete process.env.DEEPSEEK_API_KEY;
        } else {
            process.env.DEEPSEEK_API_KEY = originalApiKey;
        }
    }
});

test("validates configured ports", () => {
    assert.equal(parsePort(undefined), 8000);
    assert.equal(parsePort("0"), 0);
    assert.equal(parsePort("8123"), 8123);
    assert.throws(() => parsePort("not-a-port"), /PORT/);
    assert.throws(() => parsePort("65536"), /PORT/);
});
