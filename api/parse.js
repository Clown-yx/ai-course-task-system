const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const MAX_INPUT_LENGTH = 12000;

async function handler(request, response) {
    if (request.method !== "POST") {
        response.setHeader("Allow", "POST");
        return response.status(405).json({ error: "仅支持 POST 请求。" });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        return response.status(503).json({ error: "服务端尚未配置 DeepSeek API Key。" });
    }

    let body;
    try {
        body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    } catch (error) {
        return response.status(400).json({ error: "请求体不是有效 JSON。" });
    }

    const input = typeof body?.input === "string" ? body.input.trim() : "";
    if (!input) {
        return response.status(400).json({ error: "课程通知不能为空。" });
    }
    if (input.length > MAX_INPUT_LENGTH) {
        return response.status(413).json({ error: `课程通知不能超过 ${MAX_INPUT_LENGTH} 个字符。` });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
        const upstreamResponse = await fetch(DEEPSEEK_API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
                messages: [{ role: "user", content: createPrompt(input) }],
                temperature: 0.1,
                response_format: { type: "json_object" }
            }),
            signal: controller.signal
        });

        const payload = await upstreamResponse.json().catch(() => ({}));
        if (!upstreamResponse.ok) {
            console.error("DeepSeek API error:", upstreamResponse.status, payload?.error?.message || "unknown");
            return response.status(502).json({ error: "AI 服务暂时不可用，请稍后重试。" });
        }

        const resultText = payload?.choices?.[0]?.message?.content;
        if (typeof resultText !== "string" || !resultText.trim()) {
            return response.status(502).json({ error: "AI 未返回可解析内容。" });
        }

        let data;
        try {
            data = JSON.parse(stripJsonFence(resultText));
        } catch (error) {
            console.error("DeepSeek JSON parse error:", error);
            return response.status(502).json({ error: "AI 返回的数据格式无效，请重试。" });
        }

        return response.status(200).json({ data });
    } catch (error) {
        if (error.name === "AbortError") {
            return response.status(504).json({ error: "AI 请求超时，请稍后重试。" });
        }
        console.error("AI proxy error:", error);
        return response.status(502).json({ error: "无法连接 AI 服务，请稍后重试。" });
    } finally {
        clearTimeout(timeoutId);
    }
};

function createPrompt(input) {
    const { currentDate, currentYear } = getShanghaiDateContext();

    return `You are a university course information extraction system.
Return ONLY valid JSON without Markdown fences.

Current date in Asia/Shanghai: ${currentDate}
Current year in Asia/Shanghai: ${currentYear}

Date rules:
- Resolve relative date expressions using the current date above.
- If a date contains a month and day but no year, use ${currentYear}.
- If the input explicitly contains a year, preserve that year.
- Use null when a deadline cannot be determined. Never invent a date.

Schema:
{
  "course_name": "string",
  "course_type": "professional | general | elective | other",
  "importance": "high | medium | low",
  "homework": [{ "content": "string", "ddl": "YYYY-MM-DD or null" }],
  "projects": [{
    "name": "string",
    "requirements": "string",
    "submission_method": "云盘链接 | SPOC | 邮箱地址 | other string",
    "ddl": "YYYY-MM-DD or null"
  }],
  "exam": {
    "has_exam": true,
    "items": {
      "class_questions": false,
      "ppt_examples": false,
      "homework": false,
      "past_exam": false,
      "new_questions": false
    }
  }
}

Do not invent tasks.
Input:
${input}`;
}

function getShanghaiDateContext(now = new Date()) {
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
        throw new TypeError("now must be a valid Date");
    }

    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));

    return {
        currentDate: `${values.year}-${values.month}-${values.day}`,
        currentYear: values.year
    };
}

function stripJsonFence(value) {
    return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

module.exports = handler;
module.exports.createPrompt = createPrompt;
module.exports.getShanghaiDateContext = getShanghaiDateContext;
