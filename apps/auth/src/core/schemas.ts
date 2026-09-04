/** JWE token payload: arbitrary JWT claims. */
export type Claims = Record<string, unknown>

/** Verification options for stateless token verification. */
export type VerifyOptions = { issuer: string; audience: string }
