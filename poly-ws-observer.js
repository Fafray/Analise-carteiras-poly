// poly-ws-observer.js — Observa o WebSocket do Polymarket
// Apenas escuta e loga. Não executa nada.
// Objetivo: validar schema, latência e volume antes de codar o bot final.

const WebSocket = require('ws');

// ─── CARTEIRAS QUE QUEREMOS OBSERVAR ─────────────────────────────────────────
const WATCHED = {
  'DRpuff':   '0xdb27bf2ac5d428a9c63dbc914611036855a6c56e',
  'Fullpicks':'0x9b1e0334569aa1768a07705a859686aad58e82c9',
  'wowzers':  '0x8c0b024c17831a0dde038547b7e791ae6a0d7aa5',
  'UFC':      '0x8a3ab8120807bd64a3de48695110e390fa2ceb9a',
};

const watchedAddresses = new Set(Object.values(WATCHED).map(a => a.toLowerCase()));
const addressToName = {};
for (const [name, addr] of Object.entries(WATCHED)) {
  addressToName[addr.toLowerCase()] = name;
}

// ─── ESTATÍSTICAS ────────────────────────────────────────────────────────────
const stats = {
  totalMessages: 0,
  tradesReceived: 0,
  watchedHits: 0,
  byMinute: { trades: 0, hits: 0, startTs: Date.now() },
  firstSchemaLogged: false,
};

// ─── CONEXÃO ──────────────────────────────────────────────────────────────────
let ws;
let reconnectAttempts = 0;
let pingInterval;

function connect() {
  console.log('\n🔌 Conectando: wss://ws-live-data.polymarket.com');

  ws = new WebSocket('wss://ws-live-data.polymarket.com', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });

  ws.on('open', () => {
    console.log('✅ WebSocket conectado');
    reconnectAttempts = 0;

    // Subscreve no canal de trades
    const subMsg = {
      action: 'subscribe',
      subscriptions: [
        { topic: 'activity', type: 'trades' },
      ],
    };
    console.log(`📤 Subscribe: ${JSON.stringify(subMsg)}`);
    ws.send(JSON.stringify(subMsg));

    // Ping a cada 5s (conforme doc Polymarket RTDS)
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send('PING'); } catch(e) {}
      }
    }, 5000);
  });

  ws.on('message', (raw) => {
    stats.totalMessages++;

    const text = raw.toString();

    // Ignora PONG
    if (text === 'PONG' || text === 'pong') return;

    let msg;
    try { msg = JSON.parse(text); }
    catch(e) {
      console.log(`⚠️  Mensagem não-JSON: ${text.slice(0, 200)}`);
      return;
    }

    // LOGA O SCHEMA DA PRIMEIRA MENSAGEM COMPLETA
    if (!stats.firstSchemaLogged && msg.payload) {
      stats.firstSchemaLogged = true;
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📋 SCHEMA DA PRIMEIRA MENSAGEM RECEBIDA:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(JSON.stringify(msg, null, 2));
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    // Detecta tipo da mensagem
    if (msg.topic === 'activity' && msg.type === 'trades') {
      stats.tradesReceived++;
      stats.byMinute.trades++;
      handleTrade(msg.payload);
    } else if (msg.topic) {
      // outros topics — só conta
    }
  });

  ws.on('close', () => {
    console.log('❌ WebSocket desconectado');
    if (pingInterval) clearInterval(pingInterval);
    scheduleReconnect();
  });

  ws.on('error', (err) => console.error('WS error:', err.message));
}

function scheduleReconnect() {
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
  console.log(`🔄 Reconectando em ${delay/1000}s (tentativa ${reconnectAttempts})...`);
  setTimeout(connect, delay);
}

// ─── PROCESSAMENTO DE TRADE ──────────────────────────────────────────────────
function handleTrade(payload) {
  if (!payload) return;

  // Tenta achar o endereço do usuário em vários campos possíveis
  const possibleAddresses = [
    payload.proxyWallet,
    payload.user,
    payload.userAddress,
    payload.profile?.proxyWallet,
    payload.profile?.userAddress,
    payload.profile?.baseAddress,
  ].filter(Boolean).map(a => a.toLowerCase());

  // Verifica se alguma das nossas carteiras está na lista
  let matchedName = null;
  let matchedAddr = null;
  for (const addr of possibleAddresses) {
    if (watchedAddresses.has(addr)) {
      matchedName = addressToName[addr];
      matchedAddr = addr;
      break;
    }
  }

  if (matchedName) {
    stats.watchedHits++;
    stats.byMinute.hits++;

    const now = new Date().toISOString();
    const ts = payload.timestamp ? new Date(payload.timestamp * 1000).toISOString() : 'N/A';
    const lagMs = payload.timestamp ? Date.now() - payload.timestamp * 1000 : null;

    console.log(`\n🎯 TRADE DE TIPSTER: ${matchedName}`);
    console.log(`   Recebido:  ${now}`);
    console.log(`   Timestamp: ${ts}`);
    console.log(`   Lag:       ${lagMs !== null ? lagMs + 'ms' : 'N/A'}`);
    console.log(`   Side:      ${payload.side || '?'}`);
    console.log(`   Price:     ${payload.price || '?'}`);
    console.log(`   Size:      ${payload.size || '?'}`);
    console.log(`   USDC:      $${payload.usdcSize || payload.usdcSize === 0 ? payload.usdcSize : '?'}`);
    console.log(`   Title:     ${payload.title || '?'}`);
    console.log(`   Outcome:   ${payload.outcome || '?'}`);
    console.log(`   Condition: ${payload.conditionId || '?'}`);
    console.log(`   TxHash:    ${payload.transactionHash || '?'}`);
  }
}

// ─── STATS PERIÓDICOS ─────────────────────────────────────────────────────────
setInterval(() => {
  const elapsed = (Date.now() - stats.byMinute.startTs) / 1000;
  console.log(`\n📊 [Stats últimos ${elapsed.toFixed(0)}s]`);
  console.log(`   Total mensagens:    ${stats.totalMessages}`);
  console.log(`   Trades recebidos:   ${stats.tradesReceived} (${(stats.byMinute.trades/elapsed*60).toFixed(0)}/min)`);
  console.log(`   Hits tipsters:      ${stats.watchedHits} (${(stats.byMinute.hits/elapsed*60).toFixed(1)}/min)`);

  // Reset janela
  stats.byMinute = { trades: 0, hits: 0, startTs: Date.now() };
}, 60 * 1000); // a cada 1min

// ─── START ────────────────────────────────────────────────────────────────────
console.log('👀 Polymarket WebSocket Observer');
console.log(`📡 Monitorando ${watchedAddresses.size} carteiras:`);
for (const [name, addr] of Object.entries(WATCHED)) {
  console.log(`   ${name.padEnd(12)} ${addr}`);
}
console.log('');

process.on('uncaughtException',  e => console.error('Uncaught:', e.message));
process.on('unhandledRejection', e => console.error('Unhandled:', e));

connect();
