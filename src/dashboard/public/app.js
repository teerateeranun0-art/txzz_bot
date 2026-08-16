/**
 * Enterprise Discord Bot — Web Dashboard SPA Controller v2.0
 */

// STATE
let currentGuildId = null;
let currentTab = 'overview';
let cachedGuilds = [];
let autoRefreshTimer = null;

// INIT
document.addEventListener('DOMContentLoaded', async () => {
  createToastContainer();
  await loadUserAndGuilds();
  await renderCurrentTab();
  startAutoRefresh();
});

// TOAST SYSTEM
function createToastContainer() {
  if (!document.getElementById('toast-container')) {
    const el = document.createElement('div');
    el.id = 'toast-container';
    document.body.appendChild(el);
  }
}

function toast(message, type = 'info', duration = 3500) {
  const icons = { success: 'v', error: 'x', warning: '!', info: 'i' };
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="flex-shrink:0">[${icons[type] || 'i'}]</span><span>${message}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('removing');
    setTimeout(() => el.remove(), 260);
  }, duration);
}

// SKELETON
function skeletonGrid(n = 4) {
  return `<div class="metrics-grid">${Array(n).fill('<div class="skeleton skeleton-card"></div>').join('')}</div><div class="skeleton skeleton-card" style="height:300px"></div>`;
}

// AUTO REFRESH
function startAutoRefresh() {
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => renderCurrentTab(true), 60000);
}

// USER & GUILDS
async function loadUserAndGuilds() {
  try {
    const [authRes, guildsRes] = await Promise.all([
      fetch('/api/auth/me').then(r => r.json()),
      fetch('/api/guilds').then(r => r.json()),
    ]);
    if (authRes.user) document.getElementById('userName').textContent = authRes.user.username;
    cachedGuilds = guildsRes.guilds || [];
    const selector = document.getElementById('guildSelector');
    selector.innerHTML = '';
    if (!cachedGuilds.length) { selector.innerHTML = '<option value="">No Guilds Found</option>'; return; }
    cachedGuilds.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name + ' (' + (g.memberCount || 0).toLocaleString() + ' members)';
      selector.appendChild(opt);
    });
    currentGuildId = cachedGuilds[0].id;
    selector.value = currentGuildId;
  } catch (err) {
    console.error('Error loading initial data', err);
    toast('Failed to connect to API server', 'error');
  }
}

function switchGuild(guildId) { currentGuildId = guildId; renderCurrentTab(); }

function navigate(tab) {
  currentTab = tab;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.getAttribute('data-tab') === tab));
  renderCurrentTab();
}

async function refreshData() { await renderCurrentTab(); toast('Data refreshed', 'success', 2000); }

// RENDER ROUTER
async function renderCurrentTab(silent = false) {
  const container = document.getElementById('tabContent');
  if (!currentGuildId) { container.innerHTML = '<div class="card"><h3>No guild selected</h3></div>'; return; }
  if (!silent) container.innerHTML = skeletonGrid();
  try {
    switch (currentTab) {
      case 'overview':     await renderOverview(container); break;
      case 'security':     await renderSecurity(container); break;
      case 'decisions':    await renderDecisions(container); break;
      case 'snapshots':    await renderSnapshots(container); break;
      case 'bots':         await renderBotAllowlist(container); break;
      case 'moderation':   await renderModeration(container); break;
      case 'automod':      await renderAutoMod(container); break;
      case 'tickets':      await renderTickets(container); break;
      case 'economy':      await renderEconomyLedger(container); break;
      case 'subscription': await renderSubscription(container); break;
      case 'diagnostics':  await renderDiagnostics(container); break;
    }
  } catch (err) {
    container.innerHTML = '<div class="card"><h3 style="color:var(--accent-danger)">Error loading view</h3><p style="color:var(--text-muted);margin-top:8px">' + err.message + '</p></div>';
    if (!silent) toast('Failed to load: ' + err.message, 'error');
  }
}

// HELPERS
const api = async (path, options = {}) => {
  const res = await fetch(path, options);
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error(data.error || data.message || 'HTTP ' + res.status);
  return data;
};
const guildApi = (sub) => api('/api/guilds/' + currentGuildId + sub);
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDate = (ts) => new Date(ts).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
const emptyRow = (cols, msg) => '<tr class="empty-row"><td colspan="' + cols + '">' + msg + '</td></tr>';

function riskColor(score) {
  if (score >= 80) return 'var(--accent-danger)';
  if (score >= 50) return 'var(--accent-warning)';
  return 'var(--accent-success)';
}

function riskBadge(score) {
  if (score >= 80) return '<span class="badge badge-danger">HIGH RISK</span>';
  if (score >= 50) return '<span class="badge badge-warning">MEDIUM</span>';
  return '<span class="badge badge-success">LOW</span>';
}

