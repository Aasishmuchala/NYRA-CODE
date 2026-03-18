import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { createHmac } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createServer, request as httpRequest, Server } from 'http';
import { IncomingMessage, ServerResponse } from 'http';

/**
 * Represents an agent's identity and capabilities
 */
interface AgentIdentity {
  orgId: string;
  agentId: string;
  publicKey: string;
  capabilities: string[];
  trustLevel: 'verified' | 'trusted' | 'known' | 'unknown';
}

/**
 * Represents a message between agents
 */
interface AgentMessage {
  from: AgentIdentity;
  to: AgentIdentity;
  type: 'request' | 'response' | 'broadcast' | 'handshake' | 'capability-query';
  payload: unknown;
  signature: string;
  timestamp: number;
  nonce: string;
}

/**
 * Represents a queued message with retry info
 */
interface QueuedMessage {
  message: AgentMessage;
  attempts: number;
  nextRetry: number;
}

/**
 * CrossOrgProtocol - Manages cross-organization agent communication
 */
class CrossOrgProtocol extends EventEmitter {
  private localAgents: Map<string, AgentIdentity> = new Map();
  private knownAgents: Map<string, AgentIdentity> = new Map();
  private messageQueue: QueuedMessage[] = [];
  private rateLimitCounters: Map<string, number[]> = new Map();
  private readonly maxRateLimit = 100;
  private readonly rateLimitWindow = 60000; // 1 minute
  private readonly maxRetries = 3;
  private readonly baseBackoffMs = 1000;
  private dataDir: string = '';
  private httpServer: Server | null = null;
  private serverPort = 18792;
  private remoteEndpoints: Map<string, string> = new Map(); // orgId -> URL

  constructor() {
    super();
    this.startMessageProcessor();
  }

  /**
   * Initialize CrossOrgProtocol and load persisted data
   */
  init(): void {
    this.dataDir = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra', 'platform');

    // Create directory if it doesn't exist
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Load protocol data from disk
    const protocolPath = join(this.dataDir, 'cross-org.json');
    if (existsSync(protocolPath)) {
      try {
        const data = JSON.parse(readFileSync(protocolPath, 'utf-8')) as {
          localAgents?: Record<string, AgentIdentity>;
          knownAgents?: Record<string, AgentIdentity>;
          remoteEndpoints?: Record<string, string>;
        };
        if (data.localAgents) {
          this.localAgents = new Map(Object.entries(data.localAgents));
        }
        if (data.knownAgents) {
          this.knownAgents = new Map(Object.entries(data.knownAgents));
        }
        if (data.remoteEndpoints) {
          this.remoteEndpoints = new Map(Object.entries(data.remoteEndpoints));
        }
      } catch (error) {
        console.error('Failed to load cross-org protocol data:', error);
      }
    }

    // Start HTTP server for incoming messages
    this.startServer(this.serverPort);
  }

