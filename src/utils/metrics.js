/**
 * Performance & Latency Metrics Collector.
 * Tracks rolling window percentiles (p50, p95, p99), query durations, and throughput.
 */

class MetricsCollector {
  constructor() {
    this.commandLatencies = []; // [{ name, ms, time }]
    this.dbLatencies = [];      // [{ query, ms, time }]
    this.maxSamples = 500;
    this.totalCommands = 0;
  }

  recordCommand(name, ms) {
    this.totalCommands += 1;
    this.commandLatencies.push({ name, ms, time: Date.now() });
    if (this.commandLatencies.length > this.maxSamples) {
      this.commandLatencies.shift();
    }
  }

  recordDbQuery(queryName, ms) {
    this.dbLatencies.push({ name: queryName, ms, time: Date.now() });
    if (this.dbLatencies.length > this.maxSamples) {
      this.dbLatencies.shift();
    }
  }

  calculateStats(samples) {
    if (samples.length === 0) {
      return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }

    const values = samples.map((s) => s.ms).sort((a, b) => a - b);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avg = Math.round(sum / values.length);
    const p50 = values[Math.floor(values.length * 0.5)];
    const p95 = values[Math.floor(values.length * 0.95)] || values[values.length - 1];
    const p99 = values[Math.floor(values.length * 0.99)] || values[values.length - 1];

    return {
      count: values.length,
      avg,
      p50,
      p95,
      p99,
      min: values[0],
      max: values[values.length - 1],
    };
  }

  getCommandMetrics() {
    return {
      total: this.totalCommands,
      stats: this.calculateStats(this.commandLatencies),
    };
  }

  getDbMetrics() {
    return {
      stats: this.calculateStats(this.dbLatencies),
    };
  }

  getDatabaseMetrics() {
    return this.getDbMetrics();
  }

  getThroughput() {
    const oneMinAgo = Date.now() - 60_000;
    const recent = this.commandLatencies.filter((c) => c.time >= oneMinAgo).length;
    return {
      commandsPerMinute: recent,
    };
  }
}

export const metrics = new MetricsCollector();