// OVERVIEW
async function renderOverview(container) {
  document.getElementById('pageHeading').textContent = 'Overview Dashboard';
  document.getElementById('pageSubheading').textContent = 'Live telemetry, security health, and guild control matrix';
  const [data, health] = await Promise.all([guildApi('/overview'), api('/api/health')]);
  const plan = data.subscription?.plan || 'FREE';
  document.getElementById('planBadge').textContent = 'PLAN: ' + plan;
  const planColor = { FREE: '#6366f1', PRO: '#06b6d4', ENTERPRISE: '#10b981' }[plan] || '#6366f1';
  const healthOk = health.overallStatus === 'HEALTHY' || health.overallStatus === 'OK';
  container.innerHTML = `
    <div class="metrics-grid">
      <div class="card card-accent-green">
        <div class="metric-header"><span>SECURITY</span><span>shield</span></div>
        <div class="metric-value" style="color:var(--accent-success);font-size:1.4rem">${data.stats?.status || 'PROTECTED'}</div>
        <div class="metric-sub positive">Anti-Nuke Active</div>
      </div>
      <div class="card card-accent-yellow">
        <div class="metric-header"><span>INCIDENTS (24h)</span></div>
        <div class="metric-value">${data.stats?.recentIncidents ?? 0}</div>
        <div class="metric-sub">Recent incidents</div>
      </div>
      <div class="card card-accent-red">
        <div class="metric-header"><span>QUARANTINED</span></div>
        <div class="metric-value">${data.stats?.quarantinedUsers ?? 0}</div>
        <div class="metric-sub">Active isolations</div>
      </div>
      <div class="card card-accent-purple">
        <div class="metric-header"><span>SYSTEM HEALTH</span></div>
        <div class="metric-value" style="font-size:1.2rem;color:${healthOk ? 'var(--accent-success)' : 'var(--accent-danger)'}">${health.overallStatus || 'UNKNOWN'}</div>
        <div class="metric-sub">5-Tier probe</div>
      </div>
    </div>
    <div class="metrics-grid-2">
      <div class="card">
        <div class="card-header"><div class="card-title">Quick Actions</div></div>
        <div class="action-grid">
          <button class="action-tile" onclick="navigate('security')"><div class="action-icon"></div><div class="action-label">Security</div><div class="action-desc">Incident log</div></button>
          <button class="action-tile" onclick="navigate('decisions')"><div class="action-icon"></div><div class="action-label">Decisions</div><div class="action-desc">AI audit trail</div></button>
          <button class="action-tile" onclick="navigate('snapshots')"><div class="action-icon"></div><div class="action-label">Snapshots</div><div class="action-desc">Diff & restore</div></button>
          <button class="action-tile" onclick="navigate('economy')"><div class="action-icon"></div><div class="action-label">Ledger</div><div class="action-desc">Transactions</div></button>
          <button class="action-tile" onclick="navigate('moderation')"><div class="action-icon"></div><div class="action-label">Moderation</div><div class="action-desc">Cases & warnings</div></button>
          <button class="action-tile" onclick="navigate('diagnostics')"><div class="action-icon"></div><div class="action-label">Diagnostics</div><div class="action-desc">Health probes</div></button>
          <button class="action-tile" onclick="navigate('security')"><div class="action-icon"></div><div class="action-label">Security</div><div class="action-desc">Incident log</div></button>
          <button class="action-tile" onclick="navigate('decisions')"><div class="action-icon"></div><div class="action-label">Decisions</div><div class="action-desc">AI audit trail</div></button>
          <button class="action-tile" onclick="navigate('snapshots')"><div class="action-icon"></div><div class="action-label">Snapshots</div><div class="action-desc">Diff & restore</div></button>
          <button class="action-tile" onclick="navigate('economy')"><div class="action-icon"></div><div class="action-label">Ledger</div><div class="action-desc">Transactions</div></button>
          <button class="action-tile" onclick="navigate('moderation')"><div class="action-icon"></div><div class="action-label">Moderation</div><div class="action-desc">Cases & warnings</div></button>
          <button class="action-tile" onclick="navigate('diagnostics')"><div class="action-icon"></div><div class="action-label">Diagnostics</div><div class="action-desc">Health probes</div></button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">SaaS Subscription</div><span class="badge badge-purple">${plan}</span></div>
        <div class="metric-value" style="font-size:1.4rem;color:${planColor};margin:12px 0">${plan}</div>
        <div class="metric-sub">Status: ${data.subscription?.status || 'ACTIVE'}</div>
        <button class="btn btn-primary w-full" onclick="navigate('subscription')" style="margin-top:16px">Manage Plan</button>
      </div>
    </div>`;
}

