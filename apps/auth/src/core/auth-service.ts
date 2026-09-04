/** Facade over the configured Better Auth instance. */
export interface AuthService {
	handle(request: Request): Promise<Response>
}
