/** Display branding is independent of the persistent bot identity. */
export const BOT_ID = "bot";
export const BOT_HANDLE = "chat";
export const BOT_NAME = "ChatGPT";
export const BOT_AVATAR = "/chat/chatgpt-avatar.svg";

export function botWelcomeBody(name: string): string {
  return `Hi, ${name}! I'm ${BOT_NAME}. What would you like help with?`;
}

/** Present the old scripted greeting with the current assistant voice. */
export function presentBotBody(body: string, authorClerkId: string): string {
  if (authorClerkId !== BOT_ID) return body;
  const normalized = body.replace(/\s+/g, " ").trim();
  const oldPersona = /^Hello, (.+?)! I'm your bot, with a little old-fashioned charm\. Ask me a question, bring me a puzzle, or just say hello\. What's on your mind\?$/i.exec(normalized);
  if (oldPersona) return botWelcomeBody(oldPersona[1]);
  const oldWelcome = /^Hey, (.+?)\. I'm (?:Wizard|Chat|ChatGPT)\. What's on your mind\?$/i.exec(normalized);
  return oldWelcome ? botWelcomeBody(oldWelcome[1]) : body;
}

export const BOT_MENTION_HANDLES: ReadonlySet<string> = new Set([
  BOT_HANDLE,
  "chatgpt",
  "gpt",
  "bot",
  "verity",
  "wizard",
]);