// SECURITY
async function renderSecurity(container) {
  document.getElementById('pageHeading').textContent = 'Security & Risk Management';
  document.getElementById('pageSubheading').textContent = 'Live incident log, quarantine list, and anti-nuke status';
  const [incidentData, overviewData] = await Promise.all([guildApi('/security/incidents'), guildApi('/overview')]);
  const incidents = incidentData.incidents || [];
  const quarantined = overviewData.stats?.quarantinedUsers ?? 0;
  const severityBadge = (s) => {
    const m = { critical:'badge-danger', high:'badge-danger', medium:'badge-warning', low:'badge-info' };
    return '<span class="badge ' + (m[s] || 'badge-muted') + '">' + (s||'UNKNOWN').toUpperCase() + '</span>';
  };
  container.innerHTML = `
    <div class="metrics-grid">
      <div class="card card-accent-red"><div class="metric-header">TOTAL INCIDENTS</div><div class="metric-value">${incidents.length}</div><div class="metric-sub">All time</div></div>
      <div class="card card-accent-yellow"><div class="metric-header">QUARANTINED</div><div class="metric-value">${quarantined}</div><div class="metric-sub">Active isolations</div></div>
      <div class="card card-accent-green"><div class="metric-header">ANTI-NUKE</div><div class="metric-value" style="font-size:1.3rem;color:var(--accent-success)">ACTIVE</div><div class="metric-sub positive">Real-time</div></div>
    </div>
    <div class="table-container">
      <div class="table-header"><h3>Incident Log (${incidents.length})</h3></div>
      <table>
        <thead><tr><th>Time</th><th>Type</th><th>Severity</th><th>Triggered By</th><th>Action</th><th>Status</th></tr></thead>
        <tbody>
          ${incidents.length ? incidents.map(i => `<tr>
            <td><span class="code-pill">${fmtDate(i.timestamp || i.createdAt)}</span></td>
            <td><strong>${i.type || i.actionType || '?'}</strong></td>
            <td>${severityBadge(i.severity)}</td>
            <td><span class="code-pill">${i.userId || i.triggeredBy || 'System'}</span></td>
            <td>${i.action ? '<span class="badge badge-danger">' + i.action + '</span>' : '<span class="badge badge-muted">LOG</span>'}</td>
            <td><span class="badge ${i.resolved ? 'badge-success' : 'badge-warning'}">${i.resolved ? 'RESOLVED' : 'OPEN'}</span></td>
          </tr>`).join('') : emptyRow(6, 'No incidents recorded. Server is clean!')}
        </tbody>
      </table>
    </div>`;
}

// DECISIONS
async function renderDecisions(container) {
  document.getElementById('pageHeading').textContent = 'Explainable Decision Engine';
  document.getElementById('pageSubheading').textContent = 'Chronological audit log with factor weights';
  const data = await guildApi('/security/decisions');
  const decisions = data.decisions || [];
  container.innerHTML = `
    <div class="table-container">
      <div class="table-header"><h3>Decisions Log (${decisions.length})</h3><span class="badge badge-purple">AI-Powered</span></div>
      <table>
        <thead><tr><th>Time</th><th>Target</th><th>Action</th><th>Confidence</th><th>Risk Breakdown</th><th>Version</th></tr></thead>
        <tbody>
          ${decisions.length ? decisions.map(d => {
            const score = d.confidenceScore || 0;
            const factors = (d.factors || []).map(f => '<span class="risk-factor-pill">+' + f.points + ' ' + f.label + '</span>').join('');
            return '<tr><td><span class="code-pill">' + fmtTime(d.timestamp) + '</span></td>' +
              '<td><span class="code-pill">' + d.userId + '</span></td>' +
              '<td><span class="badge badge-danger">' + d.action + '</span></td>' +
              '<td><strong style="color:' + riskColor(score) + '">' + score + '%</strong> ' + riskBadge(score) + '<div class="progress-bar-wrap" style="width:100px;margin-top:4px"><div class="progress-bar-fill" style="width:' + score + '%;background:' + riskColor(score) + '"></div></div></td>' +
              '<td><div style="font-size:0.82rem;font-weight:600;margin-bottom:4px">' + (d.reason||'') + '</div><div class="risk-factors">' + factors + '</div></td>' +
              '<td><code>' + (d.ruleVersion||'?') + ' v' + (d.engineVersion||'1.0') + '</code></td></tr>';
          }).join('') : emptyRow(6, 'No decision records yet. System is monitoring.')}
        </tbody>
      </table>
    </div>`;
}

// SNAPSHOTS
async function renderSnapshots(container) {
  document.getElementById('pageHeading').textContent = 'Server Snapshots & Recovery';
  document.getElementById('pageSubheading').textContent = 'Safe Diff Preview and Granular Selective Restoration';
  const data = await guildApi('/security/snapshots');
  const snapshots = data.snapshots || [];
  container.innerHTML = `
    <div class="table-container">
      <div class="table-header"><h3>Snapshots (${snapshots.length})</h3><span class="badge badge-info">Auto-captured on incidents</span></div>
      <table>
        <thead><tr><th>ID</th><th>Label / Trigger</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>
          ${snapshots.length ? snapshots.map(s => '<tr>' +
            '<td><strong>#' + s.id + '</strong></td>' +
            '<td>' + (s.label || '-') + ' <span class="badge badge-muted">' + (s.trigger||'manual') + '</span></td>' +
            '<td><span class="code-pill">' + fmtDate(s.timestamp || s.createdAt) + '</span></td>' +
            '<td style="display:flex;gap:6px">' +
              '<button class="btn btn-secondary btn-sm" onclick="previewDiff(' + s.id + ')">Diff</button>' +
              '<button class="btn btn-primary btn-sm" onclick="restoreSnapshot(' + s.id + ',\'roles\')">Roles</button>' +
              '<button class="btn btn-primary btn-sm" onclick="restoreSnapshot(' + s.id + ',\'channels\')">Channels</button>' +
            '</td></tr>'
          ).join('') : emptyRow(4, 'No snapshots found. Use /snapshot create.')}
        </tbody>
      </table>
    </div>
    <div id="diffPreviewModal"></div>`;
}

