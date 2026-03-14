import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

class MemoryManager {
  private db: Database.Database | null = null;

  /**
   * Initialize the memory system
   * Opens/creates the SQLite database and ensures schema is set up
   */
  init(): void {
    try {
      const userDataPath = app.getPath('userData');
      const dbPath = path.join(userDataPath, 'memory.db');

      // Create Database instance
      this.db = new Database(dbPath);

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

export { memoryManager, MemoryManager };
export default memoryManager;
