import { EncryptJWT, jwtDecrypt } from 'jose'
import type { TokenService } from '@/core/token-service'

/**
 * Stateless bearer tokens: `dir` + `A256GCM` JWEs over a shared 32-byte key.
 * Consumers verify by decrypting with the same key (no session lookup, no JWKS).
 */
export class JweTokenService implements TokenService {
	constructor(private readonly key: Uint8Array) {}

	sign(payload: Record<string, unknown>): Promise<string> {
		return new EncryptJWT(payload)
			.setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
			.encrypt(this.key)
	}

	async verify(token: string, opts: { issuer: string; audience: string }) {
		const { payload } = await jwtDecrypt(token, this.key, {
			issuer: opts.issuer,
			audience: opts.audience,
		})
		return payload
	}
}
