// RR Terminal — vanilla JS, no build step.
// Each widget fetches independently. A widget failure does not affect others.

const NOW = () => new Date();
const fmtTime = (d) => d.toISOString().slice(11, 19) + ' UTC';
const fmtNum = (n, digits = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
};
const pctClass = (n) => (n > 0 ? 't-pos' : n < 0 ? 't-neg' : 't-muted');
const pctStr = (n) => (n > 0 ? '+' : '') + fmtNum(n, 2) + '%';

async function fetchJSON(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function setFoot(id, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (ok ? 'updated ' : 'stale since ') + fmtTime(NOW());
}

function setError(bodyId, footId) {
  const body = document.getElementById(bodyId);
  if (body) body.innerHTML = '<span class="t-err">-- DATA UNAVAILABLE --</span>';
  setFoot(footId, false);
}

// --- Widget: Crypto (CoinGecko) ---
async function renderCrypto() {
  const ids = 'bitcoin,ethereum,solana,ripple,dogecoin,cardano';
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  try {
    const data = await fetchJSON(url);
    const rows = [
      ['BTC', data.bitcoin],
      ['ETH', data.ethereum],
      ['SOL', data.solana],
      ['XRP', data.ripple],
      ['DOGE', data.dogecoin],
      ['ADA', data.cardano],
    ].map(([sym, d]) => {
      if (!d) return `<div class="t-row"><span class="sym">${sym}</span><span class="t-muted">--</span></div>`;
      const chg = d.usd_24h_change;
      return `<div class="t-row">
        <span class="sym">${sym}</span>
        <span>$${fmtNum(d.usd, d.usd < 1 ? 4 : 2)} <span class="${pctClass(chg)}">${pctStr(chg)}</span></span>
      </div>`;
    }).join('');
    document.getElementById('crypto-body').innerHTML = rows;
    setFoot('crypto-foot', true);
  } catch (e) {
    setError('crypto-body', 'crypto-foot');
  }
}

// --- Widget: Stocks / Indices (Yahoo Finance v8 chart endpoint, CORS-friendly) ---
async function renderStocks() {
  const symbols = ['SPY', 'QQQ', 'NVDA', 'TSLA', 'GME', 'AMC'];
  const fetchOne = async (sym) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`;
    const data = await fetchJSON(url);
    const r = data && data.chart && data.chart.result && data.chart.result[0];
    if (!r) throw new Error('no result');
    const meta = r.meta;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? price;
    const chg = prev ? ((price - prev) / prev) * 100 : 0;
    return { sym, price, chg };
  };

  try {
    const results = await Promise.allSettled(symbols.map(fetchOne));
    const rows = results.map((res, i) => {
      const sym = symbols[i];
      if (res.status !== 'fulfilled') {
        return `<div class="t-row"><span class="sym">${sym}</span><span class="t-muted">--</span></div>`;
      }
      const { price, chg } = res.value;
      return `<div class="t-row">
        <span class="sym">${sym}</span>
        <span>$${fmtNum(price, 2)} <span class="${pctClass(chg)}">${pctStr(chg)}</span></span>
      </div>`;
    }).join('');
    document.getElementById('stocks-body').innerHTML = rows;
    setFoot('stocks-foot', true);
  } catch (e) {
    setError('stocks-body', 'stocks-foot');
  }
}

// --- Widget: Fear & Greed (alternative.me — crypto index) ---
async function renderFG() {
  try {
    const data = await fetchJSON('https://api.alternative.me/fng/?limit=1');
    const item = data && data.data && data.data[0];
    if (!item) throw new Error('no data');
    const v = parseInt(item.value, 10);
    const label = item.value_classification.toUpperCase();
    const colorMap = {
      'EXTREME FEAR': '#ff3b3b',
      'FEAR': '#ff8a00',
      'NEUTRAL': '#cccccc',
      'GREED': '#9ad929',
      'EXTREME GREED': '#00d084',
    };
    const color = colorMap[label] || '#cccccc';
    const blocks = Math.round(v / 10); // 0..10 filled
    const bar = '█'.repeat(blocks) + '░'.repeat(10 - blocks);
    document.getElementById('fg-body').innerHTML = `
      <div style="text-align:center;font-size:2rem;color:${color};line-height:1.1;">${v}</div>
      <div style="text-align:center;color:${color};letter-spacing:1px;font-size:0.85rem;">${label}</div>
      <div style="text-align:center;color:${color};margin-top:6px;font-family:monospace;">${bar}</div>
      <div style="text-align:center;color:#555;font-size:0.7rem;margin-top:4px;">crypto · alternative.me</div>
    `;
    setFoot('fg-foot', true);
  } catch (e) {
    setError('fg-body', 'fg-foot');
  }
}

// --- Clock ---
function renderClock() {
  const el = document.getElementById('terminalClock');
  if (el) el.textContent = fmtTime(NOW());
}

// --- Init + refresh loop ---
function init() {
  renderClock();
  setInterval(renderClock, 1000);

  renderCrypto();
  setInterval(renderCrypto, 30_000);

  renderStocks();
  setInterval(renderStocks, 30_000);

  renderFG();
  setInterval(renderFG, 5 * 60_000); // 5 minutes
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
