import path from 'path';
import fs from 'fs';
import { app } from 'electron';

// Try to load better-sqlite3; it requires native compilation for Electron's ABI
let DatabaseConstructor: typeof import('better-sqlite3') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  DatabaseConstructor = require('better-sqlite3');
  console.log('[Memory] better-sqlite3 loaded successfully');
} catch (err) {
  console.warn('[Memory] better-sqlite3 not available — memory features disabled. Run `npx @electron/rebuild` to fix.');
}

class MemoryManager {
  private db: any | null = null;
  auditLog: any[] = [];
  fileSnapshots: Map<string, any> = new Map();

  /**
   * Initialize the memory system
   * Opens/creates the SQLite database and ensures schema is set up
   */
  init(): void {
    if (!DatabaseConstructor) {
      console.warn('[Memory] Skipping init — better-sqlite3 not available');
      return;
    }

    try {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'memory.db');

      // Create Database instance
      this.db = new (DatabaseConstructor as any)(dbPath);

      // Set secure file permissions (Unix-like systems)
      try {
        fs.chmodSync(dbPath, 0o600);
      } catch (err) {
        // Windows or other systems may not support chmod
        console.warn('[Memory] Could not set database file permissions:', err);
      }

      // Enable foreign keys
      this.db.pragma('foreign_keys = ON');

      // Create schema
      this.createTables();

      // Create indexes for better query performance
      this.createIndexes();

      console.log('[Memory] Initialized at:', dbPath);
    } catch (err) {
      console.error('[Memory] Failed to initialize database:', err);
      this.db = null;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      try {
        this.db.close();
        this.db = null;
        console.log('[Memory] Database closed');
      } catch (err) {
        console.error('[Memory] Error closing database:', err);
      }
    }
  }

  /**
   * Create database tables if they don't exist
   */
  private createTables(): void {
    if (!this.db) return;

    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS facts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          confidence REAL DEFAULT 1.0,
          source TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch()),
          UNIQUE(category, key)
        );

        CREATE TABLE IF NOT EXISTS summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          summary TEXT NOT NULL,
          key_topics TEXT,
          created_at INTEGER DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS project_context (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id TEXT NOT NULL,
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          updated_at INTEGER DEFAULT (unixepoch()),
          UNIQUE(project_id, key)
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          title TEXT NOT NULL,
          description TEXT,
          status TEXT NOT NULL DEFAULT 'intake',
          priority INTEGER DEFAULT 0,
          mode TEXT DEFAULT 'solo',
          model TEXT,
          folder_scope TEXT,
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          error TEXT,
          summary TEXT,
          parent_task TEXT,
          assigned_agent TEXT
        );

        CREATE TABLE IF NOT EXISTS task_events (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          agent_id TEXT,
          data TEXT,
          timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_artifacts (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT,
          path TEXT,
          content TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS task_approvals (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,
          agent_id TEXT,
          action_type TEXT NOT NULL,
          description TEXT NOT NULL,
          details TEXT,
          status TEXT DEFAULT 'pending',
          dry_run_output TEXT,
          responded_at INTEGER,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          role TEXT NOT NULL,
          description TEXT,
          model TEXT,
          tools TEXT,
          folder_access TEXT,
          instructions TEXT,
          status TEXT DEFAULT 'idle',
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS agent_runs (
          id TEXT PRIMARY KEY,
          agent_id TEXT NOT NULL,
          task_id TEXT NOT NULL,
          status TEXT DEFAULT 'running',
          input TEXT,
          output TEXT,
          model_used TEXT,
          tokens_in INTEGER,
          tokens_out INTEGER,
          started_at INTEGER NOT NULL,
          completed_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS agent_handoffs (
          id TEXT PRIMARY KEY,
          from_agent TEXT NOT NULL,
          to_agent TEXT NOT NULL,
          task_id TEXT NOT NULL,
          summary TEXT,
          timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS folders (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          path TEXT NOT NULL,
          label TEXT,
          access_level TEXT DEFAULT 'read_only',
          is_active INTEGER DEFAULT 1,
          added_at INTEGER NOT NULL,
          last_ai_access INTEGER
        );

        CREATE TABLE IF NOT EXISTS folder_instructions (
          id TEXT PRIMARY KEY,
          folder_id TEXT NOT NULL,
          instruction TEXT NOT NULL,
          priority INTEGER DEFAULT 0,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS context_sources (
          id TEXT PRIMARY KEY,
          project_id TEXT,
          type TEXT NOT NULL,
          label TEXT,
          content TEXT NOT NULL,
          token_estimate INTEGER,
          pinned INTEGER DEFAULT 0,
          active INTEGER DEFAULT 1,
          created_at INTEGER NOT NULL,
          expires_at INTEGER
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          task_id TEXT,
          agent_id TEXT,
          action TEXT NOT NULL,
          target TEXT,
          details TEXT,
          reversible INTEGER DEFAULT 0,
          snapshot_id TEXT,
          timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS file_snapshots (
          id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          content_hash TEXT,
          content BLOB,
          task_id TEXT,
          created_at INTEGER NOT NULL
        );
      `);
    } catch (err) {
      console.error('[Memory] Error creating tables:', err);
    }
  }

  /**
   * Create indexes for common queries
   */
  private createIndexes(): void {
    if (!this.db) return;

    try {
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_facts_category ON facts(category);
        CREATE INDEX IF NOT EXISTS idx_facts_category_key ON facts(category, key);
        CREATE INDEX IF NOT EXISTS idx_summaries_session_id ON summaries(session_id);
        CREATE INDEX IF NOT EXISTS idx_project_context_project_id ON project_context(project_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_task_events_task ON task_events(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_approvals_status ON task_approvals(status);
        CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_task ON audit_log(task_id);
        CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
        CREATE INDEX IF NOT EXISTS idx_folders_project ON folders(project_id);
        CREATE INDEX IF NOT EXISTS idx_context_sources_project ON context_sources(project_id);
      `);
    } catch (err) {
      console.error('[Memory] Error creating indexes:', err);
    }
  }

  /**
   * Set or update a fact
   */
  setFact(
    category: string,
    key: string,
    value: string,
    opts?: { confidence?: number; source?: string }
  ): void {
    if (!this.db) return;

    try {
      const confidence = opts?.confidence ?? 1.0;
      const source = opts?.source ?? 'explicit';

      const stmt = this.db.prepare(`
        INSERT INTO facts (category, key, value, confidence, source, updated_at)
        VALUES (?, ?, ?, ?, ?, unixepoch())
        ON CONFLICT(category, key) DO UPDATE SET
          value = excluded.value,
          confidence = excluded.confidence,
          source = excluded.source,
          updated_at = unixepoch()
      `);

      stmt.run(category, key, value, confidence, source);
    } catch (err) {
      console.error('[Memory] Error setting fact:', err);
    }
  }

  /**
   * Get a single fact by category and key
   */
  getFact(
    category: string,
    key: string
  ): { value: string; confidence: number; source: string; updatedAt: number } | null {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(`
        SELECT value, confidence, source, updated_at
        FROM facts
        WHERE category = ? AND key = ?
      `);

      const result = stmt.get(category, key) as any;

      if (!result) return null;

      return {
        value: result.value,
        confidence: result.confidence,
        source: result.source || 'explicit',
        updatedAt: result.updated_at,
      };
    } catch (err) {
      console.error('[Memory] Error getting fact:', err);
      return null;
    }
  }

  /**
   * Search facts by query string (searches key and value)
   */
  searchFacts(
    query: string,
    category?: string
  ): Array<{ category: string; key: string; value: string; confidence: number }> {
    if (!this.db) return [];

    try {
      let sql = `
        SELECT category, key, value, confidence
        FROM facts
        WHERE (key LIKE ? OR value LIKE ?)
      `;
      const params: any[] = [`%${query}%`, `%${query}%`];

      if (category) {
        sql += ` AND category = ?`;
        params.push(category);
      }

      sql += ` ORDER BY confidence DESC, updated_at DESC`;

      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as any[];
    } catch (err) {
      console.error('[Memory] Error searching facts:', err);
      return [];
    }
  }

  /**
   * List all facts, optionally filtered by category
   */
  listFacts(
    category?: string
  ): Array<{ category: string; key: string; value: string; confidence: number }> {
    if (!this.db) return [];

    try {
      let sql = 'SELECT category, key, value, confidence FROM facts';
      const params: any[] = [];

      if (category) {
        sql += ' WHERE category = ?';
        params.push(category);
      }

      sql += ' ORDER BY category, key';

      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as any[];
    } catch (err) {
      console.error('[Memory] Error listing facts:', err);
      return [];
    }
  }

  /**
   * Delete a fact
   */
  deleteFact(category: string, key: string): boolean {
    if (!this.db) return false;

    try {
      const stmt = this.db.prepare('DELETE FROM facts WHERE category = ? AND key = ?');
      const result = stmt.run(category, key);
      return (result.changes ?? 0) > 0;
    } catch (err) {
      console.error('[Memory] Error deleting fact:', err);
      return false;
    }
  }

  /**
   * Add a conversation summary
   */
  addSummary(sessionId: string, summary: string, keyTopics?: string[]): void {
    if (!this.db) return;

    try {
      const topicsJson = keyTopics ? JSON.stringify(keyTopics) : null;

      const stmt = this.db.prepare(`
        INSERT INTO summaries (session_id, summary, key_topics)
        VALUES (?, ?, ?)
      `);

      stmt.run(sessionId, summary, topicsJson);
    } catch (err) {
      console.error('[Memory] Error adding summary:', err);
    }
  }

  /**
   * Get summaries, optionally filtered by session ID
   */
  getSummaries(
    sessionId?: string,
    limit?: number
  ): Array<{ sessionId: string; summary: string; keyTopics: string[]; createdAt: number }> {
    if (!this.db) return [];

    try {
      let sql = 'SELECT session_id, summary, key_topics, created_at FROM summaries';
      const params: any[] = [];

      if (sessionId) {
        sql += ' WHERE session_id = ?';
        params.push(sessionId);
      }

      sql += ' ORDER BY created_at DESC';

      if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as any[];

      return results.map((r) => ({
        sessionId: r.session_id,
        summary: r.summary,
        keyTopics: r.key_topics ? JSON.parse(r.key_topics) : [],
        createdAt: r.created_at,
      }));
    } catch (err) {
      console.error('[Memory] Error getting summaries:', err);
      return [];
    }
  }

  /**
   * Search summaries by text query
   */
  searchSummaries(
    query: string,
    limit?: number
  ): Array<{ sessionId: string; summary: string; keyTopics: string[]; createdAt: number }> {
    if (!this.db) return [];

    try {
      let sql = `
        SELECT session_id, summary, key_topics, created_at
        FROM summaries
        WHERE summary LIKE ?
        ORDER BY created_at DESC
      `;
      const params: any[] = [`%${query}%`];

      if (limit) {
        sql += ' LIMIT ?';
        params.push(limit);
      }

      const stmt = this.db.prepare(sql);
      const results = stmt.all(...params) as any[];

      return results.map((r) => ({
        sessionId: r.session_id,
        summary: r.summary,
        keyTopics: r.key_topics ? JSON.parse(r.key_topics) : [],
        createdAt: r.created_at,
      }));
    } catch (err) {
      console.error('[Memory] Error searching summaries:', err);
      return [];
    }
  }

  /**
   * Set or update project context
   */
  setProjectContext(projectId: string, key: string, value: string): void {
    if (!this.db) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO project_context (project_id, key, value, updated_at)
        VALUES (?, ?, ?, unixepoch())
        ON CONFLICT(project_id, key) DO UPDATE SET
          value = excluded.value,
          updated_at = unixepoch()
      `);

      stmt.run(projectId, key, value);
    } catch (err) {
      console.error('[Memory] Error setting project context:', err);
    }
  }

  /**
   * Get project context entries
   * If key is not provided, returns all entries for the project
   */
  getProjectContext(projectId: string, key?: string): Array<{ key: string; value: string }> {
    if (!this.db) return [];

    try {
      let sql = 'SELECT key, value FROM project_context WHERE project_id = ?';
      const params: any[] = [projectId];

      if (key) {
        sql += ' AND key = ?';
        params.push(key);
      }

      sql += ' ORDER BY key';

      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as any[];
    } catch (err) {
      console.error('[Memory] Error getting project context:', err);
      return [];
    }
  }

  /**
   * Delete project context entries
   * If key is not provided, deletes all entries for the project
   */
  deleteProjectContext(projectId: string, key?: string): void {
    if (!this.db) return;

    try {
      let sql = 'DELETE FROM project_context WHERE project_id = ?';
      const params: any[] = [projectId];

      if (key) {
        sql += ' AND key = ?';
        params.push(key);
      }

      const stmt = this.db.prepare(sql);
      stmt.run(...params);
    } catch (err) {
      console.error('[Memory] Error deleting project context:', err);
    }
  }

  /**
   * Build a formatted context block for system prompt injection
   * Returns a markdown-formatted string with relevant memories
   */
  buildContextBlock(opts?: {
    projectId?: string;
    maxFacts?: number;
    maxSummaries?: number;
  }): string {
    if (!this.db) return '';

    try {
      const maxFacts = opts?.maxFacts ?? 10;
      const maxSummaries = opts?.maxSummaries ?? 5;

      const blocks: string[] = [];

      // User context (facts from 'user' category)
      const userFacts = this.listFacts('user');
      if (userFacts.length > 0) {
        const factLines = userFacts
          .slice(0, maxFacts)
          .map((f) => `- ${f.key}: ${f.value}`);
        blocks.push('## User Context\n' + factLines.join('\n'));
      }

      // Preferences (facts from 'preference' category)
      const prefFacts = this.listFacts('preference');
      if (prefFacts.length > 0) {
        const factLines = prefFacts
          .slice(0, maxFacts)
          .map((f) => `- ${f.key}: ${f.value}`);
        blocks.push('## Preferences\n' + factLines.join('\n'));
      }

      // Recent summaries
      const summaries = this.getSummaries(undefined, maxSummaries);
      if (summaries.length > 0) {
        const summaryLines = summaries.map(
          (s) => `- [${s.sessionId}]: ${s.summary.substring(0, 100)}...`
        );
        blocks.push('## Recent Summaries\n' + summaryLines.join('\n'));
      }

      // Project context (if projectId provided)
      if (opts?.projectId) {
        const projectCtx = this.getProjectContext(opts.projectId);
        if (projectCtx.length > 0) {
          const ctxLines = projectCtx
            .slice(0, maxFacts)
            .map((c) => `- ${c.key}: ${c.value}`);
          blocks.push('## Project Context\n' + ctxLines.join('\n'));
        }
      }

      return blocks.join('\n\n');
    } catch (err) {
      console.error('[Memory] Error building context block:', err);
      return '';
    }
  }

  /**
   * Generic query helper for the new tables - returns all matching rows
   */
  queryAll(sql: string, params?: any[]): any[] {
    if (!this.db) return [];

    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...(params ?? [])) as any[];
    } catch (err) {
      console.error('[Memory] Error in queryAll:', err);
      return [];
    }
  }

  /**
   * Generic query helper for the new tables - returns single row
   */
  queryOne(sql: string, params?: any[]): any {
    if (!this.db) return null;

    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...(params ?? [])) as any;
    } catch (err) {
      console.error('[Memory] Error in queryOne:', err);
      return null;
    }
  }

  /**
   * Generic run helper for the new tables - executes insert/update/delete
   */
  run(sql: string, params?: any[]): { changes: number; lastInsertRowid: number } {
    if (!this.db) {
      return { changes: 0, lastInsertRowid: 0 };
    }

    try {
      const stmt = this.db.prepare(sql);
      const result = stmt.run(...(params ?? [])) as any;
      return {
        changes: result.changes ?? 0,
        lastInsertRowid: result.lastInsertRowid ?? 0,
      };
    } catch (err) {
      console.error('[Memory] Error in run:', err);
      return { changes: 0, lastInsertRowid: 0 };
    }
  }

  /**
   * Get database statistics
   */
  stats(): {
    facts: number;
    summaries: number;
    projectContexts: number;
    dbSizeBytes: number;
  } {
    if (!this.db) {
      return {
        facts: 0,
        summaries: 0,
        projectContexts: 0,
        dbSizeBytes: 0,
      };
    }

    try {
      const factCount = (this.db.prepare('SELECT COUNT(*) as count FROM facts').get() as any)
        .count;
      const summaryCount = (this.db.prepare('SELECT COUNT(*) as count FROM summaries').get() as any)
        .count;
      const projectContextCount = (this.db.prepare(
        'SELECT COUNT(*) as count FROM project_context'
      ).get() as any).count;

      const dbPath = path.join(app.getPath('userData'), 'memory.db');
      let dbSizeBytes = 0;

      try {
        const stats = fs.statSync(dbPath);
        dbSizeBytes = stats.size;
      } catch (err) {
        console.warn('[Memory] Could not get database file size:', err);
      }

      return {
        facts: factCount,
        summaries: summaryCount,
        projectContexts: projectContextCount,
        dbSizeBytes,
      };
    } catch (err) {
      console.error('[Memory] Error getting stats:', err);
      return {
        facts: 0,
        summaries: 0,
        projectContexts: 0,
        dbSizeBytes: 0,
      };
    }
  }
}

// Create and export singleton instance
const memoryManager = new MemoryManager();

// `memory` alias used by Cowork modules (task-manager, audit-log, etc.)
const memory = memoryManager;
export { memoryManager, memory, MemoryManager };
export default memoryManager;
