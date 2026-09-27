// Beer Game — standalone multiplayer server
// Public, no login required. Supports many simultaneous teams via a team code.
// Run: npm install && npm start   (then open http://localhost:3000)

const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const DEFAULT_MAX_ROUNDS = 40;
const HOLD_COST = 0.5;
const BACKLOG_COST = 1;
const ROLE_ORDER = ['retailer', 'wholesaler', 'distributor', 'factory'];
const VALID_ROLES = new Set(['customer', 'retailer', 'wholesaler', 'distributor', 'factory', 'master']);

function classicDemand(t) { return t <= 4 ? 4 : 8; }

function emptyStation() {
  return {
    inv: 12, backlog: 0, shipIn: [4, 4], orderOut: [4, 4],
    lastIncomingOrder: 4, lastShipped: 4, lastCost: 0, totalCost: 0,
    history: [], pendingOrder: null, submitted: false
  };
}
function emptyCustomer() {
  return { pendingDemand: null, submitted: false, suggestedDemand: 4, history: [] };
}
function emptyMeta(maxRounds) {
  return { started: false, round: 0, maxRounds: maxRounds || DEFAULT_MAX_ROUNDS, gameOver: false };
}
function newTeam(maxRounds) {
  return {
    meta: emptyMeta(maxRounds),
    customer: emptyCustomer(),
    stations: {
      retailer: emptyStation(), wholesaler: emptyStation(),
      distributor: emptyStation(), factory: emptyStation()
    },
    sockets: new Set()
  };
}

// ---- in-memory store: teamCode -> team state ----
const teams = new Map();

function getOrCreateTeam(code) {
  let t = teams.get(code);
  if (!t) { t = newTeam(DEFAULT_MAX_ROUNDS); teams.set(code, t); }
  return t;
}

function resetTeam(team, maxRounds) {
  team.meta = emptyMeta(maxRounds || team.meta.maxRounds);
  team.meta.started = true;
  team.customer = emptyCustomer();
  team.stations = {
    retailer: emptyStation(), wholesaler: emptyStation(),
    distributor: emptyStation(), factory: emptyStation()
  };
}

function allSubmitted(team) {
  if (!team.customer.submitted) return false;
  return ROLE_ORDER.every(r => team.stations[r].submitted);
}

function processRound(team) {
  if (team.meta.gameOver || !team.meta.started) return;
  const t = team.meta.round + 1;
  const demand = (typeof team.customer.pendingDemand === 'number') ? team.customer.pendingDemand : classicDemand(t);

  const nodes = {};
  for (const r of ROLE_ORDER) {
    const d = team.stations[r];
    nodes[r] = {
      inv: d.inv, backlog: d.backlog,
      shipIn: d.shipIn.slice(), orderOut: d.orderOut.slice(),
      totalCost: d.totalCost, history: d.history.slice(),
      pendingOrder: (typeof d.pendingOrder === 'number') ? d.pendingOrder : d.lastIncomingOrder
    };
  }

  // step 1: receive shipments
  for (let i = 0; i < 3; i++) { nodes[ROLE_ORDER[i]].inv += nodes[ROLE_ORDER[i]].shipIn.shift(); }
  nodes.factory.inv += nodes.factory.orderOut.shift();

  // step 2: receive orders
  const incoming = {};
  incoming.retailer = demand;
  for (let i = 1; i < 4; i++) { incoming[ROLE_ORDER[i]] = nodes[ROLE_ORDER[i - 1]].orderOut.shift(); }

  // step 3: ship
  for (let i = 0; i < 4; i++) {
    const key = ROLE_ORDER[i];
    const n = nodes[key];
    const totalDemand = incoming[key] + n.backlog;
    const shipped = Math.min(n.inv, totalDemand);
    n.inv -= shipped;
    n.backlog = totalDemand - shipped;
    n.lastShipped = shipped;
    n.lastIncomingOrder = incoming[key];
    if (i > 0) { nodes[ROLE_ORDER[i - 1]].shipIn.push(shipped); }
  }

  // step 4: place new orders
  for (let i = 0; i < 4; i++) { nodes[ROLE_ORDER[i]].orderOut.push(nodes[ROLE_ORDER[i]].pendingOrder); }

  const gameOver = t >= team.meta.maxRounds;

  // step 5: cost & history, write back
  for (const key of ROLE_ORDER) {
    const n = nodes[key];
    const cost = n.inv * HOLD_COST + n.backlog * BACKLOG_COST;
    n.totalCost += cost;
    n.history.push({ round: t, incomingOrder: n.lastIncomingOrder, orderPlaced: n.pendingOrder, shipped: n.lastShipped, inv: n.inv, backlog: n.backlog, cost });
    team.stations[key] = {
      inv: n.inv, backlog: n.backlog, shipIn: n.shipIn, orderOut: n.orderOut,
      lastIncomingOrder: n.lastIncomingOrder, lastShipped: n.lastShipped, lastCost: cost,
      totalCost: n.totalCost, history: n.history, pendingOrder: null, submitted: false
    };
  }

  const custHistory = (team.customer.history || []).slice();
  custHistory.push({ round: t, demand });
  team.customer = {
    pendingDemand: null, submitted: false, suggestedDemand: classicDemand(t + 1), history: custHistory
  };

  team.meta = { started: true, round: t, maxRounds: team.meta.maxRounds, gameOver };
}

