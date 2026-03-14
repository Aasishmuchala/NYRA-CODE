import { spawn as ptySpawn, IPty } from 'node-pty';
import os from 'os';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';

/**
 * Represents a single PTY (pseudo-terminal) session
 */
class PtySession extends EventEmitter {
  id: string;
  cwd: string;
  pty: IPty;
  history: string = '';
  private readonly MAX_HISTORY = 100 * 1024; // 100KB

  constructor(cwd: string = os.homedir()) {
    super();
    this.id = randomUUID();
    this.cwd = cwd;

    // Determine the shell based on platform
    const shell = this.getShell();
    const shellArgs = this.getShellArgs(shell);

    // Sanitize environment
    const env = this.sanitizeEnvironment();
    env.TERM = 'xterm-256color';
    env.COLORTERM = 'truecolor';

    // Spawn the PTY
    this.pty = ptySpawn(shell, shellArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: this.cwd,
      env: env,
      // Increase write buffer for better performance
      handleFlowControl: true,
    });

    // Listen for data from the PTY
    this.pty.onData((data: string) => {
      this.addToHistory(data);
      this.emit('data', data);
    });

    // Listen for exit events
    this.pty.onExit(({ exitCode, signal }: { exitCode: number; signal?: number }) => {
      this.emit('exit', exitCode, signal);
    });
  }

  /**
   * Get the appropriate shell for the current platform
   */
  private getShell(): string {
    const platform = os.platform();

    if (platform === 'darwin') {
      // macOS: try zsh first, fallback to bash
      return '/bin/zsh';
    } else if (platform === 'win32') {
      // Windows: use PowerShell
      return 'powershell.exe';
    } else {
      // Linux and other Unix-like systems: use bash
      return '/bin/bash';
    }
  }

  /**
   * Get shell arguments based on the shell type
   */
  private getShellArgs(shell: string): string[] {
    // For most shells, no args needed for interactive mode
    // PowerShell uses -NoExit to keep the shell open
    if (shell.includes('powershell')) {
      return ['-NoExit', '-Command', '[Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8'];
    }
    return [];
  }

  /**
   * Sanitize the environment to remove sensitive variables
   */
  private sanitizeEnvironment(): Record<string, string> {
    const env = { ...process.env };

    // Remove sensitive Electron-specific variables
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_OAUTHABLE;

    // Ensure basic environment variables are set
    if (!env.PATH) {
      const defaultPath = this.getDefaultPath();
      env.PATH = defaultPath;
    }

    if (!env.HOME && os.platform() !== 'win32') {
      env.HOME = os.homedir();
    }

    if (!env.USER && os.platform() !== 'win32') {
      env.USER = os.userInfo().username;
    }

    return env as Record<string, string>;
  }

  /**
   * Get the default PATH for the current platform
   */
  private getDefaultPath(): string {
    const platform = os.platform();

    if (platform === 'win32') {
      return `${process.env.WINDIR || 'C:\\Windows'}\\System32;${process.env.WINDIR || 'C:\\Windows'}`;
    } else {
      return '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin';
    }
  }

  /**
   * Add data to the history buffer, maintaining the size limit
   */
  private addToHistory(data: string): void {
    this.history += data;

    // Trim from the front if history exceeds max size
    if (this.history.length > this.MAX_HISTORY) {
      const excessLength = this.history.length - this.MAX_HISTORY;
      this.history = this.history.slice(excessLength);
    }
  }

  /**
   * Write data to the PTY
   */
  write(data: string): void {
    try {
      this.pty.write(data);
    } catch (error) {
      console.error(`Failed to write to PTY ${this.id}:`, error);
    }
  }

  /**
   * Resize the terminal
   */
  resize(cols: number, rows: number): void {
    try {
      this.pty.resize(cols, rows);
    } catch (error) {
      console.error(`Failed to resize PTY ${this.id}:`, error);
    }
  }

  /**
   * Kill the PTY session
   */
  kill(): void {
    try {
      this.pty.kill();
    } catch (error) {
      console.error(`Failed to kill PTY ${this.id}:`, error);
    }
  }
}

/**
 * Manages multiple PTY sessions
 */
class PtyManager extends EventEmitter {
  private sessions: Map<string, PtySession> = new Map();
  private readonly MAX_SESSIONS = 5;

  /**
   * Create a new PTY session
   */
  create(cwd?: string): string {
    // Check if we've hit the maximum number of concurrent sessions
    if (this.sessions.size >= this.MAX_SESSIONS) {
      throw new Error(`Maximum concurrent sessions (${this.MAX_SESSIONS}) reached`);
    }

    const session = new PtySession(cwd || os.homedir());

    // Relay data events with session ID
    session.on('data', (data: string) => {
      this.emit('data', { id: session.id, data });
    });

    // Relay exit events with session ID
    session.on('exit', (code: number, signal?: number) => {
      this.emit('exit', { id: session.id, code, signal });
      // Remove session from map on exit
      this.sessions.delete(session.id);
    });

    this.sessions.set(session.id, session);
    return session.id;
  }

  /**
   * Write data to a specific session
   */
  write(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }
    session.write(data);
  }

  /**
   * Resize a specific session's terminal
   */
  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }
    session.resize(cols, rows);
  }

  /**
   * Kill a specific session
   */
  kill(id: string): void {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }
    session.kill();
    this.sessions.delete(id);
  }

  /**
   * Kill all active sessions (for app shutdown)
   */
  killAll(): void {
    for (const session of this.sessions.values()) {
      try {
        session.kill();
      } catch (error) {
        console.error(`Error killing session ${session.id}:`, error);
      }
    }
    this.sessions.clear();
  }

  /**
   * Get the buffered output history for a session
   */
  getHistory(id: string): string {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session ${id} not found`);
    }
    return session.history;
  }

  /**
   * List all active sessions
   */
  list(): Array<{ id: string; cwd: string; pid: number }> {
    const result: Array<{ id: string; cwd: string; pid: number }> = [];
    for (const session of this.sessions.values()) {
      result.push({
        id: session.id,
        cwd: session.cwd,
        pid: session.pty.pid,
      });
    }
    return result;
  }
}

// Export singleton instance
export const ptyManager = new PtyManager();

export { PtySession, PtyManager };
