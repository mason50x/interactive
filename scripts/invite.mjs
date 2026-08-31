#!/usr/bin/env node
/**
 * Sends Clerk application invitations.
 *
 *   node scripts/invite.mjs alice@example.com bob@example.com
 *   node scripts/invite.mjs --instance prod alice@example.com
 *   node scripts/invite.mjs --list
 *   node scripts/invite.mjs --revoke inv_123
 *
 * Sign-up is restricted on both instances, so an invitation is the only way a
 * new account is created. The one thing that has to be right is `redirect_url`:
 * Clerk stamps it into the email at send time and there is no editing it
 * afterwards, so an invite carrying the wrong origin is a dead link in
 * somebody's inbox. This script derives it from the target instance rather than
 * taking it on trust — that is the entire reason it exists instead of a
 * hand-written `curl`.
 *
 * It drives the Clerk CLI rather than the Backend API directly, which is what
 * lets `--instance prod` work without a production secret key ever landing on
 * disk: the CLI resolves keys from your logged-in session.
 * Requires `clerk auth login` once (see `clerk doctor`).
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The Clerk app these instances belong to; `clerk apps list` prints it. */
const APP_ID = "app_3IeTzFGEUgQClhGLEgdxK3bkkdS";

/** Where each instance's invitations land. Must match `ACCEPT_INVITE_PATH`. */
const ACCEPT_INVITE_PATH = "/auth/accept-invite";

/**
 * The production origin, resolved rather than written down.
 *
 * This script used to carry its own copy of the domain, which made it the
 * second place a root-domain move had to land — and the one place where
 * getting it wrong is unrecoverable, because Clerk stamps `redirect_url` into
 * the email at send time. `config/domains.json` is now the only literal in the
 * repo and `PROD_SITE_URL` overrides it, so a move touches one file or one
 * variable and this follows. See `config/domains.md`.
 */
function prodOrigin() {
  if (process.env.PROD_SITE_URL) {
    return process.env.PROD_SITE_URL.replace(/\/$/, "");
  }

  const { site } = JSON.parse(
    readFileSync(join(ROOT, "config", "domains.json"), "utf8"),
  );
  return site.replace(/\/$/, "");
}

/**
 * The origin per instance. Preview deployments are not listed: they resolve
 * their own origin at runtime from `VERCEL_URL`, so invites sent from a preview
 * come back to that same preview without configuration.
 */
const ORIGINS = {
  dev: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  prod: prodOrigin(),
};

function usage(message) {
  if (message) console.error(`error: ${message}\n`);
  console.error(
    `usage: node scripts/invite.mjs [options] <email...>

  --instance dev|prod   which Clerk instance to send from (default: dev)
  --url <origin>        override the origin baked into the invitation link
  --expires <days>      invitation lifetime in days (Clerk's default: 30)
  --resend              re-invite an address that already has a pending invite
  --list                list pending invitations instead of sending
  --revoke <id>         revoke a pending invitation by id
  --dry-run             print what would be sent and exit`,
  );
  process.exit(message ? 2 : 0);
}

function parseArgs(argv) {
  const options = { instance: "dev", emails: [] };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--instance":
        options.instance = argv[++i];
        break;
      case "--url":
        options.url = argv[++i];
        break;
      case "--expires":
        options.expires = Number(argv[++i]);
        break;
      case "--revoke":
        options.revoke = argv[++i];
        break;
      case "--resend":
        options.resend = true;
        break;
      case "--list":
        options.list = true;
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "-h":
      case "--help":
        usage();
        break;
      default:
        if (arg.startsWith("-")) usage(`unknown option ${arg}`);
        options.emails.push(arg);
    }
  }

  if (!["dev", "prod"].includes(options.instance)) {
    usage(`--instance must be "dev" or "prod", got "${options.instance}"`);
  }
  if (options.expires !== undefined && !Number.isInteger(options.expires)) {
    usage("--expires must be a whole number of days");
  }
  return options;
}

/**
 * Calls the Clerk CLI. `--app` is always passed: without it the CLI resolves
 * the instance from the linked repo, and this repo has no production instance
 * recorded in its link, so `--instance prod` alone fails.
 */
async function clerk(args, instance) {
  const argv = [...args, "--app", APP_ID, "--instance", instance];

  const { code, stdout, stderr } = await new Promise((resolve, reject) => {
    // stdin must be closed, not piped: the CLI holds an inherited pipe open and
    // the call never returns. Piping stdout is what puts it in agent mode, so
    // there are no prompts to answer anyway.
    const child = spawn("clerk", argv, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (err += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout: out, stderr: err }));
  });

  if (code !== 0) {
    throw new Error(`clerk ${argv.join(" ")}\n${(stderr || stdout).trim()}`);
  }
  return stdout.trim() ? JSON.parse(stdout) : null;
}

const options = parseArgs(process.argv.slice(2));
const origin = (options.url ?? ORIGINS[options.instance]).replace(/\/$/, "");
const redirectUrl = new URL(ACCEPT_INVITE_PATH, origin).toString();

if (options.list) {
  const invitations = await clerk(
    ["api", "/invitations?status=pending&order_by=-created_at&limit=100"],
    options.instance,
  );
  const rows = Array.isArray(invitations) ? invitations : [];
  if (rows.length === 0) {
    console.log(`No pending invitations on ${options.instance}.`);
  } else {
    for (const row of rows) {
      console.log(
        `${row.id}  ${row.email_address.padEnd(32)}  expires ${
          row.expires_at ? new Date(row.expires_at).toISOString().slice(0, 10) : "—"
        }  -> ${row.url ?? row.public_metadata?.redirect_url ?? ""}`,
      );
    }
  }
  process.exit(0);
}

if (options.revoke) {
  await clerk(
    ["api", `/invitations/${options.revoke}/revoke`, "-X", "POST", "--yes"],
    options.instance,
  );
  console.log(`Revoked ${options.revoke} on ${options.instance}.`);
  process.exit(0);
}

if (options.emails.length === 0) usage("no email addresses given");

console.log(`Instance:     ${options.instance}`);
console.log(`redirect_url: ${redirectUrl}`);

if (options.instance === "prod" && origin.startsWith("http://")) {
  console.error(
    "\nRefusing to send: a production invitation would carry an insecure origin.",
  );
  process.exit(1);
}

for (const email of options.emails) {
  const body = {
    email_address: email,
    redirect_url: redirectUrl,
    notify: true,
    ...(options.expires !== undefined && { expires_in_days: options.expires }),
    ...(options.resend && { ignore_existing: true }),
  };

  if (options.dryRun) {
    console.log(`\n[dry run] POST /invitations\n${JSON.stringify(body, null, 2)}`);
    continue;
  }

  try {
    const invitation = await clerk(
      ["api", "/invitations", "-d", JSON.stringify(body), "--yes"],
      options.instance,
    );
    console.log(`  sent  ${email}  (${invitation?.id ?? "no id returned"})`);
  } catch (error) {
    // One bad address should not strand the rest of a batch.
    console.error(`  FAILED ${email}\n${error.message}`);
    process.exitCode = 1;
  }
}
