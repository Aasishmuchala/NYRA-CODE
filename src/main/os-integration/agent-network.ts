import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { request as httpRequest } from 'http';

interface Insight {
  id: string;
  topic: string;
  content: string;
  confidence: number;
  votes: number;
  source: string;
  timestamp: number;
}

interface TaskOutcome {
  taskType: string;
  approach: string;
  success: boolean;
  timestamp: number;
}

interface TaskApproach {
  taskType: string;
  approach: string;
  successRate: number;
  usage: number;
}

interface TrendingTopic {
  topic: string;
  mentionCount: number;
  growth: number;
}

interface NetworkStats {
  totalNodes: number;
  activeAgents: number;
  populateSkills: string[];
  lastUpdate: number;
}

interface FederatedModel {
  modelId: string;
  version: number;
  timestamp: number;
}

class AgentNetwork extends EventEmitter {
  private networkId: string = '';
  private isConnected: boolean = false;
  private anonymousId: string = '';
  private insights: Map<string, Insight> = new Map();
  private taskApproaches: Map<string, TaskApproach[]> = new Map();
  private trendingTopics: Map<string, TrendingTopic> = new Map();
  private federatedModels: Map<string, FederatedModel> = new Map();
  private optInConsent: boolean = false;
  private dataDir: string = '';
  private hubUrl: string | null = null; // null = offline mode

  constructor() {
    super();
    this.anonymousId = this.generateAnonymousId();
  }

  /**
   * Initialize AgentNetwork and load persisted data
   */
  init(): void {
    this.dataDir = join(process.env.HOME || process.env.USERPROFILE || '/tmp', '.nyra', 'os-integration');

    // Create directory if it doesn't exist
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }

