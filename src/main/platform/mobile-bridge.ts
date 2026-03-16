import { EventEmitter } from 'events';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { randomBytes, createHmac } from 'crypto';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

export interface DeviceInfo {
  id: string;
  name: string;
  platform: 'ios' | 'android';
  lastSeen: number;
  paired: boolean;
  pushToken?: string;
}

export interface PairingDevice {
  deviceId: string;
  deviceInfo: DeviceInfo;
  sharedSecret: string;
  sessionToken: string;
  tokenExpiry: number;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  timestamp: number;
  data?: Record<string, any>;
}

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: number;
  unread: boolean;
}

export interface SyncSettings {
  theme?: 'light' | 'dark' | 'auto';
  notifications?: boolean;
  autoSync?: boolean;
}

class MobileBridge extends EventEmitter {
  private devices: Map<string, PairingDevice> = new Map();
  private pairedDevices: Map<string, DeviceInfo> = new Map();
  private server: Server | null = null;
  private serverPort: number = 18791;
  private dataDir: string;
  private inactivityTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private readonly SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    super();
    this.dataDir = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra', 'platform', 'mobile');
  }

  /**
   * Initialize MobileBridge and load persisted device pairings
   */
  init(): void {
    // Create directory if it doesn't exist
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Load devices from disk
    this.loadDevices();
  }

  /**
   * Shutdown MobileBridge and persist device pairings
   */
  shutdown(): void {
    // Save devices to disk
    this.saveDevices();

    // Close server if running
    if (this.server) {
      this.server.close();
      this.server = null;
    }

    // Clear all timers
    this.inactivityTimers.forEach((timer) => clearTimeout(timer));
    this.inactivityTimers.clear();
  }

  /**
   * Generate a 6-digit numeric pairing code
   */
  generatePairingCode(): string {
    const code = Math.floor(Math.random() * 1000000);
    return String(code).padStart(6, '0');
  }

  /**
   * Confirm pairing with a device using the pairing code
   */
  confirmPairing(code: string, deviceInfo: DeviceInfo): { success: boolean; deviceId?: string; error?: string } {
    // Validate code format (simplified - in production would use actual pairing flow)
    if (!/^\d{6}$/.test(code)) {
      return { success: false, error: 'Invalid pairing code format' };
    }

    try {
      const deviceId = this.generateDeviceId();
      const sharedSecret = randomBytes(32).toString('hex');
      const sessionToken = this.generateSessionToken();
      const tokenExpiry = Date.now() + this.SESSION_EXPIRY;

      const updatedDeviceInfo: DeviceInfo = {
        ...deviceInfo,
        id: deviceId,
        lastSeen: Date.now(),
        paired: true,
      };

      const pairingDevice: PairingDevice = {
        deviceId,
        deviceInfo: updatedDeviceInfo,
        sharedSecret,
        sessionToken,
        tokenExpiry,
      };

      this.devices.set(deviceId, pairingDevice);
      this.pairedDevices.set(deviceId, updatedDeviceInfo);
      this.saveDevices();
      this.emit('device:paired', updatedDeviceInfo);

      return { success: true, deviceId };
    } catch (error) {
      return { success: false, error: `Pairing failed: ${error}` };
    }
  }

  /**
   * List all paired devices
   */
  listDevices(): DeviceInfo[] {
    return Array.from(this.pairedDevices.values());
  }

  /**
   * Get device status by ID
   */
  getDeviceStatus(deviceId: string): DeviceInfo | null {
    return this.pairedDevices.get(deviceId) || null;
  }

  /**
   * Remove a device
   */
  removeDevice(deviceId: string): boolean {
    const success = this.devices.delete(deviceId) && this.pairedDevices.delete(deviceId);
    if (success) {
      this.clearInactivityTimer(deviceId);
      this.saveDevices();
      this.emit('device:removed', deviceId);
    }
    return success;
  }

  /**
   * Sync conversations for mobile display
   */
  syncConversations(deviceId: string): ConversationSummary[] {
    const device = this.devices.get(deviceId);
    if (!device) {
      return [];
    }

    if (!this.isSessionValid(device)) {
      return [];
    }

    // Update last seen
    device.deviceInfo.lastSeen = Date.now();
    this.resetInactivityTimer(deviceId);

    // Placeholder: return mock conversation summaries
    return [
      {
        id: 'conv-1',
        title: 'Project Alpha',
        lastMessage: 'Latest update on the architecture...',
        timestamp: Date.now() - 3600000,
        unread: false,
      },
      {
        id: 'conv-2',
        title: 'Team Discussion',
        lastMessage: 'Great work on the implementation',
        timestamp: Date.now() - 7200000,
        unread: true,
      },
    ];
  }

  /**
   * Sync settings for mobile
   */
  syncSettings(deviceId: string): SyncSettings {
    const device = this.devices.get(deviceId);
    if (!device) {
      return {};
    }

    if (!this.isSessionValid(device)) {
      return {};
    }

    this.resetInactivityTimer(deviceId);

    // Return relevant mobile-specific settings
    return {
      theme: 'auto',
      notifications: true,
      autoSync: true,
    };
  }

  /**
   * Push notification to mobile device
   */
  pushNotification(deviceId: string, notification: Notification): boolean {
    const device = this.devices.get(deviceId);
    if (!device) {
      return false;
    }

    if (!this.isSessionValid(device)) {
      return false;
    }

    // In production: send via push service using pushToken
    if (device.deviceInfo.pushToken) {
      this.emit('notification:queued', { deviceId, notification });
      return true;
    }

    return false;
  }

  /**
   * Receive and process voice command from mobile
   */
  async receiveVoiceCommand(deviceId: string, audioBuffer: Buffer): Promise<string> {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error('Device not found');
    }

    if (!this.isSessionValid(device)) {
      throw new Error('Session expired');
    }

    this.resetInactivityTimer(deviceId);

    // Placeholder: in production would use speech-to-text service
    const mockTranscription = 'Show me my recent conversations';
    this.emit('voice:received', { deviceId, transcription: mockTranscription });

    return mockTranscription;
  }

  /**
   * Start local HTTP server for same-network communication
   */
  startLocalServer(port: number = 18791): Promise<void> {
    return new Promise((resolve, reject) => {
      this.serverPort = port;

      this.server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
          // CORS headers
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

          if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
          }

          // Verify authorization
          const token = req.headers.authorization?.replace('Bearer ', '');
          const deviceId = this.verifySessionToken(token);

          if (!deviceId) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }

          // Reset inactivity timer on each request
          this.resetInactivityTimer(deviceId);

          const url = new URL(req.url || '/', `http://${req.headers.host}`);
          const pathname = url.pathname;

          if (pathname === '/api/status' && req.method === 'GET') {
            this.handleStatusRequest(res, deviceId);
          } else if (pathname === '/api/conversations' && req.method === 'GET') {
            this.handleConversationsRequest(res, deviceId);
          } else if (pathname === '/api/message' && req.method === 'POST') {
            this.handleMessageRequest(req, res, deviceId);
          } else if (pathname === '/api/voice' && req.method === 'POST') {
            this.handleVoiceRequest(req, res, deviceId);
          } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not found' }));
          }
        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      this.server.listen(port, '0.0.0.0', () => {
        this.emit('server:started', { port });
        resolve();
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop local HTTP server
   */
  stopLocalServer(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.server = null;
          this.inactivityTimers.forEach((timer) => clearTimeout(timer));
          this.inactivityTimers.clear();
          this.emit('server:stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Validate session and check expiry
   */
  private isSessionValid(device: PairingDevice): boolean {
    return device.tokenExpiry > Date.now();
  }

  /**
   * Verify session token and return device ID if valid
   */
  private verifySessionToken(token?: string): string | null {
    if (!token) return null;

    for (const [deviceId, device] of this.devices.entries()) {
      if (device.sessionToken === token && this.isSessionValid(device)) {
        return deviceId;
      }
    }

    return null;
  }

  /**
   * Generate unique device ID
   */
  private generateDeviceId(): string {
    return `device-${randomBytes(8).toString('hex')}`;
  }

  /**
   * Generate secure session token
   */
  private generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Reset inactivity timer for a device
   */
  private resetInactivityTimer(deviceId: string): void {
    this.clearInactivityTimer(deviceId);

    const timer = setTimeout(() => {
      const device = this.devices.get(deviceId);
      if (device) {
        device.tokenExpiry = 0; // Expire the session
        this.emit('session:expired', { deviceId });
      }
    }, this.INACTIVITY_TIMEOUT);

    this.inactivityTimers.set(deviceId, timer);
  }

  /**
   * Clear inactivity timer
   */
  private clearInactivityTimer(deviceId: string): void {
    const timer = this.inactivityTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.inactivityTimers.delete(deviceId);
    }
  }

  /**
   * Handle GET /api/status
   */
  private handleStatusRequest(res: ServerResponse, deviceId: string): void {
    const device = this.pairedDevices.get(deviceId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'connected',
        deviceId,
        name: device?.name,
        timestamp: Date.now(),
      })
    );
  }

  /**
   * Handle GET /api/conversations
   */
  private handleConversationsRequest(res: ServerResponse, deviceId: string): void {
    const conversations = this.syncConversations(deviceId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ conversations }));
  }

  /**
   * Handle POST /api/message
   */
  private handleMessageRequest(req: IncomingMessage, res: ServerResponse, deviceId: string): void {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const message = JSON.parse(body);
        this.emit('message:received', { deviceId, message });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, messageId: `msg-${randomBytes(8).toString('hex')}` }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid message format' }));
      }
    });
  }

  /**
   * Handle POST /api/voice
   */
  private handleVoiceRequest(req: IncomingMessage, res: ServerResponse, deviceId: string): void {
    let chunks: Buffer[] = [];

    req.on('data', (chunk) => {
      chunks.push(chunk);
    });

    req.on('end', async () => {
      try {
        const audioBuffer = Buffer.concat(chunks);
        const transcription = await this.receiveVoiceCommand(deviceId, audioBuffer);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ transcription }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Voice processing failed' }));
      }
    });
  }

  /**
   * Load devices from persistent storage
   */
  private loadDevices(): void {
    try {
      const devicesPath = join(this.dataDir, 'devices.json');
      if (existsSync(devicesPath)) {
        const data = JSON.parse(readFileSync(devicesPath, 'utf-8'));

        for (const device of data) {
          this.devices.set(device.deviceId, device);
          this.pairedDevices.set(device.deviceId, device.deviceInfo);
        }
      }
    } catch (error) {
      // Silently fail if no saved devices
    }
  }

  /**
   * Save devices to persistent storage
   */
  private saveDevices(): void {
    try {
      const devicesPath = join(this.dataDir, 'devices.json');
      const data = Array.from(this.devices.values());
      writeFileSync(devicesPath, JSON.stringify(data, null, 2));
    } catch (error) {
      this.emit('error', { message: 'Failed to save devices', error });
    }
  }
}

// Export singleton instance
export const mobileBridge = new MobileBridge();
