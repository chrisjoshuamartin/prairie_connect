import { Amplify } from "aws-amplify";

export const googleLoginEnabled =
  process.env.NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED === "true";

export function configureAmplify() {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;
  const userPoolClientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID;
  const authDomain = process.env.NEXT_PUBLIC_AUTH_DOMAIN;

  if (!userPoolId || !userPoolClientId) {
    console.warn(
      "Cognito env vars not set. Run `sst dev` or set NEXT_PUBLIC_COGNITO_USER_POOL_ID and NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID.",
    );
    return;
  }

  // OAuth redirects only happen in the browser; the SSR pass just needs a
  // syntactically valid config.
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";

  Amplify.configure(
    {
      Auth: {
        Cognito: {
          userPoolId,
          userPoolClientId,
          loginWith: {
            email: true,
            ...(authDomain
              ? {
                  oauth: {
                    domain: authDomain,
                    scopes: ["openid", "email", "profile"],
                    redirectSignIn: [`${origin}/auth/callback`],
                    redirectSignOut: [origin],
                    responseType: "code" as const,
                  },
                }
              : {}),
          },
        },
      },
    },
    { ssr: true },
  );
}
