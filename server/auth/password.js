const crypto = require("node:crypto");

const HASH_NAME = "scrypt";
const KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
    N: 16384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
};

function hashPassword(password) {
    assertUsablePassword(password);

    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);

    return [
        HASH_NAME,
        SCRYPT_OPTIONS.N,
        SCRYPT_OPTIONS.r,
        SCRYPT_OPTIONS.p,
        salt.toString("base64url"),
        hash.toString("base64url")
    ].join("$");
}

function verifyPassword(password, storedHash) {
    if (typeof password !== "string" || typeof storedHash !== "string") return false;

    const parts = storedHash.split("$");
    if (parts.length !== 6 || parts[0] !== HASH_NAME) return false;

    const [, n, r, p, encodedSalt, encodedHash] = parts;
    const salt = Buffer.from(encodedSalt, "base64url");
    const expectedHash = Buffer.from(encodedHash, "base64url");
    const actualHash = crypto.scryptSync(password, salt, expectedHash.length, {
        N: Number(n),
        r: Number(r),
        p: Number(p),
        maxmem: 64 * 1024 * 1024
    });

    if (actualHash.length !== expectedHash.length) return false;
    return crypto.timingSafeEqual(actualHash, expectedHash);
}

function assertUsablePassword(password) {
    if (typeof password !== "string" || password.length < 8) {
        throw new Error("密码至少需要 8 个字符。");
    }
    if (password.length > 128) {
        throw new Error("密码不能超过 128 个字符。");
    }
}

module.exports = {
    hashPassword,
    verifyPassword,
    assertUsablePassword
};
