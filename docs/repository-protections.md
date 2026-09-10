# Repository protections

The repository uses two separate main-branch rulesets:

- **Main integrity**: PRs, passing CI, resolved conversations, linear history,
  no force pushes, and no deletion for contributors without an administrator bypass.
- **Maintainer review**: one approval from a code owner, dismiss stale approvals,
  and require approval of the latest reviewable push.

Repository administrators can bypass both main-branch rulesets to push or merge
directly into `main`, without a PR, approval, or waiting for CI. Other contributors
must use the protected PR workflow. CI still runs after administrator pushes.

`CODEOWNERS` covers every tracked path, explicitly including itself, README,
license, workflows, environment examples, and deployment configuration.
Required checks use the CI job names: `Lint`, `Typecheck`, `Tests`, `Build`,
`Experience`, `Dependencies`, and `Secrets`. Checks must pass on an up-to-date PR
unless a repository administrator uses the bypass.
Release tags matching `v*` cannot be force-updated or deleted.

Actions uses a read-only token by default, cannot approve PRs, and requires
approval for all outside-contributor workflows. Actions are SHA-pinned; only
GitHub-owned Actions are allowed. Dependabot vulnerability alerts and grouped security-fix PRs remain enabled.
Routine version-bump PRs are disabled for both npm packages and GitHub Actions. Secret scanning, push protection, dependency alerts,
private vulnerability reporting, and CodeQL are configured in GitHub settings.

Production GitHub environments restrict deployment branches to `main` and
require the repository owner to review jobs. Self-review is allowed because
there is one maintainer. These settings do not govern deployments performed
directly by Vercel or its CLI; see `deployment.md`.

Do not add deployment secrets to the repository CI. Do not use
`pull_request_target` to execute contributor code. Review workflow and dependency
changes before approving an outside-contributor run.
