const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const handler = require("../api/parse.js");
const originalFetch = global.fetch;
const originalApiKey = process.env.DEEPSEEK_API_KEY;

afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
    } else {
        process.env.DEEPSEEK_API_KEY = originalApiKey;
    }
});

test("rejects non-POST requests", async () => {
    const response = createResponse();
    await handler({ method: "GET" }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.body.error, "仅支持 POST 请求。");
});

test("requires a server-side API key", async () => {
    delete process.env.DEEPSEEK_API_KEY;
    const response = createResponse();
    await handler({ method: "POST", body: { input: "课程通知" } }, response);
    assert.equal(response.statusCode, 503);
});

test("rejects empty input", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const response = createResponse();
    await handler({ method: "POST", body: { input: "   " } }, response);
    assert.equal(response.statusCode, 400);
});

test("returns parsed DeepSeek JSON", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    global.fetch = async () => ({
        ok: true,
        json: async () => ({
            choices: [{ message: { content: "```json\n{\"course_name\":\"大学物理\"}\n```" } }]
        })
    });
    const response = createResponse();

    await handler({ method: "POST", body: { input: "大学物理作业通知" } }, response);

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.body.data, { course_name: "大学物理" });
});

function createResponse() {
    return {
        body: null,
        headers: {},
        statusCode: 200,
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}