// ---- role-scoped payload builder (server enforces the information hiding) ----
function payloadFor(team, role) {
  if (role === 'master') {
    return {
      meta: team.meta,
      customer: { submitted: team.customer.submitted },
      stations: ROLE_ORDER.reduce((acc, r) => {
        const s = team.stations[r];
        acc[r] = { inv: s.inv, backlog: s.backlog, totalCost: s.totalCost, submitted: s.submitted, history: s.history };
        return acc;
      }, {})
    };
  }
  if (role === 'customer') {
    return { meta: team.meta, mine: team.customer };
  }
  return { meta: team.meta, mine: team.stations[role] };
}

function broadcast(team) {
  for (const sock of team.sockets) {
    if (sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify({ type: 'state', payload: payloadFor(team, sock._role) }));
    }
  }
}

// ---- HTTP + static ----
const app = express();
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/app.js', (req, res) => res.sendFile(path.join(__dirname, 'app.js')));
app.get('/healthz', (req, res) => res.send('ok'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws._role = null;
  ws._team = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'join') {
      const role = String(msg.role || '');
      const team = String(msg.team || '').trim().toUpperCase();
      if (!VALID_ROLES.has(role) || !team) {
        ws.send(JSON.stringify({ type: 'error', message: 'บทบาทหรือรหัสทีมไม่ถูกต้อง' }));
        return;
      }
      const teamState = getOrCreateTeam(team);
      ws._role = role;
      ws._team = team;
      teamState.sockets.add(ws);
      ws.send(JSON.stringify({ type: 'state', payload: payloadFor(teamState, role) }));
      return;
    }

    if (!ws._team || !ws._role) return;
    const teamState = teams.get(ws._team);
    if (!teamState) return;

    if (msg.type === 'submitOrder' && ROLE_ORDER.includes(ws._role)) {
      const v = Number(msg.value);
      if (!Number.isFinite(v) || v < 0) return;
      teamState.stations[ws._role].pendingOrder = Math.round(v);
      teamState.stations[ws._role].submitted = true;
      broadcast(teamState);
    } else if (msg.type === 'submitDemand' && ws._role === 'customer') {
      const v = Number(msg.value);
      if (!Number.isFinite(v) || v < 0) return;
      teamState.customer.pendingDemand = Math.round(v);
      teamState.customer.submitted = true;
      broadcast(teamState);
    } else if (msg.type === 'processRound' && ws._role === 'master') {
      processRound(teamState);
      broadcast(teamState);
    } else if (msg.type === 'resetGame' && ws._role === 'master') {
      const mr = Number(msg.maxRounds);
      resetTeam(teamState, Number.isFinite(mr) && mr > 0 ? Math.round(mr) : undefined);
      broadcast(teamState);
    }
  });

  ws.on('close', () => {
    if (ws._team && teams.has(ws._team)) {
      teams.get(ws._team).sockets.delete(ws);
      // Optional cleanup: drop empty, never-started teams after everyone leaves.
      const t = teams.get(ws._team);
      if (t.sockets.size === 0 && !t.meta.started) { teams.delete(ws._team); }
    }
  });
});

server.listen(PORT, () => {
  console.log('Beer Game server listening on port ' + PORT);
});
