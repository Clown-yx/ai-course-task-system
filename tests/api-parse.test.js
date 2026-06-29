const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const handler = require("../api/parse.js");
const { createPrompt, getShanghaiDateContext } = handler;
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

test("rejects input over the length limit", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const response = createResponse();
    await handler({ method: "POST", body: { input: "x".repeat(12001) } }, response);
    assert.equal(response.statusCode, 413);
});

test("rejects malformed request JSON", async () => {
    process.env.DEEPSEEK_API_KEY = "test-key";
    const response = createResponse();
    await handler({ method: "POST", body: "{" }, response);
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

test("uses Asia/Shanghai across the UTC year boundary", () => {
    assert.deepEqual(
        getShanghaiDateContext(new Date("2026-12-31T15:59:59Z")),
        { currentDate: "2026-12-31", currentYear: "2026" }
    );
    assert.deepEqual(
        getShanghaiDateContext(new Date("2026-12-31T16:00:00Z")),
        { currentDate: "2027-01-01", currentYear: "2027" }
    );
});

test("prompt defines missing-year and explicit-year rules", () => {
    const prompt = createPrompt("12月31日交作业，另一项在2028年1月2日提交");
    const currentYear = getShanghaiDateContext().currentYear;

    assert.match(prompt, /Current date in Asia\/Shanghai: \d{4}-\d{2}-\d{2}/);
    assert.ok(prompt.includes(`If a date contains a month and day but no year, use ${currentYear}.`));
    assert.match(prompt, /If the input explicitly contains a year, preserve that year\./);
    assert.doesNotMatch(prompt, /default year is 2026/i);
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
