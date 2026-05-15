// wallet-analyzer.js — Analisa carteiras do Polymarket via Data API
// Uso: node wallet-analyzer.js
// Roda local (com Node 18+) OU como serviço temporário no Railway

const https = require('https');

// ─── CARTEIRAS PRA ANALISAR ──────────────────────────────────────────────────
const WALLETS = [
  { label: 'Carteira 1', address: '0x5c3a1a602848565bb16165fcd460b00c3d43020b' },
  { label: 'Fullpicks',  address: '0x9b1e0334569aa1768a07705a859686aad58e82c9' },
  { label: 'Carteira 3', address: '0xef27152015c5313daf457804e7319e869ed3381b' },
  { label: 'wowzers',    address: '0x8c0b024c17831a0dde038547b7e791ae6a0d7aa5' },
];

// ─── PROXY OPCIONAL (mesmas envs do copy bot) ────────────────────────────────
const PROXY_HOST = process.env.PROXY_HOST;
const PROXY_PORT = process.env.PROXY_PORT;
const PROXY_USER = process.env.PROXY_USER;
const PROXY_PASS = process.env.PROXY_PASS;

let proxyAgent = null;
if (PROXY_HOST && PROXY_PORT) {
  try {
    const { HttpsProxyAgent } = require('https-proxy-agent');
    const auth = PROXY_USER && PROXY_PASS ? `${PROXY_USER}:${PROXY_PASS}@` : '';
    proxyAgent = new HttpsProxyAgent(`http://${auth}${PROXY_HOST}:${PROXY_PORT}`);
    console.log(`✅ Proxy: ${PROXY_HOST}:${PROXY_PORT}\n`);
  } catch(e) {
    console.log(`⚠️  https-proxy-agent não instalado, sem proxy\n`);
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const opts = {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      ...(proxyAgent ? { agent: proxyAgent } : {}),
    };
    const req = https.get(url, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`JSON parse: ${data.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function fmt(n, decimals = 2) {
  if (typeof n !== 'number' || isNaN(n)) return 'N/A';
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtPct(n) {
  if (typeof n !== 'number' || isNaN(n)) return 'N/A';
  return (n * 100).toFixed(1) + '%';
}

function categorizeMarket(title, eventSlug) {
  const t = ((title || '') + ' ' + (eventSlug || '')).toLowerCase();
  if (/cs2|csgo|counter|dota|valorant|league of legends|lol\b|esports|map \d/i.test(t)) return 'esports';
  if (/election|trump|biden|president|senate|congress|polit/i.test(t)) return 'politica';
  if (/bitcoin|ethereum|btc|eth|crypto|coinbase/i.test(t)) return 'crypto';
  if (/nfl|nba|mlb|nhl|ufc|fight|win|defeat|beat/i.test(t)) return 'sports';
  return 'outros';
}

function daysSince(ts) {
  return (Date.now() / 1000 - ts) / 86400;
}

// ─── ANÁLISE POR CARTEIRA ────────────────────────────────────────────────────
async function analyzeWallet(label, address) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 ${label}  —  ${address}`);
  console.log('═'.repeat(70));

  let activity, positions;
  try {
    [activity, positions] = await Promise.all([
      fetchJson(`https://data-api.polymarket.com/activity?user=${address}&limit=500&type=TRADE`),
      fetchJson(`https://data-api.polymarket.com/positions?user=${address}&limit=500`),
    ]);
  } catch(e) {
    console.log(`❌ Erro buscando dados: ${e.message}`);
    return null;
  }

  if (!Array.isArray(activity)) activity = [];
  if (!Array.isArray(positions)) positions = [];

  if (activity.length === 0 && positions.length === 0) {
    console.log(`⚠️  Sem dados disponíveis (carteira nova ou inativa?)`);
    return null;
  }

  // ─── ATIVIDADE ──────────────────────────────────────────────────────────
  const buys  = activity.filter(t => (t.side || '').toUpperCase() === 'BUY');
  const sells = activity.filter(t => (t.side || '').toUpperCase() === 'SELL');

  const totalVolumeBuy  = buys.reduce((sum, t) => sum + (t.usdcSize || 0), 0);
  const totalVolumeSell = sells.reduce((sum, t) => sum + (t.usdcSize || 0), 0);
  const totalVolume     = totalVolumeBuy + totalVolumeSell;

  const avgBuy = buys.length ? totalVolumeBuy / buys.length : 0;

  // Janelas temporais
  const now = Date.now() / 1000;
  const last7d  = activity.filter(t => now - t.timestamp < 7*86400);
  const last30d = activity.filter(t => now - t.timestamp < 30*86400);
  const last90d = activity.filter(t => now - t.timestamp < 90*86400);

  const oldest = activity.length ? activity.reduce((min, t) => Math.min(min, t.timestamp), Infinity) : null;
  const newest = activity.length ? activity.reduce((max, t) => Math.max(max, t.timestamp), 0) : null;
  const ageDays = oldest ? daysSince(oldest) : 0;
  const lastTradeDays = newest ? daysSince(newest) : 0;

  // ─── CATEGORIZAÇÃO ──────────────────────────────────────────────────────
  const categories = { esports: 0, sports: 0, politica: 0, crypto: 0, outros: 0 };
  const catVolume  = { esports: 0, sports: 0, politica: 0, crypto: 0, outros: 0 };
  for (const t of buys) {
    const cat = categorizeMarket(t.title, t.eventSlug);
    categories[cat]++;
    catVolume[cat] += (t.usdcSize || 0);
  }

  // ─── POSIÇÕES ──────────────────────────────────────────────────────────
  const openPositions = positions.filter(p => p.size > 0);
  let currentValue   = 0;
  let initialValue   = 0;
  let realizedPnl    = 0;
  for (const p of positions) {
    currentValue += (p.currentValue || 0);
    initialValue += (p.initialValue || 0);
    realizedPnl  += (p.realizedPnl || 0);
  }
  const unrealizedPnl = currentValue - initialValue;
  const totalPnl      = realizedPnl + unrealizedPnl;

  // Winrate (entre posições com realizedPnl != 0)
  const closedPositions = positions.filter(p =>
    typeof p.realizedPnl === 'number' && p.realizedPnl !== 0 && p.size === 0
  );
  const wins = closedPositions.filter(p => p.realizedPnl > 0).length;
  const losses = closedPositions.filter(p => p.realizedPnl < 0).length;
  const winrate = closedPositions.length ? wins / closedPositions.length : null;

  // ─── OUTPUT ─────────────────────────────────────────────────────────────
  console.log(`\n📅 ATIVIDADE`);
  console.log(`  Idade da carteira:   ${ageDays.toFixed(0)} dias`);
  console.log(`  Último trade:        ${lastTradeDays.toFixed(1)} dias atrás`);
  console.log(`  Total de trades:     ${activity.length}  (${buys.length} BUY, ${sells.length} SELL)`);
  console.log(`  Trades últimos 7d:   ${last7d.length}`);
  console.log(`  Trades últimos 30d:  ${last30d.length}`);
  console.log(`  Trades últimos 90d:  ${last90d.length}`);
  console.log(`  Frequência:          ${ageDays > 0 ? (activity.length / ageDays * 7).toFixed(1) : 'N/A'} trades/semana (média)`);

  console.log(`\n💰 VOLUME`);
  console.log(`  Volume total:        $${fmt(totalVolume, 0)}`);
  console.log(`    BUY:               $${fmt(totalVolumeBuy, 0)}`);
  console.log(`    SELL:              $${fmt(totalVolumeSell, 0)}`);
  console.log(`  Aposta média (BUY):  $${fmt(avgBuy, 0)}`);

  console.log(`\n📈 P&L (de positions API)`);
  console.log(`  Valor inicial:       $${fmt(initialValue)}`);
  console.log(`  Valor atual:         $${fmt(currentValue)}`);
  console.log(`  P&L não realizado:   ${unrealizedPnl >= 0 ? '+' : ''}$${fmt(unrealizedPnl)}`);
  console.log(`  P&L realizado:       ${realizedPnl >= 0 ? '+' : ''}$${fmt(realizedPnl)}`);
  console.log(`  P&L total:           ${totalPnl >= 0 ? '+' : ''}$${fmt(totalPnl)}`);
  if (initialValue > 0) {
    console.log(`  ROI total:           ${fmtPct(totalPnl / initialValue)}`);
  }

  if (closedPositions.length > 0) {
    console.log(`\n🎯 WINRATE (posições fechadas)`);
    console.log(`  Posições fechadas:   ${closedPositions.length}`);
    console.log(`  Wins:                ${wins}`);
    console.log(`  Losses:              ${losses}`);
    console.log(`  Winrate:             ${fmtPct(winrate)}`);
  }

  console.log(`\n🎮 DISTRIBUIÇÃO POR CATEGORIA (BUY count)`);
  const totalBuyCount = buys.length || 1;
  for (const cat of ['esports', 'sports', 'politica', 'crypto', 'outros']) {
    const pct = (categories[cat] / totalBuyCount * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(categories[cat] / totalBuyCount * 30));
    console.log(`  ${cat.padEnd(10)} ${categories[cat].toString().padStart(4)} trades (${pct}%) $${fmt(catVolume[cat], 0).padStart(10)}  ${bar}`);
  }

  console.log(`\n📌 POSIÇÕES ABERTAS: ${openPositions.length}`);
  if (openPositions.length > 0 && openPositions.length <= 10) {
    for (const p of openPositions.slice(0, 10)) {
      const pnl = (p.currentValue || 0) - (p.initialValue || 0);
      const pnlSign = pnl >= 0 ? '+' : '';
      console.log(`  ${(p.title || '?').slice(0, 50).padEnd(50)} ${pnlSign}$${fmt(pnl)}`);
    }
  }

  // Retorna métricas pra ranking
  return {
    label, address,
    activity: activity.length, ageDays,
    trades7d: last7d.length, trades30d: last30d.length,
    totalVolume, avgBuy,
    totalPnl, realizedPnl, unrealizedPnl, initialValue,
    roi: initialValue > 0 ? totalPnl / initialValue : null,
    winrate, closedCount: closedPositions.length,
    categories, catVolume,
    lastTradeDays,
  };
}

// ─── RANKING FINAL ───────────────────────────────────────────────────────────
function printRanking(results) {
  const valid = results.filter(r => r !== null);
  if (valid.length === 0) return;

  console.log(`\n\n${'═'.repeat(70)}`);
  console.log(`🏆 RANKING FINAL`);
  console.log('═'.repeat(70));

  console.log('\n📊 Por VOLUME total:');
  [...valid].sort((a,b) => b.totalVolume - a.totalVolume).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.label.padEnd(15)} $${fmt(r.totalVolume, 0).padStart(10)}`);
  });

  console.log('\n💎 Por ROI:');
  [...valid].filter(r => r.roi !== null).sort((a,b) => b.roi - a.roi).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.label.padEnd(15)} ${fmtPct(r.roi)}`);
  });

  console.log('\n⏰ Por ATIVIDADE recente (últimos 7d):');
  [...valid].sort((a,b) => b.trades7d - a.trades7d).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.label.padEnd(15)} ${r.trades7d} trades`);
  });

  console.log('\n🎮 Por % ESPORTS (foco do bot):');
  [...valid].forEach(r => {
    const totalBuy = Object.values(r.categories).reduce((a,b) => a+b, 0) || 1;
    const pctEsports = r.categories.esports / totalBuy;
    r._pctEsports = pctEsports;
  });
  [...valid].sort((a,b) => b._pctEsports - a._pctEsports).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.label.padEnd(15)} ${fmtPct(r._pctEsports)}`);
  });

  console.log('\n🎯 SCORE COMPOSTO (volume × roi × atividade × esports):');
  for (const r of valid) {
    // Score normalizado simples
    const volScore  = Math.log10(r.totalVolume + 1);                     // 0-5+
    const roiScore  = Math.max(-2, Math.min(2, (r.roi || 0) * 5));       // -2 a +2
    const actScore  = Math.min(2, Math.log10(r.trades7d + 1));           // 0-2
    const espScore  = r._pctEsports * 2;                                  // 0-2
    r._score = volScore + roiScore + actScore + espScore;
  }
  [...valid].sort((a,b) => b._score - a._score).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.label.padEnd(15)} score=${r._score.toFixed(2)}  | vol=$${fmt(r.totalVolume,0)} roi=${fmtPct(r.roi||0)} 7d=${r.trades7d} esports=${fmtPct(r._pctEsports)}`);
  });

  console.log('\n' + '═'.repeat(70));
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  console.log('🔍 Polymarket Wallet Analyzer\n');

  const results = [];
  for (const w of WALLETS) {
    const r = await analyzeWallet(w.label, w.address);
    results.push(r);
    await new Promise(r => setTimeout(r, 500));
  }

  printRanking(results);

  console.log('\n✅ Análise completa.\n');
})().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
