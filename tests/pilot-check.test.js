const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { loadEnvFile } = require("../server/pilot/check-config.js");

test("pilot env loader reads local key-value files without overriding existing env", () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pilot-env-"));
    const envPath = path.join(tempRoot, ".env.local");
    fs.writeFileSync(envPath, [
        "INITIAL_PASSWORD=Example-123456",
        "PILOT_OWNER_STUDENT_ID=24000000",
        "EXISTING_VALUE=from-file"
    ].join("\n"));

    const originalExistingValue = process.env.EXISTING_VALUE;
    process.env.EXISTING_VALUE = "from-process";

    try {
        loadEnvFile(envPath);
        assert.equal(process.env.INITIAL_PASSWORD, "Example-123456");
        assert.equal(process.env.PILOT_OWNER_STUDENT_ID, "24000000");
        assert.equal(process.env.EXISTING_VALUE, "from-process");
    } finally {
        delete process.env.INITIAL_PASSWORD;
        delete process.env.PILOT_OWNER_STUDENT_ID;
        if (originalExistingValue === undefined) {
            delete process.env.EXISTING_VALUE;
        } else {
            process.env.EXISTING_VALUE = originalExistingValue;
        }
    }
});
