import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { channel } from "@/lib/events";

beforeEach(() => vi.stubGlobal("window", new EventTarget()));
afterEach(() => vi.unstubAllGlobals());

describe("channel", () => {
  test("a request delivers its detail to the subscriber", () => {
    const settings = channel<"settings" | "account">("test:settings");
    const handler = vi.fn();
    settings.subscribe(handler);

    settings.request("account");
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith("account");
  });

  test("structured detail arrives by reference, untouched", () => {
    const open = channel<{ groupId: string; tab: number }>("test:group");
    const detail = { groupId: "g1", tab: 2 };
    const handler = vi.fn();
    open.subscribe(handler);
    open.request(detail);
    expect(handler.mock.calls[0][0]).toBe(detail);
  });

  test("unsubscribing stops delivery without touching other subscribers", () => {
    const ping = channel<number>("test:ping");
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = ping.subscribe(first);
    ping.subscribe(second);

    ping.request(1);
    stopFirst();
    ping.request(2);

    expect(first.mock.calls).toEqual([[1]]);
    expect(second.mock.calls).toEqual([[1], [2]]);
    expect(() => stopFirst()).not.toThrow();
  });

  test("channels with different names do not hear each other", () => {
    const a = channel<string>("test:a");
    const b = channel<string>("test:b");
    const heardByB = vi.fn();
    b.subscribe(heardByB);
    a.request("hello");
    expect(heardByB).not.toHaveBeenCalled();
  });

  test("two channels on one name are the same wire", () => {
    const sender = channel<string>("test:shared");
    const receiver = channel<string>("test:shared");
    const handler = vi.fn();
    receiver.subscribe(handler);
    sender.request("x");
    expect(handler).toHaveBeenCalledWith("x");
  });

  test("a request with nobody listening is a no-op", () => {
    expect(() => channel<string>("test:silent").request("x")).not.toThrow();
  });
});
