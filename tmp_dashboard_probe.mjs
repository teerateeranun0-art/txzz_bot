process.env.DISCORD_TOKEN = 'test.abc.def';

const { startDashboardServer } = await import('./src/dashboard/server.js');

const client = {
  guilds: {
    cache: new Map([
      ['123', { id: '123', name: 'Test Guild', memberCount: 42, iconURL: () => null }],
    ]),
  },
};

const server = startDashboardServer(client, 3999);

setTimeout(async () => {
  const urls = [
    'http://localhost:3999/api/auth/me',
    'http://localhost:3999/api/guilds',
    'http://localhost:3999/api/guilds/123/overview',
    'http://localhost:3999/api/guilds/123/security/incidents',
    'http://localhost:3999/api/guilds/123/economy/leaderboard',
    'http://localhost:3999/api/guilds/123/tickets',
    'http://localhost:3999/api/guilds/123/something',
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url);
      const text = await r.text();
      console.log('URL', url, 'STATUS', r.status, 'BODY', text.slice(0, 200));
    } catch (e) {
      console.log('URL', url, 'ERROR', e.message);
    }
  }

  server.close();
}, 500);