  /**
   * Shutdown CrossOrgProtocol and persist data to disk
   */
  shutdown(): void {
    if (!this.dataDir) return;

    // Close HTTP server
    if (this.httpServer) {
      this.httpServer.close();
      this.httpServer = null;
    }

    try {
      const protocolPath = join(this.dataDir, 'cross-org.json');
      const data = {
        localAgents: Object.fromEntries(this.localAgents),
        knownAgents: Object.fromEntries(this.knownAgents),
        remoteEndpoints: Object.fromEntries(this.remoteEndpoints),
      };
      writeFileSync(protocolPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save cross-org protocol data:', error);
    }
  }

  /**
   * Start HTTP server to receive messages from other NYRA instances
   */
  startServer(port: number): void {
    this.httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'POST' && req.url === '/message') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });

        req.on('end', () => {
          try {
            const message = JSON.parse(body) as AgentMessage;
            const verified = this.receiveMessage(message);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: verified }));
          } catch (error) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid message' }));
          }
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    this.httpServer.listen(port, () => {
      console.log(`CrossOrgProtocol HTTP server listening on port ${port}`);
    });

    this.httpServer.on('error', (error) => {
      console.error('CrossOrgProtocol HTTP server error:', error);
    });
  }

  /**
   * Register a remote NYRA instance endpoint
   */
  registerRemoteEndpoint(orgId: string, url: string): void {
    this.remoteEndpoints.set(orgId, url);
  }

  /**
   * Discover remote endpoints (placeholder for mDNS-style discovery or registry)
   */
  discoverEndpoints(): Map<string, string> {
    return new Map(this.remoteEndpoints);
  }

  /**
   * Register a local agent in the network
   */
  register(identity: AgentIdentity): void {
    this.localAgents.set(identity.agentId, identity);
    this.knownAgents.set(`${identity.orgId}:${identity.agentId}`, identity);
    this.emit('agent-registered', identity);
  }

  /**
   * Discover agents with matching capabilities
   */
  discover(capabilities: string[]): AgentIdentity[] {
    const matches: AgentIdentity[] = [];

    for (const agent of Array.from(this.knownAgents.values())) {
      const hasCapabilities = capabilities.some((cap) =>
        agent.capabilities.some((agentCap: string) =>
          agentCap.toLowerCase().includes(cap.toLowerCase()) ||
          cap.toLowerCase().includes(agentCap.toLowerCase())
        )
      );

      if (hasCapabilities) {
        matches.push(agent);
      }
    }

    return matches;
  }

  /**
   * Send a signed message to another agent via HTTP
   */
  sendMessage(to: AgentIdentity, type: AgentMessage['type'], payload: unknown): AgentMessage {
    const from = this.getLocalAgent();
    if (!from) {
      throw new Error('No local agent registered');
    }

    if (!this.checkRateLimit(to.orgId)) {
      throw new Error(`Rate limit exceeded for org ${to.orgId}`);
    }

    const message: AgentMessage = {
      from,
      to,
      type,
      payload,
      signature: '',
      timestamp: Date.now(),
      nonce: randomUUID(),
    };

    message.signature = this.signMessage(message);

    const queued: QueuedMessage = {
      message,
      attempts: 0,
      nextRetry: Date.now(),
    };

    this.messageQueue.push(queued);
    this.emit('message-queued', message);

    // Try to send immediately
    this.deliverMessage(message);

    return message;
  }

  /**
   * Deliver a message to remote endpoint via HTTP POST
   */
  private deliverMessage(message: AgentMessage): void {
    const targetUrl = this.remoteEndpoints.get(message.to.orgId);
    if (!targetUrl) {
      console.warn(`No endpoint registered for org ${message.to.orgId}`);
      return;
    }

    const postData = JSON.stringify(message);

    const url = new URL('/message', targetUrl);
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = httpRequest(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(data) as { success: boolean };
          if (response.success) {
            this.emit('message-delivered', message);
          }
        } catch (error) {
          console.error('Failed to parse delivery response:', error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Failed to deliver message:', error);
    });

    req.write(postData);
    req.end();
  }

  /**
   * Receive and verify a message
   */
  receiveMessage(message: AgentMessage): boolean {
    if (!this.verifySignature(message)) {
      this.emit('message-verification-failed', message);
      return false;
    }

    if (!this.verifyIdentity(message.from)) {
      this.emit('identity-verification-failed', message.from);
      return false;
    }

    const age = Date.now() - message.timestamp;
    if (age > 300000) {
      // 5 minutes
      this.emit('message-expired', message);
      return false;
    }

    this.emit('message-received', message);
    return true;
  }

  /**
   * Verify an agent's identity and trust level
   */
  verifyIdentity(identity: AgentIdentity): boolean {
    const known = this.knownAgents.get(`${identity.orgId}:${identity.agentId}`);

    if (!known) {
      return false;
    }

    if (known.publicKey !== identity.publicKey) {
      return false;
    }

    return identity.trustLevel !== 'unknown';
  }

  /**
   * Get local agent (first registered agent)
   */
  private getLocalAgent(): AgentIdentity | null {
    return this.localAgents.values().next().value || null;
  }

  /**
   * Sign a message using HMAC
   */
  private signMessage(message: Omit<AgentMessage, 'signature'>): string {
    const payload = JSON.stringify({
      from: message.from.agentId,
      to: message.to.agentId,
      type: message.type,
      timestamp: message.timestamp,
      nonce: message.nonce,
    });

    const hmac = createHmac('sha256', message.from.publicKey);
    return hmac.update(payload).digest('hex');
  }

  /**
   * Verify message signature
   */
  private verifySignature(message: AgentMessage): boolean {
    const payload = JSON.stringify({
      from: message.from.agentId,
      to: message.to.agentId,
      type: message.type,
      timestamp: message.timestamp,
      nonce: message.nonce,
    });

    const hmac = createHmac('sha256', message.from.publicKey);
    const expectedSignature = hmac.update(payload).digest('hex');

    return expectedSignature === message.signature;
  }

  /**
   * Check rate limit for an organization
   */
  private checkRateLimit(orgId: string): boolean {
    const now = Date.now();
    let timestamps = this.rateLimitCounters.get(orgId) || [];

    // Remove old timestamps outside the window
    timestamps = timestamps.filter((ts) => now - ts < this.rateLimitWindow);

    if (timestamps.length >= this.maxRateLimit) {
      return false;
    }

    timestamps.push(now);
    this.rateLimitCounters.set(orgId, timestamps);
    return true;
  }

  /**
   * Process message queue with retry logic
   */
  private startMessageProcessor(): void {
    setInterval(() => {
      const now = Date.now();

      for (let i = this.messageQueue.length - 1; i >= 0; i--) {
        const queued = this.messageQueue[i];

        if (queued.nextRetry <= now) {
          if (queued.attempts < this.maxRetries) {
            queued.attempts++;
            const backoff = this.baseBackoffMs * Math.pow(2, queued.attempts - 1);
            queued.nextRetry = now + backoff;
            this.emit('message-retry', queued.message, queued.attempts);
          } else {
            this.messageQueue.splice(i, 1);
            this.emit('message-failed', queued.message);
          }
        }
      }
    }, 1000);
  }

  /**
   * Get message queue status
   */
  getQueueStatus(): {
    queuedMessages: number;
    oldestMessage: number | null;
  } {
    if (this.messageQueue.length === 0) {
      return { queuedMessages: 0, oldestMessage: null };
    }

    const oldestMessage = Math.min(...this.messageQueue.map((m) => m.message.timestamp));
    return {
      queuedMessages: this.messageQueue.length,
      oldestMessage,
    };
  }

  /**
   * Clear all message queue
   */
  clearQueue(): void {
    this.messageQueue = [];
  }
}

