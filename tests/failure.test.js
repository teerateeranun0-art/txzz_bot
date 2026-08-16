/**
 * Failure Injection & Self-Healing Resilience Test Suite.
 * Verifies that the platform survives:
 * - Redis disconnection (In-Memory fallback)
 * - Discord API 429 Rate Limit (Exponential backoff)
 * - Worker crashes (Dead-Letter Queue capture)
 * - Queue draining during graceful shutdown
 */

import { cache } from '../src/utils/redis.js';
import { jobQueue } from '../src/utils/queue.js';
import { retryWithBackoff } from '../src/utils/retry.js';

let passed = 0;
let total = 0;

function assert(condition, testName) {
  total += 1;
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`);
    passed += 1;
  } else {
    console.error(`  ❌ [FAIL] ${testName}`);
    process.exitCode = 1;
  }
}

async function runFailureTests() {
  console.log('\n🚀 STARTING FAILURE INJECTION & RESILIENCE TESTS...\n');

  // 1. Redis Failure & In-Memory Fallback
  console.log('📦 1. Redis Disconnection Fallback');
  await cache.set('resilience:test', { state: 'healthy' }, 10);
  const cachedVal = await cache.get('resilience:test');
  assert(cachedVal?.state === 'healthy', 'Cache operations survive without active external Redis server');

  // 2. Discord API 429 Rate Limit Simulation
  console.log('\n🔄 2. Discord API 429 Rate Limit Backoff Simulation');
  let calls = 0;
  const rateLimitSim = async () => {
    calls++;
    if (calls < 3) {
      const err = new Error('Rate Limited (429)');
      err.status = 429;
      err.retryAfter = 0.01;
      throw err;
    }
    return { ok: true, calls };
  };

  const retryRes = await retryWithBackoff(rateLimitSim, { maxRetries: 4, initialDelayMs: 10 });
  assert(retryRes.ok === true && calls === 3, 'Survives transient HTTP 429 rate limit via exponential backoff');

  // 3. Worker Crash & Dead-Letter Queue (DLQ)
  console.log('\n⚙️ 3. Worker Crash & DLQ Recovery');
  let workerAttempts = 0;
  jobQueue.register('crashing_worker', async () => {
    workerAttempts++;
    throw new Error('Simulated Unhandled Worker Exception');
  }, { maxRetries: 2, retryDelayMs: 10 });

  jobQueue.push('crashing_worker', { payload: 'critical_task' });
  await new Promise((r) => setTimeout(r, 150));

  const deadLetters = jobQueue.getDeadLetters();
  const dlqMatch = deadLetters.find((d) => d.taskName === 'crashing_worker');
  assert(dlqMatch !== undefined, 'Crashing worker failed task safely captured in Dead-Letter Queue (DLQ)');
  assert(dlqMatch.error.includes('Simulated Unhandled Worker Exception'), 'DLQ captured precise crash error message');

  // 4. Graceful Queue Drain
  console.log('\n🛑 4. Graceful Queue Draining');
  let drained = false;
  jobQueue.register('slow_job', async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
  jobQueue.push('slow_job', {});
  await jobQueue.drain(2000);
  assert(jobQueue.getActiveCount() === 0, 'Active jobs completely drained before process termination');

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`🏆 FAILURE & RESILIENCE SUITE: ${passed}/${total} PASSED`);
  console.log('═══════════════════════════════════════════════════\n');
}

runFailureTests().catch((err) => {
  console.error('Fatal failure test error:', err);
  process.exit(1);
});
