// Injection keys for the IoC container. Symbols keep bindings decoupled
// from concrete classes (interfaces like TokenService have no runtime identity).
export const TOKENS = {
	Config: Symbol.for('EnvConfig'),
	Database: Symbol.for('Database'),
	Logger: Symbol.for('Logger'),
	Migrator: Symbol.for('Migrator'),
	TokenService: Symbol.for('TokenService'),
	AuthService: Symbol.for('AuthService'),
	BearerMiddleware: Symbol.for('BearerMiddleware'),
	Controller: Symbol.for('Controller'),
	HttpApp: Symbol.for('HttpApp'),
	HttpServer: Symbol.for('HttpServer'),
} as const
