import "server-only";
import { createHash, randomBytes, createPublicKey, verify as verifySignature } from "crypto";

/**
 * Google sign-in (OpenID Connect) — Phase 8.
 *
 * Authorization code flow with **PKCE** and a **state** value, both kept in a
 * short-lived httpOnly cookie, so a code intercepted on its way back is
 * useless without the verifier and a login cannot be started from another
 * site. The `id_token` is verified here rather than trusted: signature against
 * Google's JWKS, issuer, audience, expiry, and the nonce this request sent.
 *
 * Written against `fetch` and Node's crypto rather than adding an OAuth
 * dependency: the flow is one redirect and one POST, and an authentication
 * library is a supply-chain risk of its own.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type OidcStart = { url: string; state: string; verifier: string; nonce: string };

export type GoogleIdentity = {
  email: string;
  emailVerified: boolean;
  /** The Google Workspace domain, when the account belongs to one. */
  hostedDomain: string | null;
  name: string | null;
  subject: string;
};

function base64url(buffer: Buffer): string {
  return buffer.toString("base64url");
}

/** The URL to send the browser to, and the values to remember for the callback. */
export function startGoogleSignIn(
  { clientId, redirectUri }: { clientId: string; redirectUri: string },
  { hostedDomain, loginHint }: { hostedDomain?: string | null; loginHint?: string | null } = {}
): OidcStart {
  const state = base64url(randomBytes(24));
  const nonce = base64url(randomBytes(24));
  const verifier = base64url(randomBytes(48));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    // Ask Google to offer only institute accounts. It is a hint, not a
    // guarantee — the `hd` claim is checked again on the way back.
    ...(hostedDomain ? { hd: hostedDomain } : {}),
    ...(loginHint ? { login_hint: loginHint } : {}),
    prompt: "select_account",
  });
  return { url: `${AUTH_ENDPOINT}?${params.toString()}`, state, verifier, nonce };
}

type Jwk = { kid: string; n: string; e: string; alg?: string; kty: string };
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function googleKeys(): Promise<Jwk[]> {
  if (jwksCache && Date.now() - jwksCache.fetchedAt < 60 * 60_000) return jwksCache.keys;
  const response = await fetch(JWKS_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Could not read Google's signing keys (${response.status})`);
  const body = (await response.json()) as { keys: Jwk[] };
  jwksCache = { keys: body.keys, fetchedAt: Date.now() };
  return body.keys;
}

function verifyRs256(token: string, jwk: Jwk): boolean {
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  const key = createPublicKey({ key: { kty: "RSA", n: jwk.n, e: jwk.e }, format: "jwk" });
  return verifySignature(
    "RSA-SHA256",
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, "base64url")
  );
}

function decodeSegment<T>(segment: string): T {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
}

/**
 * Exchange the code and verify the identity token. Throws with a plain
 * message on anything that does not add up — the caller turns that into "sign
 * in again", never into a stack trace.
 */
export async function completeGoogleSignIn(
  { clientId, clientSecret, redirectUri }: { clientId: string; clientSecret: string; redirectUri: string },
  { code, verifier, nonce }: { code: string; verifier: string; nonce: string }
): Promise<GoogleIdentity> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Google refused the sign-in (${response.status})`);
  const token = (await response.json()) as { id_token?: string };
  if (!token.id_token) throw new Error("Google returned no identity token");

  const [headerB64, payloadB64] = token.id_token.split(".");
  const header = decodeSegment<{ kid: string; alg: string }>(headerB64);
  if (header.alg !== "RS256") throw new Error("Unexpected identity token algorithm");
  const jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk || !verifyRs256(token.id_token, jwk)) throw new Error("The identity token's signature did not verify");

  const claims = decodeSegment<{
    iss: string;
    aud: string;
    exp: number;
    nonce?: string;
    email?: string;
    email_verified?: boolean;
    hd?: string;
    name?: string;
    sub: string;
  }>(payloadB64);
  if (!ISSUERS.includes(claims.iss)) throw new Error("The identity token came from the wrong issuer");
  if (claims.aud !== clientId) throw new Error("The identity token was issued for another application");
  if (claims.exp * 1000 < Date.now()) throw new Error("The identity token has expired");
  if (claims.nonce !== nonce) throw new Error("The sign-in did not match the one that was started");
  if (!claims.email) throw new Error("Google did not return an email address");

  return {
    email: claims.email.toLowerCase(),
    emailVerified: Boolean(claims.email_verified),
    hostedDomain: claims.hd ?? null,
    name: claims.name ?? null,
    subject: claims.sub,
  };
}
