/**
 * Conversation Branching & Session Tree System
 *
 * Manages conversation forking, merging, and tree navigation using better-sqlite3.
 * Allows users to branch conversations at any message point and merge branches back together.
 */

import { memoryManager } from './memory';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ConversationBranch {
  id: string;
  parentBranchId: string | null;
  sessionId: string;
  forkPointMessageIndex: number;
  name: string;
  createdAt: number;
  metadata?: Record<string, any>;
}

export interface BranchMessage {
  id: string;
  branchId: string;
  messageIndex: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  tokens?: number;
  createdAt: number;
}

export interface BranchNode {
  id: string;
  name: string;
  parentId: string | null;
  messageCount: number;
  forkPoint: number;
  createdAt: number;
  children: BranchNode[];
}

export interface BranchStats {
  totalBranches: number;
  sessionsWithBranches: number;
  totalMessages: number;
}

// ── BranchManager Class ───────────────────────────────────────────────────────

class BranchManager {
  private currentSessionId: string | null = null;

  /**
   * Initialize branching tables in the database
   */
  init(): void {
    const db = (memoryManager as any).db;
    if (!db) {
      console.warn('[BranchManager] Database not available');
      return;
    }

    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS conversation_branches (
          id TEXT PRIMARY KEY,
          parent_branch_id TEXT,
          session_id TEXT NOT NULL,
          fork_point_message_index INTEGER NOT NULL,
          name TEXT NOT NULL,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          metadata TEXT,
          FOREIGN KEY (parent_branch_id) REFERENCES conversation_branches(id)
        );

        CREATE TABLE IF NOT EXISTS conversation_branch_messages (
          id TEXT PRIMARY KEY,
          branch_id TEXT NOT NULL,
          message_index INTEGER NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          model TEXT,
          tokens INTEGER,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          FOREIGN KEY (branch_id) REFERENCES conversation_branches(id) ON DELETE CASCADE,
          UNIQUE(branch_id, message_index)
        );
      `);

      // Create indexes for performance
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_branches_session ON conversation_branches(session_id);
        CREATE INDEX IF NOT EXISTS idx_branches_parent ON conversation_branches(parent_branch_id);
        CREATE INDEX IF NOT EXISTS idx_branch_messages_branch ON conversation_branch_messages(branch_id);
        CREATE INDEX IF NOT EXISTS idx_branch_messages_index ON conversation_branch_messages(message_index);
      `);