/**
 * Agent definition for marketplace
 */
interface AgentDefinition {
  agentId: string;
  orgId: string;
  name: string;
  description: string;
  capabilities: string[];
  trustLevel: AgentIdentity['trustLevel'];
  publicKey: string;
  accessControl: 'public' | 'restricted' | 'private';
  allowedOrgs?: string[];
}

/**
 * AgentMarketplace - Manages agent availability and access
 */
class AgentMarketplace extends EventEmitter {
  private agents: Map<string, AgentDefinition> = new Map();
  private accessRequests: Map<string, { agentId: string; orgId: string; timestamp: number; status: 'pending' | 'approved' | 'denied' }[]> = new Map();
  private grants: Map<string, Set<string>> = new Map(); // agentId -> Set<orgId>
  private dataDir: string = '';

  /**
   * Initialize AgentMarketplace and load persisted data
   */
  init(): void {
    this.dataDir = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra', 'platform');

    // Create directory if it doesn't exist
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Load marketplace data from disk
    const marketplacePath = join(this.dataDir, 'agent-marketplace.json');
    if (existsSync(marketplacePath)) {
      try {
        const data = JSON.parse(readFileSync(marketplacePath, 'utf-8')) as {
          agents?: Record<string, AgentDefinition>;
          accessRequests?: Record<string, Array<{ agentId: string; orgId: string; timestamp: number; status: 'pending' | 'approved' | 'denied' }>>;
          grants?: Record<string, string[]>;
        };
        if (data.agents) {
          this.agents = new Map(Object.entries(data.agents));
        }
        if (data.accessRequests) {
          this.accessRequests = new Map(Object.entries(data.accessRequests));
        }
        if (data.grants) {
          for (const [key, orgIds] of Object.entries(data.grants)) {
            this.grants.set(key, new Set(orgIds));
          }
        }
      } catch (error) {
        console.error('Failed to load agent marketplace data:', error);
      }
    }
  }

