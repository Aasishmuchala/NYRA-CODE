import { memoryManager } from './memory';

interface MetricData {
  agentId: string;
  taskId?: string;
  providerId: string;
  modelId: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  cost?: number;
  success: boolean;
  errorType?: string;
}

interface AgentStats {
  totalTasks: number;
  successRate: number;
  avgLatency: number;
  totalTokens: number;
  totalCost: number;
  errorBreakdown: Record<string, number>;
}

interface TimeSeriesPoint {
  time: string;
  tasks: number;
  successRate: number;
  avgLatency: number;
  tokens: number;
}

interface RankedAgent {
  agentId: string;
  successRate: number;
  totalTasks: number;
  avgLatency: number;
  totalTokens: number;
  totalCost: number;
}

interface OverallStats {
  totalTasks: number;
  totalTokens: number;
  totalCost: number;
  avgSuccessRate: number;
  avgLatency: number;
}

interface CostBreakdown {
  byProvider: Record<string, number>;
  byModel: Record<string, number>;
  byAgent: Record<string, number>;
  daily: Array<{ date: string; cost: number }>;
}

export class AgentAnalytics {
  private db: any;

  constructor() {
    this.db = (memoryManager as any).db;
  }

  init(): void {
    try {
      // Create agent_metrics table
      this.db
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS agent_metrics (
          id INTEGER PRIMARY KEY,
          agentId TEXT NOT NULL,
          taskId TEXT,
          providerId TEXT NOT NULL,
          modelId TEXT NOT NULL,
          tokensIn INTEGER NOT NULL,
          tokensOut INTEGER NOT NULL,
          latencyMs INTEGER NOT NULL,
          cost REAL DEFAULT 0,
          success INTEGER NOT NULL,
          errorType TEXT,
          timestamp INTEGER NOT NULL
        )
      `
        )
        .run();

      // Create agent_daily_summary table
      this.db
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS agent_daily_summary (
          id INTEGER PRIMARY KEY,
          agentId TEXT NOT NULL,
          date TEXT NOT NULL,
          totalTasks INTEGER NOT NULL,
          successCount INTEGER NOT NULL,
          failCount INTEGER NOT NULL,
          avgLatencyMs REAL NOT NULL,
          totalTokens INTEGER NOT NULL,
          totalCost REAL NOT NULL,
          UNIQUE(agentId, date)
        )
      `
        )
        .run();

      // Create indexes for performance
      this.db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_agent_metrics_agentId_timestamp
         ON agent_metrics(agentId, timestamp)`
        )
        .run();

      this.db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_agent_metrics_providerId_timestamp
         ON agent_metrics(providerId, timestamp)`
        )
        .run();