async function previewDiff(snapshotId) {
  const modal = document.getElementById('diffPreviewModal');
  modal.innerHTML = '<div class="card"><div class="skeleton skeleton-card"></div></div>';
  try {
    const diff = await fetch('/api/guilds/' + currentGuildId + '/security/snapshots/' + snapshotId + '/diff').then(r => r.json());
    const dr = diff.deletedRoles || [];
    modal.innerHTML = `<div class="card" style="border:1px solid var(--border-highlight)">
      <div class="card-header"><h3>Diff Preview — Snapshot #${snapshotId}</h3><span class="badge badge-info">vs Live State</span></div>
      <p style="color:var(--text-muted);margin-bottom:16px">${diff.summary || 'Comparing against current server structure.'}</p>
      <div class="metrics-grid">
        <div class="card card-accent-red"><div class="metric-header">DELETED ROLES</div><div class="metric-value" style="color:var(--accent-danger)">${diff.deletedRoles?.length || 0}</div></div>
        <div class="card card-accent-red"><div class="metric-header">DELETED CHANNELS</div><div class="metric-value" style="color:var(--accent-danger)">${diff.deletedChannels?.length || 0}</div></div>
        <div class="card card-accent-yellow"><div class="metric-header">MODIFIED ROLES</div><div class="metric-value" style="color:var(--accent-warning)">${diff.modifiedRoles?.length || 0}</div></div>
      </div>
      ${dr.length ? '<div class="diff-view">' + dr.map(r => '<div class="diff-line removed"><span class="diff-sign">-</span><span>' + r.name + ' (' + r.id + ')</span></div>').join('') + '</div>' : ''}
    </div>`;
  } catch (e) {
    modal.innerHTML = '<div class="card"><p style="color:var(--accent-danger)">Failed to generate diff: ' + e.message + '</p></div>';
  }
}

async function restoreSnapshot(snapshotId, scope) {
  if (!confirm('Restore ' + scope + ' from Snapshot #' + snapshotId + '?')) return;
  try {
    const res = await fetch('/api/guilds/' + currentGuildId + '/security/snapshots/' + snapshotId + '/restore', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope }),
    }).then(r => r.json());
    toast('Restored: ' + (res.restoredRoles?.length || 0) + ' roles, ' + (res.restoredChannels?.length || 0) + ' channels', 'success');
    renderSnapshots(document.getElementById('tabContent'));
  } catch (e) { toast('Restore failed: ' + e.message, 'error'); }
}

// BOT ALLOWLIST
async function renderBotAllowlist(container) {
  document.getElementById('pageHeading').textContent = 'Policy-Driven Bot Protection';
  document.getElementById('pageSubheading').textContent = 'Approved bots, permission ceilings, and auto-quarantine policies';
  const data = await guildApi('/security/bots');
  const bots = data.bots || [];
  container.innerHTML = `
    <div class="table-container">
      <div class="table-header"><h3>Bot Allowlist (${bots.length})</h3><button class="btn btn-primary btn-sm" onclick="showAddBotForm()">+ Add Bot</button></div>
      <table>
        <thead><tr><th>Bot ID</th><th>Name</th><th>Status</th><th>Max Permissions</th><th>Approved By</th></tr></thead>
        <tbody>
          ${bots.length ? bots.map(b =>
            '<tr><td><span class="code-pill">' + b.bot_id + '</span></td>' +
            '<td><strong>' + (b.bot_name||'Unknown') + '</strong></td>' +
            '<td><span class="badge ' + (b.status==='approved'?'badge-success':'badge-warning') + '">' + b.status + '</span></td>' +
            '<td><code>' + (b.max_permissions||'DEFAULT') + '</code></td>' +
            '<td>' + (b.approved_by||'Staff') + '</td></tr>'
          ).join('') : emptyRow(5, 'No bots in allowlist. Unapproved bots with elevated permissions will be auto-quarantined.')}
        </tbody>
      </table>
    </div>
    <div id="addBotForm"></div>`;
}

