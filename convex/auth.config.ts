export default {
  providers: [
    {
      // Convex evaluates this deployment manifest before runtime environment variables are
      // available in some manual deploy paths. Production must still fail toward the production
      // Clerk issuer, never the development instance.
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN ?? "https://clerk.your-project.example",
      applicationID: "convex",
    },
  ],
};
