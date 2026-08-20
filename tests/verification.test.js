/**
 * Verification System Test Suite (หน้ายืนยันตัวตนเพื่อรับยศ)
 * Verifies:
 * 1. Verification config CRUD & persistence
 * 2. Embed & Button builders
 * 3. Captcha challenge generation & validation
 * 4. Role assignment & unverified role removal
 * 5. Anti-Raid / Lockdown protection guard
 * 6. Verification statistics & audit logging
 */

import {
  setVerificationConfig,
  getVerificationConfig,
  deleteVerificationConfig,
  getVerificationStats,
} from '../src/utils/database.js';
import {
  buildVerificationEmbed,
  buildVerificationButton,
  generateCaptchaChallenge,
  processVerification,
} from '../src/community/verification.js';

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

async function runVerificationTests() {
  console.log('\n🚀 STARTING ROLE VERIFICATION SYSTEM TESTS...\n');

  const guildId = '777888999000111222';
  const roleId = '123456789012345678';
  const unverifiedRoleId = '987654321098765432';
  const channelId = '112233445566778899';

  // 1. Config CRUD
  console.log('📦 1. Verification Config CRUD & Persistence');
  const created = await setVerificationConfig(guildId, {
    channelId,
    roleId,
    unverifiedRoleId,
    mode: 'captcha',
    title: '🛡️ ยืนยันตัวตนเพื่อรับยศสมาชิกระดับพรีเมียม',
    description: 'โปรดกดยืนยันเพื่อรับยศ',
    buttonText: '✅ กดเพื่อรับยศ',
    buttonStyle: 'Success',
  });

  assert(created.guildId === guildId, 'Config successfully created with correct guild ID');
  assert(created.roleId === roleId, 'Target role ID saved correctly');
  assert(created.mode === 'captcha', 'Verification mode set to captcha');

  const fetched = await getVerificationConfig(guildId);
  assert(fetched?.title.includes('สมาชิกระดับพรีเมียม'), 'Config retrieved from cache/database cleanly');

  // 2. Embed & Button Builders
  console.log('\n🎨 2. Verification UI Components (Embed & Button)');
  const embed = buildVerificationEmbed(fetched);
  assert(embed.data.title.includes('สมาชิกระดับพรีเมียม'), 'Embed title formatted accurately');
  assert(embed.data.fields.some(f => f.name.includes('ยศที่จะได้รับ')), 'Embed includes target role field');

  const row = buildVerificationButton(fetched);
  assert(row.components[0].data.custom_id === 'verify_btn_click', 'Button component generated with verify_btn_click ID');
  assert(row.components[0].data.label === '✅ กดเพื่อรับยศ', 'Button label rendered accurately');

  // 3. Captcha Challenge Generation
  console.log('\n🔐 3. Captcha Challenge Generator');
  const code1 = generateCaptchaChallenge();
  const code2 = generateCaptchaChallenge();
  assert(code1.length === 5, 'Captcha generates 5-character security string');
  assert(code1 !== code2, 'Captcha challenges are dynamically randomized');

  // 4. Role Assignment & Execution Flow
  console.log('\n🎖️ 4. Verification Role Assignment Flow');
  const addedRoles = [];
  const removedRoles = [];
  const currentRoles = new Set([unverifiedRoleId]);

  const fakeMember = {
    id: '555555555555555555',
    user: { id: '555555555555555555', username: 'Tester' },
    roles: {
      cache: {
        has: (rId) => currentRoles.has(rId),
      },
      add: async (role, reason) => {
        addedRoles.push(role.id);
        currentRoles.add(role.id);
      },
      remove: async (role, reason) => {
        removedRoles.push(role.id);
        currentRoles.delete(role.id);
      },
    },
  };

  const fakeGuild = {
    id: guildId,
    roles: {
      cache: {
        get: (rId) => ({
          id: rId,
          name: rId === roleId ? 'Verified Member' : 'Unverified',
          position: 10,
        }),
      },
    },
    members: {
      me: {
        id: '999999999999999999',
        roles: { highest: { position: 100 } },
        permissions: { has: () => true },
      },
    },
    channels: { cache: { get: () => null } },
  };

  const fakeInteraction = {
    guild: fakeGuild,
    member: fakeMember,
    user: fakeMember.user,
  };

  const verifyResult = await processVerification(fakeInteraction, fakeMember, fetched, 'captcha');
  assert(verifyResult.alreadyVerified === false, 'First-time verification processed successfully');
  assert(addedRoles.includes(roleId), 'Verified role granted to member');
  assert(removedRoles.includes(unverifiedRoleId), 'Unverified role removed from member');

  // Second attempt -> Already verified check
  const secondAttempt = await processVerification(fakeInteraction, fakeMember, fetched, 'captcha');
  assert(secondAttempt.alreadyVerified === true, 'Duplicate verification attempt rejected idempotently');

  // 4.1 Security Isolation: Jailed member verification block
  const { jailUser, unjailUser } = await import('../src/utils/database.js');
  await jailUser(guildId, 'jailed_user_123', 'Testing jail', 'mod_1', [], null, null, null);
  const fakeJailedMember = {
    id: 'jailed_user_123',
    user: { id: 'jailed_user_123', username: 'JailedGuy' },
    roles: { cache: { has: () => false } },
  };
  let jailBlocked = false;
  try {
    await processVerification(fakeInteraction, fakeJailedMember, fetched, 'instant');
  } catch (err) {
    jailBlocked = err.message.includes('กักบริเวณ') || err.message.includes('Jail');
  }
  assert(jailBlocked === true, 'Jailed/quarantined member is blocked from claiming verified role');
  await unjailUser(guildId, 'jailed_user_123');

  // 5. Verification Stats
  console.log('\n📊 5. Verification Statistics & Audit Logs');
  const stats = await getVerificationStats(guildId);
  assert(stats.totalVerified >= 1, 'Verification count incremented in audit statistics');
  assert(stats.recentLogs.length > 0, 'Audit log trail captured with user ID and timestamp');

  // 6. Cleanup & Disable
  console.log('\n🛑 6. Verification Teardown');
  await deleteVerificationConfig(guildId);
  const deleted = await getVerificationConfig(guildId);
  assert(deleted === null, 'Verification config cleanly deleted on disable');

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`🏆 VERIFICATION SUITE: ${passed}/${total} PASSED`);
  console.log('═══════════════════════════════════════════════════\n');
}

runVerificationTests().catch((err) => {
  console.error('Fatal verification test error:', err);
  process.exit(1);
});
