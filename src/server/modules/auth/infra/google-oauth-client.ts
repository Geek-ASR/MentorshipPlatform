import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

export type ExchangeParams = {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
};

/** Authorization Code + PKCE token exchange (docs/07 §3.3). */
export async function exchangeGoogleCode(params: ExchangeParams): Promise<{ idToken: string }> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: params.clientId,
      client_secret: params.clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
      code_verifier: params.codeVerifier,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`);
  const body = (await response.json()) as { id_token?: string };
  if (!body.id_token) throw new Error("Google token response is missing id_token");
  return { idToken: body.id_token };
}

/** Verifies signature, issuer, audience and nonce against Google's published JWKS. */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
  expectedNonce: string,
): Promise<GoogleIdentity> {
  const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: clientId,
  });
  if (payload.nonce !== expectedNonce) throw new Error("id_token nonce mismatch");
  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("id_token is missing required claims");
  }
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}
