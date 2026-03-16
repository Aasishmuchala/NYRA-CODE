import { EventEmitter } from 'events';

interface WindowInfo {
  app: string;
  title: string;
  pid: number;
}

interface CapturedContext {
  selectedText: string;
  clipboardContent: string;
  activeApp: string;
  windowTitle: string;
  appProfile: AppProfile;
}

interface AppProfile {
  name: string;
  suggestedBehavior: string;
  contextType: 'code' | 'writing' | 'search' | 'chat' | 'general';
  injectionMethod: 'paste' | 'autocomplete' | 'insert' | 'snippet';
}

type ContextMode = 'floating' | 'sidebar' | 'inline';
type HotkeyCombo = string;

const APP_PROFILES: Record<string, AppProfile> = {
  'VS Code': {
    name: 'VS Code',
    suggestedBehavior: 'provide code suggestions and refactoring advice',
    contextType: 'code',
    injectionMethod: 'snippet'
  },
  'Chrome': {
    name: 'Chrome',
    suggestedBehavior: 'assist with search queries and web content analysis',
    contextType: 'search',
    injectionMethod: 'paste'
  },
  'Slack': {
    name: 'Slack',
    suggestedBehavior: 'help compose professional messages and quick replies',
    contextType: 'chat',
    injectionMethod: 'paste'
  },
  'Terminal': {
    name: 'Terminal',
    suggestedBehavior: 'provide shell commands and scripting assistance',
    contextType: 'code',
    injectionMethod: 'paste'
  },
  'Notes': {
    name: 'Notes',
    suggestedBehavior: 'assist with writing and organization',
    contextType: 'writing',
    injectionMethod: 'paste'
  },
  'default': {
    name: 'default',
    suggestedBehavior: 'general AI assistance',
    contextType: 'general',
    injectionMethod: 'paste'
  }
};

class SystemOverlay extends EventEmitter {
  private isActive: boolean = false;
  private currentMode: ContextMode = 'floating';
  private registeredHotkeys: Map<HotkeyCombo, () => void> = new Map();
  private lastActiveWindow: WindowInfo | null = null;
  private contextCache: Map<string, CapturedContext> = new Map();

  constructor() {
    super();
  }

  /**
   * Activate the system-wide overlay
   */
  activate(): void {
    if (this.isActive) return;
    this.isActive = true;
    this.emit('activated', { timestamp: Date.now(), mode: this.currentMode });
  }

  /**
   * Deactivate the system-wide overlay
   */
  deactivate(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.registeredHotkeys.forEach((callback, combo) => {
      this.unregisterHotkey(combo);
    });
    this.emit('deactivated', { timestamp: Date.now() });
  }

  /**
   * Register a global hotkey combination
   * Example: 'Ctrl+Space', 'Cmd+Shift+K'
   */
  registerHotkey(combo: string, callback?: () => void): void {
    if (!this.isActive) {
      throw new Error('SystemOverlay must be activated before registering hotkeys');
    }

    // Validate hotkey format
    const validCombos = /^(Ctrl|Cmd|Alt|Shift)[\+](Ctrl|Cmd|Alt|Shift)*[\+]\w+$/i;
    if (!validCombos.test(combo)) {
      throw new Error(`Invalid hotkey combination format: ${combo}`);
    }

    const defaultCallback = () => this.emit('hotkey-triggered', { combo, timestamp: Date.now() });
    const handler = callback || defaultCallback;

    this.registeredHotkeys.set(combo, handler);
    this.emit('hotkey-registered', { combo, timestamp: Date.now() });
  }

  /**
   * Unregister a hotkey
   */
  unregisterHotkey(combo: string): void {
    if (this.registeredHotkeys.has(combo)) {
      this.registeredHotkeys.delete(combo);
      this.emit('hotkey-unregistered', { combo, timestamp: Date.now() });
    }
  }