      console.log('[BranchManager] Initialized branching tables');
    } catch (err) {
      console.error('[BranchManager] Error initializing tables:', err);
    }
  }

  /**
   * Set the current session ID
   */
  setCurrentSessionId(sessionId: string): void {
    this.currentSessionId = sessionId;
  }

  /**
   * Get the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Create a new branch by forking at a specific message index
   * Copies all messages up to the fork point to the new branch
   */
  createBranch(
    sessionId: string,
    forkPointIndex: number,
    name?: string,
    parentBranchId?: string
  ): string {
    const db = (memoryManager as any).db;
    if (!db) throw new Error('Database not available');

    try {
      const branchId = this.generateId();
      const branchName = name || `Branch ${new Date().toLocaleTimeString()}`;

      const stmt = db.prepare(`
        INSERT INTO conversation_branches (
          id, parent_branch_id, session_id, fork_point_message_index, name, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);

      stmt.run(branchId, parentBranchId || null, sessionId, forkPointIndex, branchName, Date.now());

      console.log(
        `[BranchManager] Created branch ${branchId} at fork point ${forkPointIndex}`
      );

      return branchId;
    } catch (err) {
      console.error('[BranchManager] Error creating branch:', err);
      throw err;
    }
  }

  /**
   * Add a message to a branch
   */
  addMessageToBranch(
    branchId: string,
    messageIndex: number,
    role: 'user' | 'assistant' | 'system',
    content: string,
    model?: string,
    tokens?: number
  ): string {
    const db = (memoryManager as any).db;
    if (!db) throw new Error('Database not available');

    try {
      const messageId = this.generateId();

      const stmt = db.prepare(`
        INSERT INTO conversation_branch_messages (
          id, branch_id, message_index, role, content, model, tokens, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(messageId, branchId, messageIndex, role, content, model || null, tokens || null, Date.now());

      return messageId;
    } catch (err) {
      console.error('[BranchManager] Error adding message:', err);
      throw err;
    }
  }

  /**
   * Get all branches for a session
   */
  getBranches(sessionId: string): ConversationBranch[] {
    const db = (memoryManager as any).db;
    if (!db) return [];

    try {
      const stmt = db.prepare(`
        SELECT id, parent_branch_id, session_id, fork_point_message_index, name, created_at, metadata
        FROM conversation_branches
        WHERE session_id = ?
        ORDER BY created_at ASC
      `);

      const rows = stmt.all(sessionId) as any[];

      return rows.map((row) => ({
        id: row.id,
        parentBranchId: row.parent_branch_id,
        sessionId: row.session_id,
        forkPointMessageIndex: row.fork_point_message_index,
        name: row.name,
        createdAt: row.created_at,
        metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      }));
    } catch (err) {
      console.error('[BranchManager] Error getting branches:', err);
      return [];
    }
  }

  /**
   * Get all messages for a branch
   */
  getBranchMessages(branchId: string): BranchMessage[] {
    const db = (memoryManager as any).db;
    if (!db) return [];

    try {
      const stmt = db.prepare(`
        SELECT id, branch_id, message_index, role, content, model, tokens, created_at
        FROM conversation_branch_messages
        WHERE branch_id = ?
        ORDER BY message_index ASC
      `);

      const rows = stmt.all(branchId) as any[];

      return rows.map((row) => ({
        id: row.id,
        branchId: row.branch_id,
        messageIndex: row.message_index,
        role: row.role,
        content: row.content,
        model: row.model,
        tokens: row.tokens,
        createdAt: row.created_at,
      }));
    } catch (err) {
      console.error('[BranchManager] Error getting branch messages:', err);
      return [];
    }
  }

  /**
   * Rename a branch
   */
  renameBranch(branchId: string, newName: string): boolean {
    const db = (memoryManager as any).db;
    if (!db) return false;

    try {
      const stmt = db.prepare('UPDATE conversation_branches SET name = ? WHERE id = ?');
      const result = stmt.run(newName, branchId);
      return (result.changes ?? 0) > 0;
    } catch (err) {
      console.error('[BranchManager] Error renaming branch:', err);
      return false;
    }
  }

  /**
   * Merge source branch into target branch
   * Appends all messages from source after the fork point to target
   */
  mergeBranch(sourceBranchId: string, targetBranchId: string): boolean {
    const db = (memoryManager as any).db;
    if (!db) return false;

    try {
      // Get target branch fork point
      const targetBranch = db.prepare(
        'SELECT fork_point_message_index FROM conversation_branches WHERE id = ?'
      ).get(targetBranchId) as any;

      if (!targetBranch) {
        console.error('[BranchManager] Target branch not found');
        return false;
      }

      // Get source branch messages
      const sourceMessages = this.getBranchMessages(sourceBranchId);

      // Find the highest message index in target
      const maxIndexResult = db.prepare(
        'SELECT MAX(message_index) as max_index FROM conversation_branch_messages WHERE branch_id = ?'
      ).get(targetBranchId) as any;

      let nextMessageIndex = (maxIndexResult?.max_index ?? targetBranch.fork_point_message_index) + 1;

      // Insert source messages into target
      const insertStmt = db.prepare(`
        INSERT INTO conversation_branch_messages (
          id, branch_id, message_index, role, content, model, tokens, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const msg of sourceMessages) {
        if (msg.messageIndex > targetBranch.fork_point_message_index) {
          insertStmt.run(
            this.generateId(),
            targetBranchId,
            nextMessageIndex++,
            msg.role,
            msg.content,
            msg.model || null,
            msg.tokens || null,
            Date.now()
          );
        }
      }

      console.log('[BranchManager] Merged branch', sourceBranchId, 'into', targetBranchId);
      return true;
    } catch (err) {
      console.error('[BranchManager] Error merging branches:', err);
      return false;
    }
  }

  /**
   * Delete a branch and all its messages
   */
  deleteBranch(branchId: string): boolean {
    const db = (memoryManager as any).db;
    if (!db) return false;

    try {
      // Delete messages first (foreign key constraint)
      const deleteMessages = db.prepare('DELETE FROM conversation_branch_messages WHERE branch_id = ?');
      deleteMessages.run(branchId);

      // Delete the branch
      const deleteBranch = db.prepare('DELETE FROM conversation_branches WHERE id = ?');
      const result = deleteBranch.run(branchId);

      console.log('[BranchManager] Deleted branch', branchId);
      return (result.changes ?? 0) > 0;
    } catch (err) {
      console.error('[BranchManager] Error deleting branch:', err);
      return false;
    }
  }

  /**
   * Get the branch tree structure for a session
   * Returns nested tree with all branches and their relationships
   */
  getBranchTree(sessionId: string): BranchNode[] {
    const db = (memoryManager as any).db;
    if (!db) return [];

    try {
      const branches = this.getBranches(sessionId);
      const branchMap = new Map<string, BranchNode>();

      // Build initial nodes
      for (const branch of branches) {
        const messages = this.getBranchMessages(branch.id);

        const node: BranchNode = {
          id: branch.id,
          name: branch.name,
          parentId: branch.parentBranchId || null,
          messageCount: messages.length,
          forkPoint: branch.forkPointMessageIndex,
          createdAt: branch.createdAt,
          children: [],
        };

        branchMap.set(branch.id, node);
      }

      // Build tree hierarchy
      const roots: BranchNode[] = [];

      for (const [, node] of branchMap) {
        if (node.parentId) {
          const parent = branchMap.get(node.parentId);
          if (parent) {
            parent.children.push(node);
          }
        } else {
          roots.push(node);
        }
      }

      // Sort children by creation time
      for (const node of branchMap.values()) {
        node.children.sort((a, b) => a.createdAt - b.createdAt);
      }

      return roots.sort((a, b) => a.createdAt - b.createdAt);
    } catch (err) {
      console.error('[BranchManager] Error getting branch tree:', err);
      return [];
    }
  }

  /**
   * Get statistics about branching in the system
   */
  getStats(): BranchStats {
    const db = (memoryManager as any).db;
    if (!db) {
      return {
        totalBranches: 0,
        sessionsWithBranches: 0,
        totalMessages: 0,
      };
    }

    try {
      const totalBranches = (
        db.prepare('SELECT COUNT(*) as count FROM conversation_branches').get() as any
      ).count;

      const sessionsWithBranches = (
        db.prepare('SELECT COUNT(DISTINCT session_id) as count FROM conversation_branches').get() as any
      ).count;

      const totalMessages = (
        db.prepare('SELECT COUNT(*) as count FROM conversation_branch_messages').get() as any
      ).count;

      return {
        totalBranches,
        sessionsWithBranches,
        totalMessages,
      };
    } catch (err) {
      console.error('[BranchManager] Error getting stats:', err);
      return {
        totalBranches: 0,
        sessionsWithBranches: 0,
        totalMessages: 0,
      };
    }
  }

  /**
   * Generate a unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

// ── Singleton Export ──────────────────────────────────────────────────────────

const branchManager = new BranchManager();

export { BranchManager, branchManager };
export default branchManager;
