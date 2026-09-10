import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  fs.readFileSync("convex/chat/bot.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

async function run({
  empty = false,
  providerError = false,
  refundError = false,
  timeout = false,
  contextError = false,
  exhausted = false,
} = {}) {
  const calls = [];
  const validator = new Proxy(() => validator, { get: () => validator });
  const bot = new Proxy({}, { get: (_, name) => name });
  const exports = {};
  const timers = new Map();
  const sandbox = {
    exports,
    process: { env: { GEMINI_API_KEY: "test-only" } },
    console: { info() {}, warn() {}, error() {} },
    AbortController,
    setTimeout(fn, ms) {
      // Keep the real heartbeat interval: cleanup must cancel it.
      const handle = setTimeout(fn, ms === 45000 ? (timeout ? 5 : 1000) : ms);
      timers.set(handle, handle);
      return handle;
    },
    clearTimeout,
    require(name) {
      if (name === "@convex-dev/agent")
        return {
          Agent: class {
            async generateText(_ctx, _scope, options) {
              assert.equal(options.maxOutputTokens, 4096);
              if (timeout)
                await new Promise((_, reject) =>
                  options.abortSignal.addEventListener(
                    "abort",
                    () => reject(new Error("aborted")),
                    { once: true },
                  ),
                );
              if (providerError) throw new Error("provider unavailable");
              return {
                text: empty ? "" : "Four. A fine number!",
                finishReason: empty ? "length" : "stop",
                usage: {},
              };
            }
          },
        };
      if (name === "@ai-sdk/google")
        return { createGoogleGenerativeAI: () => () => ({}) };
      if (name === "convex/values") return { v: validator };
      if (name === "../_generated/api")
        return { components: {}, internal: { chat: { bot } } };
      if (name === "../_generated/server")
        return {
          internalAction: (x) => x,
          internalMutation: (x) => x,
          internalQuery: (x) => x,
        };
      if (name === "../moderation/verdict")
        return { screen: (body) => ({ allow: true, body }) };
      if (name === "./botConfig")
        return {
          BOT_ID: "bot",
          BOT_HANDLE: "bot",
          BOT_NAME: "Bot",
          botRateLimiter: {
            async limit() {
              calls.push("refund");
              if (refundError) throw new Error("refund unavailable");
            },
          },
        };
      throw new Error(name);
    },
  };
  vm.runInNewContext(source, sandbox);
  try {
    const started = performance.now();
    await exports.ask.handler(
      {
        async runMutation(name, args) {
          calls.push({ name, body: args.body });
          return true;
        },
        async runQuery() {
          if (contextError) throw new Error("query failed");
          return { messages: [] };
        },
      },
      {
        conversationId: "room",
        messageId: "prompt",
        askerClerkId: "user",
        askerHandle: "user",
        exhausted,
        metered: true,
      },
    );
    assert.ok(
      performance.now() - started < 1000,
      "must cancel the 2.5-second heartbeat sleep",
    );
    assert.equal(calls.filter((c) => c.name === "finish").length, 1);
    assert.equal(calls.at(-1).name, "stopTyping");
    if (empty || providerError || timeout || contextError) {
      assert.match(calls.find((c) => c.name === "finish").body, /telegraph/);
      assert.ok(
        calls.indexOf("refund") > calls.findIndex((c) => c.name === "finish"),
      );
    } else if (exhausted) {
      assert.match(calls.find((c) => c.name === "finish").body, /rest/);
      assert.ok(!calls.includes("refund"));
    } else {
      assert.equal(
        calls.find((c) => c.name === "finish").body,
        "Four. A fine number!",
      );
      assert.ok(!calls.includes("refund"));
    }
  } finally {
    for (const timer of timers.values()) clearTimeout(timer);
  }
}
for (const scenario of [
  {},
  { empty: true },
  { providerError: true },
  { providerError: true, refundError: true },
  { timeout: true },
  { contextError: true },
  { exhausted: true },
])
  await run(scenario);
console.log(
  "Passed 7 bot success/failure/timeout/refund/quota scenarios without idle delay.",
);