  /**
   * Get information about the currently focused window
   */
  getActiveWindow(): WindowInfo {
    // Simulated: In production, this would use OS-level APIs
    return this.lastActiveWindow || {
      app: 'Unknown',
      title: 'Untitled',
      pid: 0
    };
  }

  /**
   * Capture contextual information from the active window
   */
  captureContext(): CapturedContext {
    const activeWindow = this.getActiveWindow();
    const appProfile = this.getAppProfile(activeWindow.app);

    const context: CapturedContext = {
      selectedText: this.getSelectedText(),
      clipboardContent: this.getClipboardContent(),
      activeApp: activeWindow.app,
      windowTitle: activeWindow.title,
      appProfile
    };

    this.contextCache.set(activeWindow.app, context);
    this.emit('context-captured', { context, timestamp: Date.now() });

    return context;
  }

  /**
   * Inject AI response into the active application
   */
  injectResponse(text: string): void {
    if (!this.isActive) {
      throw new Error('Overlay must be active to inject responses');
    }

    const activeWindow = this.getActiveWindow();
    const profile = this.getAppProfile(activeWindow.app);

    try {
      // Simulate clipboard-based injection
      this.setClipboardContent(text);

      // Simulate paste keystroke (Ctrl+V or Cmd+V)
      const pasteCommand = process.platform === 'darwin' ? 'Cmd+V' : 'Ctrl+V';
      this.simulateKeystroke(pasteCommand);

      this.emit('response-injected', {
        app: activeWindow.app,
        length: text.length,
        method: profile.injectionMethod,
        timestamp: Date.now()
      });
    } catch (error) {
      this.emit('injection-failed', { error, text, timestamp: Date.now() });
    }
  }

  /**
   * Set the context display mode
   */
  setMode(mode: ContextMode): void {
    if (!['floating', 'sidebar', 'inline'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Must be 'floating', 'sidebar', or 'inline'.`);
    }
    this.currentMode = mode;
    this.emit('mode-changed', { mode, timestamp: Date.now() });
  }

  /**
   * Get the current context display mode
   */
  getMode(): ContextMode {
    return this.currentMode;
  }

  /**
   * Get the AI behavior profile for a specific application
   */
  getAppProfile(appName: string): AppProfile {
    return APP_PROFILES[appName] || APP_PROFILES['default'];
  }

  /**
   * Get all pre-configured app profiles
   */
  getAllProfiles(): Record<string, AppProfile> {
    return { ...APP_PROFILES };
  }

  /**
   * Update or add a custom app profile
   */
  setAppProfile(appName: string, profile: AppProfile): void {
    APP_PROFILES[appName] = profile;
    this.emit('profile-updated', { appName, profile, timestamp: Date.now() });
  }

  /**
   * Get cached context for an app
   */
  getCachedContext(appName: string): CapturedContext | undefined {
    return this.contextCache.get(appName);
  }

  /**
   * Clear context cache
   */
  clearContextCache(): void {
    this.contextCache.clear();
    this.emit('context-cache-cleared', { timestamp: Date.now() });
  }

  /**
   * Simulate updating the active window (for testing)
   */
  _setActiveWindow(windowInfo: WindowInfo): void {
    this.lastActiveWindow = windowInfo;
    this.emit('active-window-changed', { windowInfo, timestamp: Date.now() });
  }

  // ============= Simulated OS-level operations =============

  private getSelectedText(): string {
    // Simulated: would use OS accessibility APIs in production
    return '';
  }

  private getClipboardContent(): string {
    // Simulated: would use OS clipboard APIs in production
    return '';
  }

  private setClipboardContent(text: string): void {
    // Simulated: would use OS clipboard APIs in production
  }

  private simulateKeystroke(key: string): void {
    // Simulated: would use OS keyboard simulation APIs in production
  }
}

// Export singleton instance
export const systemOverlay = new SystemOverlay();

export { SystemOverlay, WindowInfo, CapturedContext, AppProfile, ContextMode };
