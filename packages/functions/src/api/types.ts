export interface AuthClaims {
  sub: string;
  email?: string;
  /** The raw JWT — echoed to the realtime client config. */
  token: string;
}

/** Hono environment: variables set by the auth middleware. */
export type AppEnv = {
  Variables: {
    auth?: AuthClaims;
  };
};