  /**
   * Shutdown AgentMarketplace and persist data to disk
   */
  shutdown(): void {
    if (!this.dataDir) return;

    try {
      const marketplacePath = join(this.dataDir, 'agent-marketplace.json');
      const data = {
        agents: Object.fromEntries(this.agents),
        accessRequests: Object.fromEntries(this.accessRequests),
        grants: Object.fromEntries(
          Array.from(this.grants.entries()).map(([key, set]) => [key, Array.from(set)])
        ),
      };
      writeFileSync(marketplacePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save agent marketplace data:', error);
    }
  }

  /**
   * List available agents with optional filters
   */
  listAgents(filters?: {
    capabilities?: string[];
    trustLevel?: AgentIdentity['trustLevel'];
    orgId?: string;
  }): AgentDefinition[] {
    let results = Array.from(this.agents.values());

    if (filters?.capabilities) {
      results = results.filter((agent) =>
        filters.capabilities!.some((cap) =>
          agent.capabilities.some((agentCap) =>
            agentCap.toLowerCase().includes(cap.toLowerCase())
          )
        )
      );
    }

    if (filters?.trustLevel) {
      results = results.filter((agent) => agent.trustLevel === filters.trustLevel);
    }

    if (filters?.orgId) {
      results = results.filter((agent) => agent.orgId === filters.orgId);
    }

    return results.filter((agent) => agent.accessControl !== 'private');
  }

  /**
   * Publish an agent to the marketplace
   */
  publishAgent(definition: AgentDefinition): void {
    const key = `${definition.orgId}:${definition.agentId}`;

    if (this.agents.has(key)) {
      throw new Error(`Agent ${key} already published`);
    }

    this.agents.set(key, definition);

    if (definition.accessControl === 'restricted' && definition.allowedOrgs) {
      this.grants.set(key, new Set<string>(definition.allowedOrgs));
    }

    this.emit('agent-published', definition);
  }

  /**
   * Request access to a cross-org agent
   */
  requestAccess(agentId: string, orgId: string, requesterOrgId: string): void {
    const key = `${orgId}:${agentId}`;
    const agent = this.agents.get(key);

    if (!agent) {
      throw new Error(`Agent ${key} not found`);
    }

    if (agent.accessControl === 'public') {
      const existing = this.grants.get(key) || new Set<string>();
      const updated = new Set<string>([...Array.from(existing), requesterOrgId]);
      this.grants.set(key, updated);
      this.emit('access-granted', { agentId, orgId, requesterOrgId });
      return;
    }

    if (!this.accessRequests.has(key)) {
      this.accessRequests.set(key, []);
    }

    const request = {
      agentId,
      orgId: requesterOrgId,
      timestamp: Date.now(),
      status: 'pending' as const,
    };

    this.accessRequests.get(key)!.push(request);
    this.emit('access-requested', request);
  }

  /**
   * Revoke access to an agent
   */
  revokeAccess(agentId: string, orgId: string, targetOrgId: string): void {
    const key = `${orgId}:${agentId}`;
    const grants = this.grants.get(key);

    if (grants) {
      grants.delete(targetOrgId);
    }

    this.emit('access-revoked', { agentId, orgId, targetOrgId });
  }

  /**
   * Approve or deny an access request
   */
  approveAccessRequest(agentId: string, orgId: string, requesterOrgId: string, approve: boolean): void {
    const key = `${orgId}:${agentId}`;
    const requests = this.accessRequests.get(key);

    if (!requests) return;

    const request = requests.find((r) => r.agentId === agentId && r.orgId === requesterOrgId);
    if (!request) return;

    if (approve) {
      request.status = 'approved';
      if (!this.grants.has(key)) {
        this.grants.set(key, new Set());
      }
      this.grants.get(key)!.add(requesterOrgId);
      this.emit('access-granted', { agentId, orgId, requesterOrgId });
    } else {
      request.status = 'denied';
      this.emit('access-denied', { agentId, orgId, requesterOrgId });
    }
  }

  /**
   * Check if an organization has access to an agent
   */
  hasAccess(agentId: string, orgId: string, requesterOrgId: string): boolean {
    const key = `${orgId}:${agentId}`;
    const agent = this.agents.get(key);

    if (!agent) return false;
    if (agent.accessControl === 'public') return true;

    const grants = this.grants.get(key);
    return grants?.has(requesterOrgId) ?? false;
  }

  /**
   * Get access requests for an agent
   */
  getAccessRequests(agentId: string, orgId: string): Array<{ agentId: string; orgId: string; timestamp: number; status: 'pending' | 'approved' | 'denied' }> {
    const key = `${orgId}:${agentId}`;
    return this.accessRequests.get(key) || [];
  }
}

// Export singletons
export const crossOrgProtocol = new CrossOrgProtocol();
export const agentMarketplace = new AgentMarketplace();

// Export classes
export { CrossOrgProtocol, AgentMarketplace };
export type { AgentIdentity, AgentMessage, AgentDefinition };
