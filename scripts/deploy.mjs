#!/usr/bin/env node
/**
 * Deploy the committed tree from the Vercel CLI, bypassing the git integration.
 *
 *   npm run deploy               production
 *   npm run deploy -- --preview  a preview URL
 *
 * The git integration on this project is blocked. `cognify` is a Hobby team and
 * the repository is private, and the Hobby plan will only build a commit whose
 * author it can match to the team owner — against the GitHub account under
 * Login Connections, or, with no account connected, against the verified
 * addresses on the Vercel account. Neither currently matches, so every
 * push-triggered deploy is created and immediately BLOCKED, with no build and
 * no log to read. See the Deployments section of the README for the account fix.
 *
 * A CLI deploy carries no commit author, so the check does not apply. This
 * exports HEAD with `git archive` rather than uploading the working directory,
 * which keeps the two honest: what ships is exactly what is committed, and
 * `.cache`, `node_modules` and `.env*` stay out because they are not tracked.
 * The build still runs on Vercel against the Production environment, so
 * `CONVEX_DEPLOY_KEY` is present and the Convex backend ships with it as usual.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dim = (text) => `\u001b[2m${text}\u001b[0m`;

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

const preview = process.argv.slice(2).includes("--preview");
const target = preview ? "preview" : "production";

const head = git("rev-parse", "--short", "HEAD");
const subject = git("log", "-1", "--format=%s");

if (git("status", "--porcelain")) {
  console.log(
    dim(
      "Working tree is dirty. This deploys HEAD, so uncommitted changes stay behind.",
    ),
  );
}

console.log(`Deploying ${head} to ${target}  ${dim(subject)}`);

const dir = mkdtempSync(join(tmpdir(), "deploy-"));

try {
  // git archive writes tracked files only, at HEAD, with no .git directory —
  // so the upload carries no commit author for Vercel to reject.
  execFileSync("sh", ["-c", `git archive HEAD | tar -x -C '${dir}'`]);

  // The project link is untracked, so it has to be carried across by hand.
  mkdirSync(join(dir, ".vercel"), { recursive: true });
  cpSync(".vercel/project.json", join(dir, ".vercel/project.json"));

  // The link names the team but does not select it. Outside the repository the
  // CLI falls back to whatever scope is current, and deploying into the wrong
  // one fails as `Not authorized` rather than as anything about scope.
  const { orgId } = JSON.parse(readFileSync(".vercel/project.json", "utf8"));

  const args = ["deploy", "--scope", orgId, ...(preview ? [] : ["--prod"])];
  const { status } = spawnSync("vercel", args, { cwd: dir, stdio: "inherit" });

  if (status !== 0) process.exit(status ?? 1);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
