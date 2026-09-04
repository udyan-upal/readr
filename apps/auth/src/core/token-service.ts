import type { Claims, VerifyOptions } from '@/core/schemas'

export interface TokenService {
	sign: (payload: Claims) => Promise<string>
	verify: (token: string, opts: VerifyOptions) => Promise<Claims>
}