function showAddBotForm() {
  document.getElementById('addBotForm').innerHTML = `
    <div class="card" style="border:1px solid var(--border-highlight)">
      <h3 class="card-title">Add Bot to Allowlist</h3>
      <div class="form-row" style="margin-top:16px">
        <div class="form-group"><label class="form-label">Bot ID</label><input class="form-input" id="addBotId" placeholder="Discord Bot User ID"></div>
        <div class="form-group"><label class="form-label">Bot Name</label><input class="form-input" id="addBotName" placeholder="e.g. Carl-bot"></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" onclick="submitAddBot()">Approve Bot</button>
        <button class="btn btn-secondary" onclick="document.getElementById('addBotForm').innerHTML=''">Cancel</button>
      </div>
    </div>`;
}

async function submitAddBot() {
  const botId = document.getElementById('addBotId')?.value.trim();
  const botName = document.getElementById('addBotName')?.value.trim();
  if (!botId) { toast('Bot ID required', 'warning'); return; }
  try {
    await fetch('/api/guilds/' + currentGuildId + '/security/bots', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botId, botName, status: 'approved', approvedBy: 'Dashboard Admin' }),
    });
    toast('Bot ' + (botName||botId) + ' approved!', 'success');
    renderBotAllowlist(document.getElementById('tabContent'));
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
}

// MODERATION
async function renderModeration(container) {
  document.getElementById('pageHeading').textContent = 'Moderation Cases & Appeals';
  document.getElementById('pageSubheading').textContent = 'Staff actions, warning points, and active bans';
  let cases = [];
  try { const data = await guildApi('/moderation/cases'); cases = data.cases || []; } catch {}
  const actionBadge = (a) => {
    const m = { ban:'badge-danger', kick:'badge-danger', timeout:'badge-warning', warn:'badge-warning', note:'badge-muted', unban:'badge-success' };
    return '<span class="badge ' + (m[a]||'badge-info') + '">' + (a||'?').toUpperCase() + '</span>';
  };
  container.innerHTML = `
    <div class="metrics-grid">
      <div class="card card-accent-red"><div class="metric-header">TOTAL CASES</div><div class="metric-value">${cases.length}</div></div>
      <div class="card card-accent-red"><div class="metric-header">BANS</div><div class="metric-value">${cases.filter(c=>c.action==='ban').length}</div></div>
      <div class="card card-accent-yellow"><div class="metric-header">WARNINGS</div><div class="metric-value">${cases.filter(c=>c.action==='warn').length}</div></div>
      <div class="card card-accent-cyan"><div class="metric-header">TIMEOUTS</div><div class="metric-value">${cases.filter(c=>c.action==='timeout').length}</div></div>
    </div>
    <div class="table-container">
      <div class="table-header"><h3>Moderation Cases (${cases.length})</h3></div>
      <table>
        <thead><tr><th>#</th><th>Action</th><th>Target</th><th>Moderator</th><th>Reason</th><th>Points</th><th>Time</th></tr></thead>
        <tbody>
          ${cases.length ? cases.map(c =>
            '<tr><td><code>#' + c.id + '</code></td><td>' + actionBadge(c.action) + '</td>' +
            '<td><span class="code-pill">' + (c.targetId||c.userId||'?') + '</span></td>' +
            '<td><span class="code-pill">' + (c.moderatorId||'System') + '</span></td>' +
            '<td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (c.reason||'?') + '</td>' +
            '<td>' + (c.points ? '<span style="color:var(--accent-warning);font-weight:700">+' + c.points + '</span>' : '-') + '</td>' +
            '<td>' + fmtDate(c.createdAt) + '</td></tr>'
          ).join('') : emptyRow(7, 'No moderation cases recorded yet.')}
        </tbody>
      </table>
    </div>`;
}

// AUTOMOD
async function renderAutoMod(container) {
  document.getElementById('pageHeading').textContent = 'AutoMod Engine Configuration';
  document.getElementById('pageSubheading').textContent = 'Configure spam thresholds, link filters, and content rules';
  let settings = {}, filters = [];
  try { const data = await guildApi('/automod'); settings = data.settings || {}; filters = data.filters || []; } catch {}
  const toggles = [
    { key:'antiSpam', label:'Anti-Spam', desc:'Block rapid message flooding' },
    { key:'antiLink', label:'Anti-Link', desc:'Restrict unsanctioned URLs' },
    { key:'antiCaps', label:'Anti-Caps', desc:'Limit ALL-CAPS messages' },
    { key:'antiEmoji', label:'Anti-Emoji Spam', desc:'Cap excessive emoji usage' },
    { key:'antiDuplicate', label:'Anti-Duplicate', desc:'Block repeated messages' },
    { key:'antiInvite', label:'Anti-Invite', desc:'Block Discord invite links' },
    { key:'antiMassMention', label:'Anti-Mass Mention', desc:'Limit @mention counts' },
    { key:'antiPhishing', label:'Anti-Phishing', desc:'Block known scam domains' },
  ];
  container.innerHTML = `
    <div class="metrics-grid-2">
      <div class="card">
        <div class="card-header"><div class="card-title">AutoMod Feature Toggles</div></div>
        ${toggles.map(t => `
          <div class="toggle-wrap">
            <div class="toggle-info"><strong>${t.label}</strong><small>${t.desc}</small></div>
            <label class="toggle">
              <input type="checkbox" ${settings[t.key]?'checked':''} onchange="updateAutoModToggle('${t.key}',this.checked)">
              <span class="toggle-slider"></span>
            </label>
          </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Custom Filter Patterns</div><button class="btn btn-primary btn-sm" onclick="showAddFilterForm()">+ Add</button></div>
        <div id="filterFormArea"></div>
        <div class="table-container" style="margin-top:12px">
          <table>
            <thead><tr><th>Type</th><th>Pattern</th><th>Action</th><th></th></tr></thead>
            <tbody>
              ${filters.length ? filters.map(f =>
                '<tr><td><span class="badge badge-info">' + f.type + '</span></td>' +
                '<td><code>' + f.pattern + '</code></td>' +
                '<td><span class="badge badge-warning">' + (f.action||'delete') + '</span></td>' +
                '<td><button class="btn btn-danger btn-sm" onclick="removeFilter(' + f.id + ')">x</button></td></tr>'
              ).join('') : emptyRow(4, 'No custom filters configured.')}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}

