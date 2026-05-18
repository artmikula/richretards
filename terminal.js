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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
