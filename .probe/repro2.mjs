import { chromium } from "@playwright/test";
const log = (...a) => console.log(new Date().toISOString().slice(14,23), ...a);
const secret = process.env.CLERK_SECRET_KEY;
const t = await (await fetch("https://api.clerk.com/v1/sign_in_tokens", { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ user_id: "user_3JolZRKlHAAYVVdQQXFT6HpTJLg", expires_in_seconds: 600 }) })).json();
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on("pageerror", e => log("PAGEERROR", e.message.slice(0, 300)));
page.on("console", m => { if (m.type() === "error" && !/XHR error|Failed to load|in promise/.test(m.text())) log("console.error", m.text().slice(0, 300)); });
await page.goto(`http://localhost:3000${process.env.SIGNIN || "/sign-in"}?__clerk_ticket=${t.token}`);
await page.waitForTimeout(8000);
log("after sign-in:", page.url());
await page.addInitScript(() => { addEventListener("DOMContentLoaded", () => {
  window.__log = []; const t0 = performance.now(); let last = "";
  setInterval(() => {
    const card = document.querySelector('section[aria-label$=" player"]');
    const disc = document.querySelector('button[aria-label^="Show player"]');
    const holder = [...document.querySelectorAll("iframe")].find(f => f.title === "Apple Music")?.parentElement;
    const r = card?.getBoundingClientRect();
    const s = (card ? `card(${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)}x${Math.round(r.height)}) "${card.textContent.slice(0, 50)}"` : disc ? "disc" : "none") + " | " + location.pathname + " | holder:" + (holder ? holder.style.left + "/" + holder.style.visibility : "gone");
    if (s !== last) { last = s; window.__log.push(Math.round(performance.now() - t0) + " " + s); }
  }, 10);
}); });
await page.goto("http://localhost:3000/browse/apple-music");
await page.getByRole("button", { name: "Apps" }).waitFor({ timeout: 60000 });
let inner;
for (let i = 0; i < 60 && !inner; i++) { await page.waitForTimeout(1000); inner = page.frames().find(f => f.url().includes("localhost:8788/service/")); }
log("inner:", !!inner); log("pop out button:", await page.getByRole("button", { name: "Pop out" }).count(), "popout supported:", await page.evaluate(() => "documentPictureInPicture" in window));
await page.waitForTimeout(3000);
await inner.evaluate(() => {
  const rate = 8000, seconds = 120, data = new Uint8Array(44 + rate * seconds);
  const view = new DataView(data.buffer);
  const text = (at, v) => [...v].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, 36 + rate * seconds, true); text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate, true); view.setUint16(32, 1, true);
  view.setUint16(34, 8, true); text(36, "data"); view.setUint32(40, rate * seconds, true); data.fill(128, 44);
  const audio = new Audio(URL.createObjectURL(new Blob([data], { type: "audio/wav" })));
  navigator.mediaSession.metadata = new MediaMetadata({ title: "Pink Skies", artist: "Zach Bryan" });
  navigator.mediaSession.setActionHandler("play", () => audio.play());
  navigator.mediaSession.setActionHandler("pause", () => audio.pause());
  window.__fakeAudio = audio;
  return audio.play();
});
log("fake track playing");
await page.waitForTimeout(3000);
await page.getByRole("link", { name: "Chat" }).first().click();
await page.waitForTimeout(8000);
log("url:", page.url());
console.log((await page.evaluate(() => window.__log)).join("\n"));
await page.screenshot({ path: ".probe/chat.png" });
await browser.close();