async function updateAutoModToggle(key, value) {
  try {
    await fetch('/api/guilds/' + currentGuildId + '/automod', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: key, settings: { enabled: value } }),
    });
    toast(key + ' ' + (value?'enabled':'disabled'), 'success', 2000);
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
}

function showAddFilterForm() {
  document.getElementById('filterFormArea').innerHTML = `
    <div style="border:1px solid var(--border-highlight);border-radius:var(--radius-md);padding:12px;margin-bottom:12px">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Type</label>
          <select class="form-select" id="filterType"><option value="regex">Regex</option><option value="word">Word/Phrase</option><option value="domain">Domain</option></select>
        </div>
        <div class="form-group">
          <label class="form-label">Pattern</label>
          <input class="form-input" id="filterPattern" placeholder="e.g. discord.gg/">
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="submitAddFilter()">Add Filter</button>
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('filterFormArea').innerHTML=''">Cancel</button>
      </div>
    </div>`;
}

async function submitAddFilter() {
  const type = document.getElementById('filterType')?.value;
  const pattern = document.getElementById('filterPattern')?.value.trim();
  if (!pattern) { toast('Pattern required', 'warning'); return; }
  try {
    await fetch('/api/guilds/' + currentGuildId + '/automod', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'filter', settings: { type, pattern, action: 'delete' } }),
    });
    toast('Filter added!', 'success');
    renderAutoMod(document.getElementById('tabContent'));
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
}

