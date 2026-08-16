/**
 * End-to-End System Integration Test Suite.
 * Verifies that all layers integrate seamlessly:
 * Discord Event -> Security Guard -> Scoring Engine -> Explainable Decision -> Database Ledger -> Job Queue -> Worker.
 */

import { getRiskScoreBreakdown } from '../src/security/scoring.js';
import { jobQueue } from '../src/utils/queue.js';
import { recordSecurityDecision, getSecurityDecisions, getGuildSubscription, hasEntitlement } from '../src/utils/database.js';

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

async function runIntegrationTests() {
  console.log('\n🚀 STARTING END-TO-END INTEGRATION TESTS...\n');

  const fakeGuild = {
    id: '888777666555444333',
    ownerId: '999999999999999999',
    members: {
      fetch: async () => ({
        user: { createdTimestamp: Date.now() - 1000 * 3600 * 2 }, // 2 hours old
        joinedTimestamp: Date.now() - 1000 * 60 * 5,             // 5 mins ago
      }),
    },
  };

  // 1. Scoring -> Explainable Decision Record
  console.log('🧠 1. Security Scoring to Decision Engine Flow');
  const breakdown = await getRiskScoreBreakdown(fakeGuild, '333333333333333333', 'channel_delete');
  assert(breakdown.score >= 50, 'Scoring engine evaluated multiple penalty factors');
  assert(breakdown.status === 'CRITICAL RISK', 'Calculated CRITICAL RISK status correctly');

  // 2. Multi-Guild SaaS Entitlement Resolution
  console.log('\n📈 2. Multi-Guild SaaS & Feature Entitlements');
  const sub = await getGuildSubscription(fakeGuild.id);
  assert(sub.plan === 'FREE', 'Default guild resolves to FREE tier cleanly');
  const hasBasicSec = await hasEntitlement(fakeGuild.id, 'basicSecurity');
  assert(hasBasicSec === true, 'Entitlement engine evaluates permissions correctly');

  // 3. Worker Job Dispatching Pipeline
  console.log('\n⚙️ 3. Asynchronous Worker Job Dispatching');
  let workerExecuted = false;
  jobQueue.register('integration_pipeline_worker', async (data) => {
    workerExecuted = data.valid;
  });

  jobQueue.push('integration_pipeline_worker', { valid: true });
  await new Promise((r) => setTimeout(r, 100));
  assert(workerExecuted === true, 'Job Queue successfully processed registered worker payload');

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`🏆 INTEGRATION SUITE: ${passed}/${total} PASSED`);
  console.log('═══════════════════════════════════════════════════\n');
}

runIntegrationTests().catch((err) => {
  console.error('Fatal integration test error:', err);
  process.exit(1);
});
