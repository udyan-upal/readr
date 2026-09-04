import type { Hono } from 'hono'
import { AbstractController } from '@/utils/abstracts'
import { injectable } from '@/utils/decorators'

@injectable()
export class HealthController extends AbstractController {
	register(app: Hono): void {
		app.get('/health', (c) => c.json({ status: 'ok' }))
	}
}