async function removeFilter(id) {
  try {
    await fetch('/api/guilds/' + currentGuildId + '/automod/filters/' + id, { method: 'DELETE' });
    toast('Filter removed', 'success', 2000);
    renderAutoMod(document.getElementById('tabContent'));
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
}

// TICKETS
async function renderTickets(container) {
  document.getElementById('pageHeading').textContent = 'Ticket Management & Staff SLA';
  document.getElementById('pageSubheading').textContent = 'Live ticket hub, claim assignments, and response metrics';
  let openTickets = [], stats = {};
  try { const data = await guildApi('/tickets'); openTickets = data.openTickets || []; stats = data.stats || {}; } catch {}
  const priorityBadge = (p) => {
    const m = { urgent:'badge-danger', high:'badge-warning', medium:'badge-info', low:'badge-muted' };
    return '<span class="badge ' + (m[p]||'badge-muted') + '">' + (p||'normal').toUpperCase() + '</span>';
  };
  container.innerHTML = `
    <div class="metrics-grid">
      <div class="card card-accent-purple"><div class="metric-header">OPEN TICKETS</div><div class="metric-value">${openTickets.length}</div><div class="metric-sub">Awaiting response</div></div>
      <div class="card card-accent-green"><div class="metric-header">TOTAL RESOLVED</div><div class="metric-value">${stats.totalResolved||stats.total||0}</div></div>
      <div class="card card-accent-yellow"><div class="metric-header">AVG RESPONSE</div><div class="metric-value" style="font-size:1.4rem">${stats.avgResponseTime?stats.avgResponseTime+'m':'?'}</div><div class="metric-sub">Staff SLA</div></div>
      <div class="card card-accent-cyan"><div class="metric-header">SATISFACTION</div><div class="metric-value" style="font-size:1.4rem">${stats.satisfactionRate?stats.satisfactionRate+'%':'?'}</div></div>
    </div>
    <div class="table-container">
      <div class="table-header"><h3>Open Tickets (${openTickets.length})</h3><span class="badge badge-info">Live Queue</span></div>
      <table>
        <thead><tr><th>#</th><th>Category</th><th>User</th><th>Priority</th><th>Claimed By</th><th>Opened</th><th>Actions</th></tr></thead>
        <tbody>
          ${openTickets.length ? openTickets.map(t =>
            '<tr><td><strong>#' + t.id + '</strong></td>' +
            '<td><span class="badge badge-info">' + (t.category||'General') + '</span></td>' +
            '<td><span class="code-pill">' + (t.userId||t.createdBy||'?') + '</span></td>' +
            '<td>' + priorityBadge(t.priority) + '</td>' +
            '<td>' + (t.claimedBy ? '<span class="code-pill">' + t.claimedBy + '</span>' : '<span style="color:var(--text-muted)">Unclaimed</span>') + '</td>' +
            '<td>' + fmtDate(t.createdAt) + '</td>' +
            '<td style="display:flex;gap:6px">' +
              '<button class="btn btn-secondary btn-sm" onclick="toast(\'Use /ticket claim in Discord\',\'info\')">Claim</button>' +
              '<button class="btn btn-success btn-sm" onclick="toast(\'Use /ticket close in Discord\',\'warning\')">Close</button>' +
            '</td></tr>'
          ).join('') : emptyRow(7, 'No open tickets! Support queue is clear.')}
        </tbody>
      </table>
    </div>`;
}

// ECONOMY LEDGER
async function renderEconomyLedger(container) {
  document.getElementById('pageHeading').textContent = 'Double-Entry Transaction Ledger';
  document.getElementById('pageSubheading').textContent = 'Immutable financial audit trail with idempotency controls';
  const [txData, lbData] = await Promise.all([guildApi('/economy/transactions'), guildApi('/economy/leaderboard')]);
  const txs = txData.transactions || [];
  const lb  = lbData.leaderboard || [];
  container.innerHTML = `
    <div class="metrics-grid-2">
      <div class="table-container" style="margin-bottom:0">
        <div class="table-header"><h3>Transaction Audit Trail (${txs.length})</h3><span class="badge badge-success">ACID Safe</span></div>
        <table>
          <thead><tr><th>ID</th><th>Time</th><th>Type</th><th>Amount</th><th>From &rarr; To</th><th>Key</th></tr></thead>
          <tbody>
            ${txs.length ? txs.map(t =>
              '<tr><td><code>#' + t.id + '</code></td>' +
              '<td><span class="code-pill">' + fmtTime(t.createdAt) + '</span></td>' +
              '<td><span class="badge badge-info">' + t.type + '</span></td>' +
              '<td style="color:var(--accent-success);font-weight:700">+' + (t.amount||0).toLocaleString() + '</td>' +
              '<td><span class="code-pill">' + (t.fromUser||'SYSTEM').slice(0,8) + '</span> &rarr; <span class="code-pill">' + (t.toUser||'?').slice(0,8) + '</span></td>' +
              '<td><span class="code-pill" style="font-size:0.72rem">' + (t.idempotencyKey||'').slice(0,14) + '...</span></td></tr>'
            ).join('') : emptyRow(6, 'No transactions yet.')}
          </tbody>
        </table>
      </div>
      <div class="table-container" style="margin-bottom:0">
        <div class="table-header"><h3>Leaderboard (Top ${lb.length})</h3></div>
        <table>
          <thead><tr><th>Rank</th><th>User</th><th>Balance</th></tr></thead>
          <tbody>
            ${lb.length ? lb.map((u,i) =>
              '<tr><td>' + (i===0?'Gold':i===1?'Silver':i===2?'Bronze':'#'+(i+1)) + '</td>' +
              '<td><span class="code-pill">' + u.userId + '</span></td>' +
              '<td style="font-weight:700;color:var(--accent-warning)">' + (u.balance||u.coins||0).toLocaleString() + '</td></tr>'
            ).join('') : emptyRow(3, 'No economy data yet.')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// SUBSCRIPTION
async function renderSubscription(container) {
  document.getElementById('pageHeading').textContent = 'Multi-Guild SaaS & Entitlements';
  document.getElementById('pageSubheading').textContent = 'Plan tiers, feature flags, and usage limits';
  const sub = await guildApi('/subscription');
  const plan = sub.plan || 'FREE';
  const plans = [
    { id:'FREE',       price:'0 THB',         color:'#6366f1', features:['Core Security','Basic AutoMod','20 Snapshots','Standard Support'] },
    { id:'PRO',        price:'490 THB / mo',   color:'#06b6d4', features:['Custom Thresholds','Double-Entry Ledger','50 Snapshots','Unlimited Tickets','Priority Support'] },
    { id:'ENTERPRISE', price:'1,990 THB / mo', color:'#10b981', features:['Dedicated Workers','Custom Branding','Unlimited Snapshots','SLA Guarantee','Onboarding'] },
  ];
  container.innerHTML = `
    <div class="metrics-grid">
      ${plans.map(p => `
        <div class="card" style="border-top:4px solid ${p.color}${plan===p.id?';box-shadow:0 0 0 2px '+p.color+'40':''}">
          <div class="card-header"><div class="card-title">${p.id}</div>${plan===p.id?'<span class="badge badge-success">CURRENT</span>':''}</div>
          <div style="font-size:1.5rem;font-weight:800;color:${p.color};margin:12px 0">${p.price}</div>
          <ul style="list-style:none;display:flex;flex-direction:column;gap:6px;margin-bottom:20px">
            ${p.features.map(f => '<li style="font-size:0.85rem;color:var(--text-sub);display:flex;gap:8px"><span style="color:var(--accent-success)">v</span>' + f + '</li>').join('')}
          </ul>
          <button class="btn w-full ${plan===p.id?'btn-secondary':'btn-primary'}" onclick="updatePlan('${p.id}')" ${plan===p.id?'disabled':''}>
            ${plan===p.id?'Current Plan':p.id==='FREE'?'Downgrade':'Upgrade'}
          </button>
        </div>`).join('')}
    </div>`;
}

async function updatePlan(plan) {
  try {
    await fetch('/api/guilds/' + currentGuildId + '/subscription', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, status: 'ACTIVE' }),
    });
    document.getElementById('planBadge').textContent = 'PLAN: ' + plan;
    toast('Plan updated to ' + plan + '!', 'success');
    renderSubscription(document.getElementById('tabContent'));
  } catch (e) { toast('Failed: ' + e.message, 'error'); }
}

// DIAGNOSTICS
async function renderDiagnostics(container) {
  document.getElementById('pageHeading').textContent = 'Observability & Diagnostics';
  document.getElementById('pageSubheading').textContent = 'Live 5-Tier Health Check, Latency Percentiles, Memory Profiling';
  const [health, metricsData] = await Promise.all([api('/api/health'), api('/api/metrics')]);
  const cmd = metricsData.commands?.stats || {};
  const mem = metricsData.memory || {};
  const heapMB = Math.round((mem.heapUsed||0)/1024/1024);
  const heapTotalMB = Math.round((mem.heapTotal||0)/1024/1024);
  const heapPct = heapTotalMB ? Math.round(heapMB/heapTotalMB*100) : 0;
  const uptime = metricsData.uptime || 0;
  const probeRow = (name, data, detail, lat) => {
    const ok = data?.status === 'CONNECTED' || data?.status === 'HEALTHY' || data?.status === 'OK';
    return '<tr><td>' + name + '</td><td><span class="badge ' + (ok?'badge-success':'badge-warning') + '">' + (data?.status||'UNKNOWN') + '</span></td><td style="color:var(--text-muted);font-size:0.82rem">' + detail + '</td><td>' + (lat!=null?'<code>'+lat+'ms</code>':'?') + '</td></tr>';
  };
  container.innerHTML = `
    <div class="metrics-grid">
      <div class="card card-accent-green"><div class="metric-header">SYSTEM HEALTH</div><div class="metric-value" style="font-size:1.3rem;color:var(--accent-success)">${health.overallStatus||'?'}</div><div class="metric-sub positive">5-Tier probe</div></div>
      <div class="card card-accent-purple"><div class="metric-header">CMD LATENCY P95</div><div class="metric-value">${cmd.p95||0} <span style="font-size:1rem;font-weight:400">ms</span></div><div class="metric-sub">P50: ${cmd.p50||0}ms | P99: ${cmd.p99||0}ms</div></div>
      <div class="card card-accent-yellow">
        <div class="metric-header">HEAP MEMORY</div>
        <div class="metric-value">${heapMB} <span style="font-size:1rem;font-weight:400">MB</span></div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${heapPct}%;background:${heapPct>80?'var(--accent-danger)':'var(--accent-warning)'}"></div></div>
        <div class="metric-sub">${heapPct}% of ${heapTotalMB}MB allocated</div>
      </div>
      <div class="card card-accent-cyan"><div class="metric-header">UPTIME</div><div class="metric-value">${Math.floor(uptime/60)} <span style="font-size:1rem;font-weight:400">min</span></div><div class="metric-sub">${Math.floor(uptime/3600)}h ${Math.floor((uptime%3600)/60)}m total</div></div>
    </div>
    <div class="table-container">
      <div class="table-header"><h3>5-Tier Subsystem Probes</h3><span class="badge badge-success">Live</span></div>
      <table>
        <thead><tr><th>Subsystem</th><th>Status</th><th>Detail</th><th>Latency</th></tr></thead>
        <tbody>
          ${probeRow('Discord Gateway', health.discord, 'Ping: '+(health.discord?.ping||0)+'ms', health.discord?.ping)}
          ${probeRow('PostgreSQL DB', health.database, 'Pool size: '+(health.database?.poolSize||'?'), health.database?.latencyMs)}
          ${probeRow('Redis / Cache', health.cache, 'Mode: '+(health.cache?.mode||'memory'), health.cache?.latencyMs)}
          ${probeRow('Worker Queue', health.queue, 'Active: '+(health.queue?.activeJobs??0)+' / Pending: '+(health.queue?.pendingJobs??0), null)}
          ${probeRow('Node.js Runtime', { status:'HEALTHY' }, 'Heap: '+heapMB+'MB / RSS: '+Math.round((mem.rss||0)/1024/1024)+'MB', null)}
        </tbody>
      </table>
    </div>`;
}
