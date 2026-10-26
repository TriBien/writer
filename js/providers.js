const MAX_OUTPUT_TOKENS = 4000;

function openAIText(json) {
  const choice = json?.choices?.[0];
  const message = choice?.delta ?? choice?.message;
  return typeof message?.content === "string" ? message.content : "";
}

function geminiText(json) {
  const parts = json?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) {
    return "";
  }
  return parts.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
}

async function responseError(response) {
  let detail = "";
  let retryAfter = null;

  try {
    const body = await response.text();
    if (body) {
      try {
        const parsed = JSON.parse(body);
        detail = parsed?.error?.message || parsed?.message || body;
        const rawRetry = parsed?.retry_after ?? parsed?.error?.retry_after;
        if (rawRetry != null) {
          retryAfter = Number(rawRetry);
        }
      } catch {
        detail = body;
      }
    }
  } catch {
    detail = "";
  }

  if (!Number.isFinite(retryAfter) || retryAfter <= 0) {
    const headerRetry = Number(response.headers.get("retry-after"));
    retryAfter = Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry : null;
  }

  if (detail.length > 400) {
    detail = `${detail.slice(0, 400)}…`;
  }

  const error = new Error(detail || `The provider returned status ${response.status}.`);
  error.status = response.status;
  if (retryAfter) {
    error.retryAfter = retryAfter;
  }
  return error;
}

async function* readSSE(response, extract) {
  if (!response.ok) {
    throw await responseError(response);
  }

  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    const json = await response.json();
    if (json?.error) {
      throw new Error(json.error.message || "The provider returned an error.");
    }
    const text = extract(json);
    if (text) {
      yield text;
    }
    return;
  }

  if (!response.body) {
    throw new Error("This browser could not read the streaming response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const handleLine = (rawLine) => {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (!line.startsWith("data:")) {
      return { done: false, text: "" };
    }

    const payload = line.slice(5).trim();
    if (!payload) {
      return { done: false, text: "" };
    }
    if (payload === "[DONE]") {
      return { done: true, text: "" };
    }

    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      return { done: false, text: "" };
    }

    if (json?.error) {
      throw new Error(json.error.message || "The provider returned an error.");
    }

    return { done: false, text: extract(json) || "" };
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex = buffer.indexOf("\n");
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const result = handleLine(line);
        if (result.done) {
          return;
        }
        if (result.text) {
          yield result.text;
        }
        newlineIndex = buffer.indexOf("\n");
      }
    }

    buffer += decoder.decode();
    const tail = handleLine(buffer.trim());
    if (tail.text) {
      yield tail.text;
    }
  } finally {
    reader.releaseLock();
  }
}

function openAIRequest({ url, headers, system, user, model, signal, extraBody = {} }) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: true,
      temperature: 0.4,
      max_tokens: MAX_OUTPUT_TOKENS,
      ...extraBody,
    }),
    signal,
  });
}

export const PROVIDERS = {
  llm7: {
    id: "llm7",
    label: "LLM7",
    keyless: true,
    defaultModel: "mistral-Nemo-Instruct-2407",
    description: "Free anonymous tier. No account or API key needed, with fair-use rate limits.",
    keyUrl: "https://llm7.io/",
    keyLinkLabel: "About LLM7",
    async *stream({ system, user, model, signal }) {
      const response = await openAIRequest({
        url: "https://api.llm7.io/v1/chat/completions",
        headers: {},
        system,
        user,
        model: model || "mistral-Nemo-Instruct-2407",
        signal,
      });
      yield* readSSE(response, openAIText);
    },
  },

  pollinations: {
    id: "pollinations",
    label: "Pollinations",
    keyless: true,
    defaultModel: "gpt-oss-20b",
    description: "Free community tier with no key. One request at a time, about 30 seconds apart. Not available on localhost.",
    keyUrl: "https://pollinations.ai/",
    keyLinkLabel: "About Pollinations",
    async *stream({ system, user, model, signal }) {
      const response = await openAIRequest({
        url: "https://text.pollinations.ai/openai/chat/completions",
        headers: {},
        system,
        user,
        model: model || "gpt-oss-20b",
        signal,
        extraBody: { reasoning_effort: "low" },
      });
      yield* readSSE(response, openAIText);
    },
  },

  groq: {
    id: "groq",
    label: "Groq",
    keyless: false,
    defaultModel: "openai/gpt-oss-120b",
    description: "Fast free tier with generous daily limits.",
    keyUrl: "https://console.groq.com/keys",
    keyLinkLabel: "Get a free Groq key",
    async *stream({ system, user, model, apiKey, signal }) {
      const response = await openAIRequest({
        url: "https://api.groq.com/openai/v1/chat/completions",
        headers: { Authorization: `Bearer ${apiKey}` },
        system,
        user,
        model: model || "openai/gpt-oss-120b",
        signal,
      });
      yield* readSSE(response, openAIText);
    },
  },

  gemini: {
    id: "gemini",
    label: "Google Gemini",
    keyless: false,
    defaultModel: "gemini-3.5-flash-lite",
    description: "Google AI Studio includes a free tier for Gemini.",
    keyUrl: "https://aistudio.google.com/app/apikey",
    keyLinkLabel: "Get a free Gemini key",
    async *stream({ system, user, model, apiKey, signal }) {
      const selectedModel = model || "gemini-3.5-flash-lite";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: {
              temperature: 0.4,
              maxOutputTokens: MAX_OUTPUT_TOKENS,
            },
          }),
          signal,
        },
      );
      yield* readSSE(response, geminiText);
    },
  },

  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    keyless: false,
    defaultModel: "openrouter/free",
    description: "Routes to a currently available free model automatically.",
    keyUrl: "https://openrouter.ai/keys",
    keyLinkLabel: "Get a free OpenRouter key",
    async *stream({ system, user, model, apiKey, signal }) {
      const response = await openAIRequest({
        url: "https://openrouter.ai/api/v1/chat/completions",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-Title": "Draftwise",
        },
        system,
        user,
        model: model || "openrouter/free",
        signal,
      });
      yield* readSSE(response, openAIText);
    },
  },
};

export const PROVIDER_LIST = Object.values(PROVIDERS);
