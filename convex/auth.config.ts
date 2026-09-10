const authConfig = {
  providers: [
    {
      // Set in the Convex dashboard (Settings -> Environment Variables).
      // This is your Clerk Frontend API URL, e.g.
      // https://verb-noun-00.clerk.accounts.dev
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      // Must match the name of the JWT template in the Clerk dashboard.
      applicationID: "convex",
    },
  ],
};

export default authConfig;
