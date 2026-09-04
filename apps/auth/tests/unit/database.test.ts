import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Database } from '@/db/database'

describe('database', () => {
	it('enables foreign keys and skips WAL for :memory:', () => {
		const database = new Database(':memory:')

		expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
		expect(database.sqlite.pragma('journal_mode', { simple: true })).toBe('memory')
		expect(() => database.close()).not.toThrow()
	})

	it('creates parent directories and enables WAL for file databases', () => {
		const tmp = mkdtempSync(join(tmpdir(), 'auth-db-'))
		try {
			const path = join(tmp, 'nested', 'dir', 'auth.db')
			const database = new Database(path)

			expect(existsSync(join(tmp, 'nested', 'dir'))).toBe(true)
			expect(database.sqlite.pragma('journal_mode', { simple: true })).toBe('wal')
			expect(database.sqlite.pragma('foreign_keys', { simple: true })).toBe(1)
			database.close()
		} finally {
			rmSync(tmp, { recursive: true, force: true })
		}
	})
})
