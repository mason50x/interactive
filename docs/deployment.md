# Deployment

## Node.js hosting

1. Configure your own Clerk application and Convex deployment as in the README.
2. Set production app variables from `docs/environment.md` on the host.
3. Deploy backend functions with `npx convex deploy` against your own project.
4. Run `npm ci`, `npm run build`, and `npm start` behind an HTTPS endpoint.
5. Configure the production Clerk webhook, redirects, and allowed origins for
   that domain. Set `NEXT_PUBLIC_SITE_URL` before generating invitations.

Clerk and optional AI providers remain external services. The source release
includes the backend functions, but is not an offline distribution of those providers.

## Vercel

Import your fork into your own Vercel account. Configure Production and Preview
separately. The included `vercel.json` runs `npx convex deploy --cmd 'npm run build'`
when `CONVEX_DEPLOY_KEY` exists, or just builds the frontend when it does not.

Keep the production deploy key scoped to Production. It also authorizes the
server-side account-sync path at runtime. Never give it to fork PR builds.
For previews, use isolated development data or a dedicated Convex preview key;
do not point unreviewed code at production services.

The maintainer's Git integration deploys `main` from `mason50x/interactive` to
Vercel project `cognify/interactive-learning`. That integration was restored on
2026-09-10. Forks must create and link their own project.

After `vercel link`, maintainers can deploy the committed tree manually:

```sh
npm run deploy
npm run deploy -- --preview
```

The script exports `HEAD` with `git archive`, copies the untracked Vercel project
link, and invokes Vercel in a temporary directory. Uncommitted changes are not
included. The deployment uses hosting-side environment variables.

## Production and PR boundaries

Repository checks do not deploy, access secrets, or request a write token.
External contributors require approval before Actions workflows run. Review
workflow changes before approval; never check out untrusted PR code in a
privileged `pull_request_target` workflow.

GitHub environment protections only cover jobs that actually use those
environments. Vercel Git deployments and authenticated CLI deploys have their
own access controls. Keep Vercel fork-deployment protection enabled and approve
previews only after reviewing the code and its access to preview credentials.

## Optional Worker and assets

See `experience/README.md` for the Worker. Set your own route in
`experience/wrangler.toml` before deployment. The app only exposes its experience
routes under `next dev`.

Hosted activity bundles belong on a separate asset origin and are not included
in this repository. Only host materials you have permission to redistribute.
See `THIRD_PARTY_NOTICES.md`; copying an upstream catalogue is not a license grant.
