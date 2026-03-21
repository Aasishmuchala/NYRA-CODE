/**
 * Mock database helper — provides a better-sqlite3-compatible API
 * using sql.js (WASM-based SQLite) so tests run on any platform
 * without native module compilation.
 */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

/**
 * Thin wrapper around sql.js that mimics the better-sqlite3 synchronous API.
 * Covers: prepare().run/get/all, exec(), close(), pragma()
 */
class BetterSqlite3Compat {
  private _db: SqlJsDatabase

  constructor(db: SqlJsDatabase) {
    this._db = db
  }

  prepare(sql: string) {
    const db = this._db
    return {
      run(...params: any[]) {
        const stmt = db.prepare(sql)
        if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
          stmt.bind(params[0])
        } else if (params.length > 0) {
          stmt.bind(params)
        }
        stmt.step()
        stmt.free()
        return { changes: db.getRowsModified(), lastInsertRowid: 0 }
      },
      get(...params: any[]) {
        const stmt = db.prepare(sql)
        if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
          stmt.bind(params[0])
        } else if (params.length > 0) {
          stmt.bind(params)
        }
        if (!stmt.step()) {
          stmt.free()
          return undefined
        }
        const cols = stmt.getColumnNames()
        const vals = stmt.get()
        stmt.free()
        const row: Record<string, any> = {}
        cols.forEach((col, i) => { row[col] = vals[i] })
        return row
      },
      all(...params: any[]) {
        const stmt = db.prepare(sql)
        if (params.length === 1 && typeof params[0] === 'object' && params[0] !== null && !Array.isArray(params[0])) {
          stmt.bind(params[0])
        } else if (params.length > 0) {
          stmt.bind(params)
        }
        const rows: Record<string, any>[] = []
        while (stmt.step()) {
          const cols = stmt.getColumnNames()
          const vals = stmt.get()
          const row: Record<string, any> = {}
          cols.forEach((col, i) => { row[col] = vals[i] })
          rows.push(row)
        }
        stmt.free()
        return rows
      },
    }
  }

  exec(sql: string) {
    this._db.run(sql)
  }

  close() {
    this._db.close()
  }

  pragma(cmd: string) {
    if (cmd.startsWith('journal_mode')) return { journal_mode: 'wal' }
    if (cmd.startsWith('foreign_keys')) return undefined
    try {
      const results = this._db.exec('PRAGMA ' + cmd)
      if (results.length > 0 && results[0].values.length > 0) {
        return results[0].values[0][0]
      }
    } catch {
      // Some pragmas may not be supported in sql.js
    }
    return undefined
  }

  get raw() { return this._db }
}

/**
 * Create an in-memory SQLite database for testing.
 * Must be called with `await` — the first call loads the WASM binary.
 */
export async function createMockDb(): Promise<BetterSqlite3Compat> {
  if (!SQL) {
    SQL = await initSqlJs()
  }
  const db = new SQL.Database()
  return new BetterSqlite3Compat(db)
}

/**
 * Create a mock memoryManager with the given db
 */
export function createMockMemoryManager(db: BetterSqlite3Compat) {
  return {
    db,
    dbPath: ':memory:',
  }
}
