/**
 * The bot's `ask` action under every way a reply can go wrong.
 *
 * `convex-test` cannot run an action that talks to a model provider, so the
 * module is transpiled and run in a sandbox with the provider, the rate
 * limiter and the Convex runtime replaced by stubs. What is under test is
 * the control flow around the model call: every path must post exactly one
 * `finish`, end by clearing the typing indicator, refund the credit only when
 * the answer failed, and never leave the heartbeat sleep running.
 */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, test } from "vitest";

const source = ts.transpileModule(
  readFileSync(new URL("../../convex/chat/bot.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

type Scenario = {
  empty?: boolean;
  providerError?: boolean;
  refundError?: boolean;
  timeout?: boolean;
  contextError?: boolean;
  exhausted?: boolean;
};

type Call = string | { name: string; body?: string };

/** The heartbeat interval `ask` sleeps on; shortened so a test never waits. */
const HEARTBEAT_MS = 45000;

async function run({
  empty = false,
  providerError = false,
  refundError = false,
  timeout = false,
  contextError = false,
  exhausted = false,
}: Scenario = {}): Promise<{ calls: Call[]; elapsedMs: number }> {
  const calls: Call[] = [];
  const validator: unknown = new Proxy(() => validator, {
    get: () => validator,
  });
  const bot = new Proxy({}, { get: (_, name) => name });
  const exports: Record<string, { handler: (...args: unknown[]) => unknown }> =
    {};
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const sandbox = {
    exports,
    process: { env: { GEMINI_API_KEY: "test-only" } },
    console: { info() {}, warn() {}, error() {} },
    AbortController,
    setTimeout(fn: () => void, ms: number) {
      // Keep the real heartbeat interval: cleanup must cancel it.
      const handle = setTimeout(
        fn,
        ms === HEARTBEAT_MS ? (timeout ? 5 : 1000) : ms,
      );
      timers.add(handle);
      return handle;
    },
    clearTimeout,
    require(name: string) {
      if (name === "./shared") return {};
      if (name === "@convex-dev/agent")
        return {
          Agent: class {
            async generateText(
              _ctx: unknown,
              _scope: unknown,
              options: { maxOutputTokens: number; abortSignal: AbortSignal },
            ) {
              expect(options.maxOutputTokens).toBe(4096);
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
          mutation: (x: unknown) => x,
          query: (x: unknown) => x,
          internalAction: (x: unknown) => x,
          internalMutation: (x: unknown) => x,
          internalQuery: (x: unknown) => x,
        };
      if (name === "../moderation/verdict")
        return { screen: (body: string) => ({ allow: true, body }) };
      if (name === "./botConfig")
        return {
          botQuotaName: () => "botTags",
          BOT_ID: "bot",
          BOT_HANDLE: "bot",
          BOT_NAME: "Verity",
          botRateLimiter: {
            async limit() {
              calls.push("refund");
              if (refundError) throw new Error("refund unavailable");
            },
          },
        };
      throw new Error(`Unexpected import in bot.ts: ${name}`);
    },
  };
  vm.runInNewContext(source, sandbox);
  try {
    const started = performance.now();
    await exports.ask.handler(
      {
        async runMutation(name: string, args: { body?: string }) {
          calls.push({ name, body: args.body });
          return true;
        },
        async runQuery() {
          if (contextError) throw new Error("query failed");
          return { messages: [], pictures: [] };
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
    return { calls, elapsedMs: performance.now() - started };
  } finally {
    for (const timer of timers) clearTimeout(timer);
  }
}

const finishOf = (calls: Call[]) =>
  calls.find((call) => typeof call !== "string" && call.name === "finish") as
    | { name: string; body?: string }
    | undefined;

const nameOf = (call: Call | undefined) =>
  typeof call === "string" ? call : call?.name;

const failures: [string, Scenario][] = [
  ["empty answer", { empty: true }],
  ["provider error", { providerError: true }],
  ["provider error and failed refund", { providerError: true, refundError: true }],
  ["timeout", { timeout: true }],
  ["context query error", { contextError: true }],
];

test("a good answer is posted once, typing stops, and no credit is refunded", async () => {
  const { calls, elapsedMs } = await run();
  expect(elapsedMs, "must cancel the heartbeat sleep").toBeLessThan(1000);
  expect(calls.filter((c) => nameOf(c) === "finish")).toHaveLength(1);
  expect(nameOf(calls.at(-1))).toBe("stopTyping");
  expect(finishOf(calls)?.body).toBe("Four. A fine number!");
  expect(calls).not.toContain("refund");
});

test.each(failures)(
  "%s: apologises once, refunds after finishing, and stops typing",
  async (_label, scenario) => {
    const { calls, elapsedMs } = await run(scenario);
    expect(elapsedMs, "must cancel the heartbeat sleep").toBeLessThan(1000);
    expect(calls.filter((c) => nameOf(c) === "finish")).toHaveLength(1);
    expect(nameOf(calls.at(-1))).toBe("stopTyping");
    expect(finishOf(calls)?.body).toMatch(/couldn't get an answer through/);
    const finishIndex = calls.findIndex((c) => nameOf(c) === "finish");
    expect(calls.indexOf("refund")).toBeGreaterThan(finishIndex);
  },
);

test("an exhausted quota answers with the quota message and refunds nothing", async () => {
  const { calls } = await run({ exhausted: true });
  expect(calls.filter((c) => nameOf(c) === "finish")).toHaveLength(1);
  expect(nameOf(calls.at(-1))).toBe("stopTyping");
  expect(finishOf(calls)?.body).toMatch(/message me again/);
  expect(calls).not.toContain("refund");
});
