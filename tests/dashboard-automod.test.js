import test from 'node:test';
import assert from 'node:assert/strict';
import { startDashboardServer } from '../src/dashboard/server.js';

test('dashboard automod filter add/delete works', async () => {
  const guildId = '123';
  const client = {
    guilds: {
      cache: new Map([
        [guildId, {
          id: guildId,
          name: 'Test Guild',
          memberCount: 42,
          ownerId: '999',
          iconURL: () => null,
        }],
      ]),
    },
  };

  const server = startDashboardServer(client, 0);
  await new Promise((resolve) => server.once('listening', resolve));

  const port = server.address().port;

  try {
    const addRes = await fetch(`http://localhost:${port}/api/guilds/${guildId}/automod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'filter',
        settings: { type: 'word', pattern: 'test-pattern', action: 'delete' },
      }),
    });

    const addBody = await addRes.json();
    assert.equal(addRes.status, 200, 'POST should succeed');
    assert.equal(addBody.success, true, 'POST should report success');
    assert.ok(addBody.filterId, 'POST should return a created filter id');

    const getRes = await fetch(`http://localhost:${port}/api/guilds/${guildId}/automod`);
    const getBody = await getRes.json();
    assert.equal(getRes.status, 200, 'GET should succeed');
    assert.equal(getBody.filters.length, 1, 'one filter should be stored');
    assert.equal(getBody.filters[0].pattern, 'test-pattern', 'stored pattern should match');

    const thresholdRes = await fetch(`http://localhost:${port}/api/guilds/${guildId}/security/thresholds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionType: 'role_delete', max: 7, windowMs: 30000 }),
    });
    const thresholdBody = await thresholdRes.json();
    assert.equal(thresholdRes.status, 200, 'threshold POST should succeed');
    assert.equal(thresholdBody.success, true, 'threshold POST should report success');

    const thresholdCheck = await fetch(`http://localhost:${port}/api/guilds/${guildId}/overview`);
    const thresholdData = await thresholdCheck.json();
    assert.ok(thresholdData.thresholds, 'overview should include thresholds');
    assert.equal(thresholdData.thresholds.role_delete.max, 7, 'threshold max should be preserved');
    assert.equal(thresholdData.thresholds.role_delete.windowMs, 30000, 'threshold window should be preserved');

    const invalidFilterRes = await fetch(`http://localhost:${port}/api/guilds/${guildId}/automod`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'filter', settings: { type: 'word', pattern: '' } }),
    });
    const invalidFilterBody = await invalidFilterRes.json();
    assert.equal(invalidFilterRes.status, 400, 'empty filter pattern should be rejected');
    assert.equal(invalidFilterBody.success, false, 'invalid filter should report failure');

    const invalidSubRes = await fetch(`http://localhost:${port}/api/guilds/${guildId}/subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: 'BAD_PLAN', status: 'NOPE' }),
    });
    const invalidSubBody = await invalidSubRes.json();
    assert.equal(invalidSubRes.status, 400, 'invalid subscription payload should be rejected');
    assert.equal(invalidSubBody.success, false, 'invalid subscription should report failure');

    const deleteRes = await fetch(`http://localhost:${port}/api/guilds/${guildId}/automod/filters/${addBody.filterId}`, {
      method: 'DELETE',
    });
    const deleteBody = await deleteRes.json();
    assert.equal(deleteRes.status, 200, 'DELETE should succeed');
    assert.equal(deleteBody.success, true, 'DELETE should report success');

    const finalRes = await fetch(`http://localhost:${port}/api/guilds/${guildId}/automod`);
    const finalBody = await finalRes.json();
    assert.equal(finalBody.filters.length, 0, 'filter list should be empty after delete');
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