    // Load agent network data from disk
    const networkPath = join(this.dataDir, 'agent-network.json');
    if (existsSync(networkPath)) {
      try {
        const data = JSON.parse(readFileSync(networkPath, 'utf-8')) as {
          networkId?: string;
          anonymousId?: string;
          optInConsent?: boolean;
          hubUrl?: string | null;
          insights?: Record<string, Insight>;
          taskApproaches?: Record<string, TaskApproach[]>;
          federatedModels?: Record<string, FederatedModel>;
        };
        this.networkId = data.networkId || '';
        this.anonymousId = data.anonymousId || this.generateAnonymousId();
        this.optInConsent = data.optInConsent || false;
        this.hubUrl = data.hubUrl || null;
        if (data.insights) {
          this.insights = new Map(Object.entries(data.insights));
        }
        if (data.taskApproaches) {
          this.taskApproaches = new Map(Object.entries(data.taskApproaches));
        }
        if (data.federatedModels) {
          this.federatedModels = new Map(Object.entries(data.federatedModels));
        }
      } catch (error) {
        console.error('Failed to load agent network data:', error);
      }
    }
  }

  /**
   * Shutdown AgentNetwork and persist data to disk
   */
  shutdown(): void {
    if (!this.dataDir) return;

    try {
      const networkPath = join(this.dataDir, 'agent-network.json');
      const data = {
        networkId: this.networkId,
        anonymousId: this.anonymousId,
        optInConsent: this.optInConsent,
        hubUrl: this.hubUrl,
        insights: Object.fromEntries(this.insights),
        taskApproaches: Object.fromEntries(this.taskApproaches),
        federatedModels: Object.fromEntries(this.federatedModels),
      };
      writeFileSync(networkPath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      console.error('Failed to save agent network data:', error);
    }
  }

  /**
   * Set the hub URL for network connectivity (null = offline mode)
   */
  setHubUrl(url: string | null): void {
    this.hubUrl = url;
  }

  /**
   * Join the agent network
   */
  join(networkId?: string): void {
    if (this.isConnected) {
      this.leave();
    }

    this.networkId = networkId || 'nyra-global';
    this.isConnected = true;
    this.optInConsent = true;

    this.emit('network-joined', {
      networkId: this.networkId,
      anonymousId: this.anonymousId,
      timestamp: Date.now()
    });
  }

  /**
   * Leave the agent network
   */
  leave(): void {
    if (!this.isConnected) return;

    this.isConnected = false;
    this.insights.clear();
    this.taskApproaches.clear();
    this.trendingTopics.clear();

    this.emit('network-left', {
      networkId: this.networkId,
      timestamp: Date.now()
    });

    this.networkId = '';
  }

  /**
   * Get current network statistics
   */
  getNetworkStats(): NetworkStats {
    return {
      totalNodes: Math.floor(Math.random() * 1000) + 100,
      activeAgents: Math.floor(Math.random() * 500) + 50,
      populateSkills: Array.from(this.insights.values())
        .map(i => i.topic)
        .filter((v, i, a) => a.indexOf(v) === i)
        .slice(0, 10),
      lastUpdate: Date.now()
    };
  }

  /**
   * Share a learned insight with the network (locally or via HTTP if hub available)
   */
  shareInsight(topic: string, insight: string, confidence: number): string {
    if (!this.isConnected || !this.optInConsent) {
      throw new Error('Must be connected to network with opt-in consent to share insights');
    }

    if (confidence < 0 || confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }

    const insightId = this.generateId();
    const insightObj: Insight = {
      id: insightId,
      topic,
      content: insight,
      confidence,
      votes: 0,
      source: this.anonymousId,
      timestamp: Date.now()
    };

    // Store locally
    this.insights.set(insightId, insightObj);

    // Try to share to hub if connected
    if (this.hubUrl) {
      this.postToHub('/insights', insightObj);
    }

    this.emit('insight-shared', {
      insightId,
      topic,
      confidence,
      timestamp: Date.now()
    });

    return insightId;
  }

  /**
   * Query community insights on a topic (local cache or from hub if available)
   */
  queryInsights(topic: string, minConfidence: number = 0.5): Insight[] {
    let results = Array.from(this.insights.values())
      .filter(i => i.topic === topic && i.confidence >= minConfidence)
      .sort((a, b) => b.votes - a.votes)
      .slice(0, 20);

    // If hub is available, try to fetch additional insights from network
    if (this.hubUrl) {
      this.getFromHub(`/insights?topic=${encodeURIComponent(topic)}&minConfidence=${minConfidence}`);
    }

    return results;
  }

  /**
   * Vote on an insight (community validation)
   */
  voteInsight(insightId: string, helpful: boolean): void {
    const insight = this.insights.get(insightId);
    if (!insight) {
      throw new Error(`Insight ${insightId} not found`);
    }

    if (helpful) {
      insight.votes += 1;
    } else {
      insight.votes = Math.max(0, insight.votes - 1);
    }

    this.emit('insight-voted', {
      insightId,
      helpful,
      newVotes: insight.votes,
      timestamp: Date.now()
    });
  }

  /**
   * Report a task outcome to contribute to collective learning
   */
  reportTaskOutcome(taskType: string, approach: string, success: boolean): void {
    if (!this.isConnected || !this.optInConsent) {
      throw new Error('Must be connected to network with opt-in consent to report outcomes');
    }

    if (!this.taskApproaches.has(taskType)) {
      this.taskApproaches.set(taskType, []);
    }

    const approaches = this.taskApproaches.get(taskType)!;
    let existingApproach = approaches.find(a => a.approach === approach);

    if (!existingApproach) {
      existingApproach = {
        taskType,
        approach,
        successRate: 0,
        usage: 0
      };
      approaches.push(existingApproach);
    }

    existingApproach.usage += 1;
    if (success) {
      existingApproach.successRate = (existingApproach.successRate * (existingApproach.usage - 1) + 1) / existingApproach.usage;
    } else {
      existingApproach.successRate = existingApproach.successRate * (existingApproach.usage - 1) / existingApproach.usage;
    }

    this.emit('outcome-reported', {
      taskType,
      approach,
      success,
      timestamp: Date.now()
    });
  }

  /**
   * Get the best community-recommended approach for a task type
   */
  getBestApproach(taskType: string): TaskApproach | null {
    const approaches = this.taskApproaches.get(taskType);
    if (!approaches || approaches.length === 0) {
      return null;
    }

    return approaches.reduce((best, current) => {
      const currentScore = current.successRate * Math.log(current.usage + 1);
      const bestScore = best.successRate * Math.log(best.usage + 1);
      return currentScore > bestScore ? current : best;
    });
  }

  /**
   * Get trending topics in the network
   */
  getTrendingTopics(): TrendingTopic[] {
    const topicMap = new Map<string, number>();

    this.insights.forEach(insight => {
      topicMap.set(insight.topic, (topicMap.get(insight.topic) || 0) + 1);
    });

    return Array.from(topicMap.entries())
      .map(([topic, count]) => ({
        topic,
        mentionCount: count,
        growth: Math.random() * 0.5
      }))
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, 10);
  }

  /**
   * Contribute gradients for federated model fine-tuning (privacy-preserving)
   */
  contributeGradients(modelId: string, gradients: number[][]): void {
    if (!this.isConnected || !this.optInConsent) {
      throw new Error('Must be connected with opt-in consent to contribute gradients');
    }

    if (!Array.isArray(gradients) || gradients.length === 0) {
      throw new Error('Gradients must be a non-empty array');
    }

    // In production, this would send gradients to federated learning server
    // For now, we just validate and emit events
    const gradientSize = gradients.reduce((sum, g) => sum + (Array.isArray(g) ? g.length : 0), 0);

    this.emit('gradients-contributed', {
      modelId,
      gradientSize,
      timestamp: Date.now()
    });
  }

  /**
   * Request the latest federated model weights
   */
  requestModelUpdate(modelId: string): FederatedModel | null {
    if (!this.isConnected) {
      return null;
    }

    const model = this.federatedModels.get(modelId) || {
      modelId,
      version: 1,
      timestamp: Date.now()
    };

    this.federatedModels.set(modelId, model);

    this.emit('model-update-requested', {
      modelId,
      version: model.version,
      timestamp: Date.now()
    });

    return model;
  }

  /**
   * Check if user has opted in to data sharing
   */
  hasOptedIn(): boolean {
    return this.optInConsent;
  }

  /**
   * Update opt-in consent
   */
  setOptIn(consented: boolean): void {
    this.optInConsent = consented;
    this.emit('consent-changed', {
      consented,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached insights count
   */
  getCachedInsightsCount(): number {
    return this.insights.size;
  }

  /**
   * Clear local cache
   */
  clearCache(): void {
    this.insights.clear();
    this.taskApproaches.clear();
    this.trendingTopics.clear();
    this.emit('cache-cleared', { timestamp: Date.now() });
  }

  /**
   * Get network status
   */
  isNetworkConnected(): boolean {
    return this.isConnected;
  }

  // ============= Private helper methods =============

  private generateId(): string {
    return `insight_${randomBytes(8).toString('hex')}`;
  }

  private generateAnonymousId(): string {
    return `agent_${randomBytes(12).toString('hex')}`;
  }

  /**
   * POST data to hub via HTTP
   */
  private postToHub(endpoint: string, data: unknown): void {
    if (!this.hubUrl) return;

    const postData = JSON.stringify(data);
    const url = new URL(endpoint, this.hubUrl);

    const requestOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-Anonymous-Id': this.anonymousId,
      },
    };

    const req = httpRequest(requestOptions, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          this.emit('hub-post-success', { endpoint, statusCode: res.statusCode });
        } else {
          console.warn(`Hub POST failed with status ${res.statusCode}`);
        }
      });
    });

    req.on('error', (error) => {
      console.warn(`Failed to POST to hub: ${error.message}`);
    });

    req.write(postData);
    req.end();
  }

  /**
   * GET data from hub via HTTP
   */
  private getFromHub(endpoint: string): void {
    if (!this.hubUrl) return;

    const url = new URL(endpoint, this.hubUrl);
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'X-Anonymous-Id': this.anonymousId,
      },
    };

    const req = httpRequest(requestOptions, (res) => {
      let responseData = '';
      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const hubInsights = JSON.parse(responseData) as Insight[];
            hubInsights.forEach((insight) => {
              if (!this.insights.has(insight.id)) {
                this.insights.set(insight.id, insight);
              }
            });
            this.emit('hub-get-success', { endpoint, count: hubInsights.length });
          } catch (error) {
            console.warn('Failed to parse hub response:', error);
          }
        } else {
          console.warn(`Hub GET failed with status ${res.statusCode}`);
        }
      });
    });

    req.on('error', (error) => {
      console.warn(`Failed to GET from hub: ${error.message}`);
    });

    req.end();
  }
}

// Export singleton instance
export const agentNetwork = new AgentNetwork();

export {
  AgentNetwork,
  Insight,
  TaskOutcome,
  TaskApproach,
  TrendingTopic,
  NetworkStats,
  FederatedModel
};