      this.db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_agent_metrics_modelId_timestamp
         ON agent_metrics(modelId, timestamp)`
        )
        .run();

      this.db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_agent_metrics_timestamp
         ON agent_metrics(timestamp)`
        )
        .run();

      this.db
        .prepare(
          `CREATE INDEX IF NOT EXISTS idx_agent_daily_summary_agentId_date
         ON agent_daily_summary(agentId, date)`
        )
        .run();
    } catch (error) {
      console.error('Error initializing analytics tables:', error);
    }
  }

  recordMetric(data: MetricData): void {
    try {
      const timestamp = Date.now();
      const cost = data.cost ?? 0;

      this.db
        .prepare(
          `
        INSERT INTO agent_metrics (
          agentId, taskId, providerId, modelId, tokensIn, tokensOut,
          latencyMs, cost, success, errorType, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(
          data.agentId,
          data.taskId || null,
          data.providerId,
          data.modelId,
          data.tokensIn,
          data.tokensOut,
          data.latencyMs,
          cost,
          data.success ? 1 : 0,
          data.errorType || null,
          timestamp
        );
    } catch (error) {
      console.error('Error recording metric:', error);
    }
  }

  getAgentStats(
    agentId: string,
    fromTimestamp?: number,
    toTimestamp?: number
  ): AgentStats {
    try {
      const now = Date.now();
      const from = fromTimestamp || now - 30 * 24 * 60 * 60 * 1000; // 30 days
      const to = toTimestamp || now;

      const metrics = this.db
        .prepare(
          `
        SELECT
          COUNT(*) as totalTasks,
          SUM(success) as successCount,
          AVG(latencyMs) as avgLatency,
          SUM(tokensIn + tokensOut) as totalTokens,
          SUM(cost) as totalCost,
          errorType
        FROM agent_metrics
        WHERE agentId = ? AND timestamp BETWEEN ? AND ?
        GROUP BY errorType
      `
        )
        .all(agentId, from, to);

      let totalTasks = 0;
      let totalSuccesses = 0;
      let totalLatency = 0;
      let totalTokens = 0;
      let totalCost = 0;
      const errorBreakdown: Record<string, number> = {};

      metrics.forEach((row: any) => {
        totalTasks += row.totalTasks;
        totalSuccesses += row.successCount || 0;
        totalLatency += (row.avgLatency || 0) * row.totalTasks;
        totalTokens += row.totalTokens || 0;
        totalCost += row.totalCost || 0;

        if (row.errorType) {
          errorBreakdown[row.errorType] = (errorBreakdown[row.errorType] || 0) + 1;
        }
      });

      return {
        totalTasks,
        successRate: totalTasks > 0 ? (totalSuccesses / totalTasks) * 100 : 0,
        avgLatency: totalTasks > 0 ? totalLatency / totalTasks : 0,
        totalTokens,
        totalCost,
        errorBreakdown,
      };
    } catch (error) {
      console.error('Error getting agent stats:', error);
      return {
        totalTasks: 0,
        successRate: 0,
        avgLatency: 0,
        totalTokens: 0,
        totalCost: 0,
        errorBreakdown: {},
      };
    }
  }

  getProviderStats(
    providerId: string,
    fromTimestamp?: number
  ): AgentStats {
    try {
      const now = Date.now();
      const from = fromTimestamp || now - 30 * 24 * 60 * 60 * 1000;

      const result = this.db
        .prepare(
          `
        SELECT
          COUNT(*) as totalTasks,
          SUM(success) as successCount,
          AVG(latencyMs) as avgLatency,
          SUM(tokensIn + tokensOut) as totalTokens,
          SUM(cost) as totalCost,
          errorType
        FROM agent_metrics
        WHERE providerId = ? AND timestamp > ?
        GROUP BY errorType
      `
        )
        .all(providerId, from);

      let totalTasks = 0;
      let totalSuccesses = 0;
      let totalLatency = 0;
      let totalTokens = 0;
      let totalCost = 0;
      const errorBreakdown: Record<string, number> = {};

      result.forEach((row: any) => {
        totalTasks += row.totalTasks;
        totalSuccesses += row.successCount || 0;
        totalLatency += (row.avgLatency || 0) * row.totalTasks;
        totalTokens += row.totalTokens || 0;
        totalCost += row.totalCost || 0;

        if (row.errorType) {
          errorBreakdown[row.errorType] = (errorBreakdown[row.errorType] || 0) + 1;
        }
      });

      return {
        totalTasks,
        successRate: totalTasks > 0 ? (totalSuccesses / totalTasks) * 100 : 0,
        avgLatency: totalTasks > 0 ? totalLatency / totalTasks : 0,
        totalTokens,
        totalCost,
        errorBreakdown,
      };
    } catch (error) {
      console.error('Error getting provider stats:', error);
      return {
        totalTasks: 0,
        successRate: 0,
        avgLatency: 0,
        totalTokens: 0,
        totalCost: 0,
        errorBreakdown: {},
      };
    }
  }

  getModelStats(modelId: string, fromTimestamp?: number): AgentStats {
    try {
      const now = Date.now();
      const from = fromTimestamp || now - 30 * 24 * 60 * 60 * 1000;

      const result = this.db
        .prepare(
          `
        SELECT
          COUNT(*) as totalTasks,
          SUM(success) as successCount,
          AVG(latencyMs) as avgLatency,
          SUM(tokensIn + tokensOut) as totalTokens,
          SUM(cost) as totalCost,
          errorType
        FROM agent_metrics
        WHERE modelId = ? AND timestamp > ?
        GROUP BY errorType
      `
        )
        .all(modelId, from);

      let totalTasks = 0;
      let totalSuccesses = 0;
      let totalLatency = 0;
      let totalTokens = 0;
      let totalCost = 0;
      const errorBreakdown: Record<string, number> = {};

      result.forEach((row: any) => {
        totalTasks += row.totalTasks;
        totalSuccesses += row.successCount || 0;
        totalLatency += (row.avgLatency || 0) * row.totalTasks;
        totalTokens += row.totalTokens || 0;
        totalCost += row.totalCost || 0;

        if (row.errorType) {
          errorBreakdown[row.errorType] = (errorBreakdown[row.errorType] || 0) + 1;
        }
      });

      return {
        totalTasks,
        successRate: totalTasks > 0 ? (totalSuccesses / totalTasks) * 100 : 0,
        avgLatency: totalTasks > 0 ? totalLatency / totalTasks : 0,
        totalTokens,
        totalCost,
        errorBreakdown,
      };
    } catch (error) {
      console.error('Error getting model stats:', error);
      return {
        totalTasks: 0,
        successRate: 0,
        avgLatency: 0,
        totalTokens: 0,
        totalCost: 0,
        errorBreakdown: {},
      };
    }
  }

  getTimeSeries(
    agentId: string,
    days: number = 7,
    granularity: 'hourly' | 'daily' = 'hourly'
  ): TimeSeriesPoint[] {
    try {
      const now = Date.now();
      const from = now - days * 24 * 60 * 60 * 1000;

      const intervalMs =
        granularity === 'hourly' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

      const query = `
        SELECT
          CAST((timestamp - ?) / ? AS INTEGER) * ? as bucket,
          COUNT(*) as tasks,
          SUM(success) as successCount,
          AVG(latencyMs) as avgLatency,
          SUM(tokensIn + tokensOut) as tokens
        FROM agent_metrics
        WHERE agentId = ? AND timestamp BETWEEN ? AND ?
        GROUP BY bucket
        ORDER BY bucket ASC
      `;

      const results = this.db
        .prepare(query)
        .all(from, intervalMs, intervalMs, agentId, from, now);

      return results.map((row: any) => {
        const timeMs = from + row.bucket;
        const timeStr =
          granularity === 'hourly'
            ? new Date(timeMs).toLocaleTimeString()
            : new Date(timeMs).toLocaleDateString();

        return {
          time: timeStr,
          tasks: row.tasks,
          successRate:
            row.tasks > 0 ? (row.successCount / row.tasks) * 100 : 0,
          avgLatency: row.avgLatency || 0,
          tokens: row.tokens || 0,
        };
      });
    } catch (error) {
      console.error('Error getting time series:', error);
      return [];
    }
  }

  getTopAgents(limit: number = 10): RankedAgent[] {
    try {
      const results = this.db
        .prepare(
          `
        SELECT
          agentId,
          COUNT(*) as totalTasks,
          SUM(success) as successCount,
          AVG(latencyMs) as avgLatency,
          SUM(tokensIn + tokensOut) as totalTokens,
          SUM(cost) as totalCost
        FROM agent_metrics
        WHERE timestamp > ?
        GROUP BY agentId
        ORDER BY (CAST(SUM(success) AS FLOAT) / COUNT(*)) DESC
        LIMIT ?
      `
        )
        .all(Date.now() - 30 * 24 * 60 * 60 * 1000, limit);

      return results.map((row: any) => ({
        agentId: row.agentId,
        successRate: (row.successCount / row.totalTasks) * 100,
        totalTasks: row.totalTasks,
        avgLatency: row.avgLatency || 0,
        totalTokens: row.totalTokens || 0,
        totalCost: row.totalCost || 0,
      }));
    } catch (error) {
      console.error('Error getting top agents:', error);
      return [];
    }
  }

  getOverallStats(): OverallStats {
    try {
      const now = Date.now();
      const from = now - 30 * 24 * 60 * 60 * 1000;

      const result = this.db
        .prepare(
          `
        SELECT
          COUNT(*) as totalTasks,
          SUM(success) as successCount,
          AVG(latencyMs) as avgLatency,
          SUM(tokensIn + tokensOut) as totalTokens,
          SUM(cost) as totalCost
        FROM agent_metrics
        WHERE timestamp BETWEEN ? AND ?
      `
        )
        .get(from, now);

      const totalTasks = result.totalTasks || 0;
      const successCount = result.successCount || 0;

      return {
        totalTasks,
        totalTokens: result.totalTokens || 0,
        totalCost: result.totalCost || 0,
        avgSuccessRate: totalTasks > 0 ? (successCount / totalTasks) * 100 : 0,
        avgLatency: result.avgLatency || 0,
      };
    } catch (error) {
      console.error('Error getting overall stats:', error);
      return {
        totalTasks: 0,
        totalTokens: 0,
        totalCost: 0,
        avgSuccessRate: 0,
        avgLatency: 0,
      };
    }
  }

  getCostBreakdown(days: number = 30): CostBreakdown {
    try {
      const now = Date.now();
      const from = now - days * 24 * 60 * 60 * 1000;

      // Cost by provider
      const byProviderResults = this.db
        .prepare(
          `
        SELECT providerId, SUM(cost) as totalCost
        FROM agent_metrics
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY providerId
      `
        )
        .all(from, now);

      const byProvider: Record<string, number> = {};
      byProviderResults.forEach((row: any) => {
        byProvider[row.providerId] = row.totalCost || 0;
      });

      // Cost by model
      const byModelResults = this.db
        .prepare(
          `
        SELECT modelId, SUM(cost) as totalCost
        FROM agent_metrics
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY modelId
      `
        )
        .all(from, now);

      const byModel: Record<string, number> = {};
      byModelResults.forEach((row: any) => {
        byModel[row.modelId] = row.totalCost || 0;
      });

      // Cost by agent
      const byAgentResults = this.db
        .prepare(
          `
        SELECT agentId, SUM(cost) as totalCost
        FROM agent_metrics
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY agentId
      `
        )
        .all(from, now);

      const byAgent: Record<string, number> = {};
      byAgentResults.forEach((row: any) => {
        byAgent[row.agentId] = row.totalCost || 0;
      });

      // Daily cost trend
      const dailyResults = this.db
        .prepare(
          `
        SELECT
          DATE(timestamp / 1000, 'unixepoch') as date,
          SUM(cost) as dailyCost
        FROM agent_metrics
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY DATE(timestamp / 1000, 'unixepoch')
        ORDER BY date ASC
      `
        )
        .all(from, now);

      const daily = dailyResults.map((row: any) => ({
        date: row.date,
        cost: row.dailyCost || 0,
      }));

      return {
        byProvider,
        byModel,
        byAgent,
        daily,
      };
    } catch (error) {
      console.error('Error getting cost breakdown:', error);
      return {
        byProvider: {},
        byModel: {},
        byAgent: {},
        daily: [],
      };
    }
  }

  rebuildDailySummaries(days: number = 30): void {
    try {
      const now = Date.now();
      const from = now - days * 24 * 60 * 60 * 1000;

      // Get all metrics grouped by agent and date
      const summaries = this.db
        .prepare(
          `
        SELECT
          agentId,
          DATE(timestamp / 1000, 'unixepoch') as date,
          COUNT(*) as totalTasks,
          SUM(success) as successCount,
          COUNT(*) - SUM(success) as failCount,
          AVG(latencyMs) as avgLatencyMs,
          SUM(tokensIn + tokensOut) as totalTokens,
          SUM(cost) as totalCost
        FROM agent_metrics
        WHERE timestamp BETWEEN ? AND ?
        GROUP BY agentId, DATE(timestamp / 1000, 'unixepoch')
      `
        )
        .all(from, now);

      // Clear existing summaries for this period
      this.db
        .prepare(`DELETE FROM agent_daily_summary WHERE timestamp > ?`)
        .run(from);

      // Insert new summaries
      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO agent_daily_summary
        (agentId, date, totalTasks, successCount, failCount, avgLatencyMs, totalTokens, totalCost)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      summaries.forEach((row: any) => {
        insertStmt.run(
          row.agentId,
          row.date,
          row.totalTasks,
          row.successCount,
          row.failCount,
          row.avgLatencyMs,
          row.totalTokens,
          row.totalCost
        );
      });
    } catch (error) {
      console.error('Error rebuilding daily summaries:', error);
    }
  }

  pruneOldMetrics(daysToKeep: number = 90): void {
    try {
      const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

      this.db
        .prepare(`DELETE FROM agent_metrics WHERE timestamp < ?`)
        .run(cutoffTime);

      this.db
        .prepare(
          `DELETE FROM agent_daily_summary WHERE date < DATE(?, 'unixepoch')`
        )
        .run(Math.floor(cutoffTime / 1000));
    } catch (error) {
      console.error('Error pruning old metrics:', error);
    }
  }
}

export const agentAnalytics = new AgentAnalytics();
