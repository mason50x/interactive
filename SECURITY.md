# Security policy

## Supported version

Security fixes target the current `main` branch. Older commits and independent
forks are not maintained release lines.

## Report privately

Use [GitHub private vulnerability reporting](https://github.com/mason50x/interactive/security/advisories/new).
If that channel is unavailable, contact the repository owner through the contact
link on their GitHub profile and ask for a private reporting channel. Do not post
credentials, exploit details, or personal data in public issues.

Include the affected commit, impact, minimal reproduction, and any suggested
mitigation. Use synthetic accounts and data. Do not access another person's
data, disrupt the hosted service, or test systems without authorization. This
project does not offer a paid bug bounty.

The maintainer will investigate and coordinate disclosure and a fix. Response
times depend on maintainer availability; no response-time SLA is promised.

## Contributor safeguards

- Keep secrets in ignored local files or the relevant hosting secret store.
- Rotate exposed credentials immediately, then address history and caches.
- Never approve a fork workflow without reviewing its code and workflow changes.
- Use SHA-pinned Actions, minimal token permissions, and isolated preview data.
- Do not give production credentials to PR checks or third-party Actions.
