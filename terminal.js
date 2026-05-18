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

function safeURL(u) {
  return typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null;
}

function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') node.className = attrs[k];
    else node.setAttribute(k, attrs[k]);
  }
  if (children != null) {
    if (Array.isArray(children)) children.forEach(c => c && node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    else node.appendChild(typeof children === 'string' ? document.createTextNode(children) : children);
  }
  return node;
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
    if (Number.isNaN(v)) throw new Error('bad value');
    const rawLabel = String(item.value_classification || '').toUpperCase();
    const colorMap = {
      'EXTREME FEAR': '#ff3b3b',
      'FEAR': '#ff8a00',
      'NEUTRAL': '#cccccc',
      'GREED': '#9ad929',
      'EXTREME GREED': '#00d084',
    };
    const label = colorMap[rawLabel] ? rawLabel : 'NEUTRAL';
    const color = colorMap[label];
    const blocks = Math.max(0, Math.min(10, Math.round(v / 10)));
    const bar = '█'.repeat(blocks) + '░'.repeat(10 - blocks);
    const body = document.getElementById('fg-body');
    body.innerHTML = '';
    body.appendChild(el('div', { style: `text-align:center;font-size:2rem;color:${color};line-height:1.1;` }, String(v)));
    body.appendChild(el('div', { style: `text-align:center;color:${color};letter-spacing:1px;font-size:0.85rem;` }, label));
    body.appendChild(el('div', { style: `text-align:center;color:${color};margin-top:6px;font-family:monospace;` }, bar));
    body.appendChild(el('div', { style: 'text-align:center;color:#555;font-size:0.7rem;margin-top:4px;' }, 'crypto · alternative.me'));
    setFoot('fg-foot', true);
  } catch (e) {
    setError('fg-body', 'fg-foot');
  }
}

// --- Widget: ETH Gas (Etherscan gas oracle) ---
async function renderGas() {
  try {
    const data = await fetchJSON('https://api.etherscan.io/api?module=gastracker&action=gasoracle');
    if (!data || data.status !== '1' || !data.result) throw new Error('bad response');
    const slow = Number(data.result.SafeGasPrice);
    const avg = Number(data.result.ProposeGasPrice);
    const fast = Number(data.result.FastGasPrice);
    if (![slow, avg, fast].every(Number.isFinite)) throw new Error('bad gas');
    const body = document.getElementById('gas-body');
    const row = (label, n) => el('div', { class: 't-row' }, [
      el('span', { class: 'sym' }, label),
      el('span', null, fmtNum(n, 1) + ' gwei'),
    ]);
    body.innerHTML = '';
    body.appendChild(row('SLOW', slow));
    body.appendChild(row('AVG', avg));
    body.appendChild(row('FAST', fast));
    body.appendChild(el('div', { style: 'margin-top:6px;color:#555;font-size:0.7rem;' }, 'mainnet · etherscan'));
    setFoot('gas-foot', true);
  } catch (e) {
    setError('gas-body', 'gas-foot');
  }
}

// --- Widget: News (RSS via rss2json) ---
async function renderNews() {
  const feeds = [
    { src: 'COINDESK', url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { src: 'DECRYPT',  url: 'https://decrypt.co/feed' },
    { src: 'YFINANCE', url: 'https://finance.yahoo.com/news/rssindex' },
  ];
  const proxy = (u) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(u)}&count=8`;
  const shortAgo = (iso) => {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60000);
    if (m < 60) return m + 'm';
    const h = Math.floor(m / 60);
    if (h < 24) return h + 'h';
    return Math.floor(h / 24) + 'd';
  };
  try {
    const results = await Promise.allSettled(feeds.map(f => fetchJSON(proxy(f.url))));
    const items = [];
    results.forEach((res, i) => {
      if (res.status !== 'fulfilled') return;
      const feed = res.value;
      if (!feed.items) return;
      feed.items.slice(0, 6).forEach(it => items.push({
        src: feeds[i].src,
        title: it.title,
        link: it.link,
        date: it.pubDate,
      }));
    });
    if (items.length === 0) throw new Error('no items');
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    const body = document.getElementById('news-body');
    body.innerHTML = '';
    items.slice(0, 12).forEach(it => {
      const href = safeURL(it.link);
      if (!href) return;
      const a = el('a', { class: 't-newsitem', href, target: '_blank', rel: 'noopener noreferrer' }, [
        el('span', { class: 'src' }, String(it.src)),
        ' ' + String(it.title || '').slice(0, 200) + ' ',
        el('span', { class: 'when' }, shortAgo(it.date)),
      ]);
      body.appendChild(a);
    });
    setFoot('news-foot', true);
  } catch (e) {
    setError('news-body', 'news-foot');
  }
}

// --- Widget: Rug pulls / hacks (rekt.news RSS via rss2json) ---
async function renderRekt() {
  const url = 'https://api.rss2json.com/v1/api.json?rss_url=' +
              encodeURIComponent('https://rekt.news/rss/feed.xml') + '&count=8';
  const shortAgo = (iso) => {
    const ms = Date.now() - new Date(iso).getTime();
    const d = Math.floor(ms / 86400000);
    if (d < 1) return 'today';
    if (d < 7) return d + 'd';
    return Math.floor(d / 7) + 'w';
  };
  try {
    const feed = await fetchJSON(url);
    if (!feed.items || feed.items.length === 0) throw new Error('no items');
    const body = document.getElementById('rekt-body');
    body.innerHTML = '';
    feed.items.slice(0, 8).forEach(it => {
      const href = safeURL(it.link);
      if (!href) return;
      const a = el('a', { class: 't-newsitem', href, target: '_blank', rel: 'noopener noreferrer' }, [
        el('span', { class: 'src' }, 'REKT'),
        ' ' + String(it.title || '').slice(0, 200) + ' ',
        el('span', { class: 'when' }, shortAgo(it.pubDate)),
      ]);
      body.appendChild(a);
    });
    setFoot('rekt-foot', true);
  } catch (e) {
    setError('rekt-body', 'rekt-foot');
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

  renderGas();
  setInterval(renderGas, 60_000); // 1 minute

  renderNews();
  setInterval(renderNews, 30 * 60_000); // 30 minutes (rss2json free tier: 10 req/hr)

  renderRekt();
  setInterval(renderRekt, 30 * 60_000); // 30 minutes
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
