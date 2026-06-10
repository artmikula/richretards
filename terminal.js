// RR Terminal — vanilla JS, no build step.
// Each widget fetches independently and keeps its last good data in
// localStorage. Cached data renders instantly on load; if an API is down
// the widget keeps showing the old numbers (footer flips to "stale")
// instead of hanging on "loading".

const NOW = () => new Date();
const fmtTime = (d) => d.toISOString().slice(11, 19) + ' UTC';
const fmtNum = (n, digits = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
};
const pctClass = (n) => (n > 0 ? 't-pos' : n < 0 ? 't-neg' : 't-muted');
const pctStr  = (n) => (n > 0 ? '+' : '') + fmtNum(n, 2) + '%';

async function fetchJSON(url, timeoutMs = 8000, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && o.ts && o.data !== undefined) return o;
    }
  } catch (e) { /* ignore */ }
  return null;
}
function saveCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (e) { /* quota */ }
}

function setFoot(id, ok, ts) {
  const el = document.getElementById(id);
  if (!el) return;
  const when = fmtTime(new Date(ts || Date.now()));
  el.textContent = ok ? 'updated ' + when : 'stale · data from ' + when;
}

// Stale-while-revalidate widget runner: paint cached data immediately,
// refetch when past TTL, and never replace good data with an error state.
async function runWidget({ key, ttlMs, bodyId, footId, fetcher, renderer }) {
  const body = document.getElementById(bodyId);
  if (!body) return;
  const cached = readCache(key);
  if (cached) {
    try {
      renderer(cached.data);
      body.dataset.loaded = '1';
      setFoot(footId, true, cached.ts);
    } catch (e) { /* bad cache shape — refetch below */ }
  } else if (!body.dataset.loaded) {
    body.innerHTML = '<span class="t-loading">loading</span>';
  }
  if (cached && Date.now() - cached.ts < ttlMs) return;
  try {
    const data = await fetcher();
    renderer(data);
    saveCache(key, data);
    body.dataset.loaded = '1';
    setFoot(footId, true, Date.now());
  } catch (e) {
    if (body.dataset.loaded) {
      setFoot(footId, false, cached?.ts);
    } else {
      body.innerHTML = '<span class="t-err">-- DATA UNAVAILABLE --</span>';
      setFoot(footId, false, Date.now());
    }
  }
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

const shortAgo = (dateStr) => {
  const ms = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
};

// --- Widget: Crypto (CoinGecko — no API key, public) ---
const CRYPTO_ROWS = [
  ['BTC', 'bitcoin'], ['ETH', 'ethereum'], ['SOL', 'solana'],
  ['XRP', 'ripple'], ['DOGE', 'dogecoin'], ['ADA', 'cardano'],
];

async function fetchCrypto() {
  const ids = CRYPTO_ROWS.map(r => r[1]).join(',');
  return fetchJSON(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
}

function renderCryptoBody(data) {
  document.getElementById('crypto-body').innerHTML = CRYPTO_ROWS.map(([sym, id]) => {
    const d = data?.[id];
    if (!d) return `<div class="t-row"><span class="sym">${sym}</span><span class="t-muted">--</span></div>`;
    const chg = d.usd_24h_change;
    return `<div class="t-row"><span class="sym">${sym}</span><span>$${fmtNum(d.usd, d.usd < 1 ? 4 : 2)} <span class="${pctClass(chg)}">${pctStr(chg)}</span></span></div>`;
  }).join('');
}

// --- Widget: Stocks (TradingView scanner — no key, CORS enabled) ---
// Yahoo Finance blocks browser CORS and the public proxies died, so the
// old multi-proxy approach is gone.
const STOCK_SYMBOLS = [
  ['AMEX:SPY', 'SPY'], ['NASDAQ:QQQ', 'QQQ'], ['NASDAQ:NVDA', 'NVDA'],
  ['NASDAQ:TSLA', 'TSLA'], ['NYSE:GME', 'GME'], ['NYSE:AMC', 'AMC'],
];

async function fetchStocks() {
  // no Content-Type header: keeps this a simple request (no CORS preflight),
  // which TradingView's scanner requires
  const j = await fetchJSON('https://scanner.tradingview.com/america/scan', 8000, {
    method: 'POST',
    body: JSON.stringify({
      symbols: { tickers: STOCK_SYMBOLS.map(s => s[0]), query: { types: [] } },
      columns: ['name', 'close', 'change'],
    }),
  });
  if (!Array.isArray(j?.data) || j.data.length === 0) throw new Error('no data');
  const bySym = {};
  j.data.forEach(r => { bySym[r.s] = { price: r.d?.[1], chg: r.d?.[2] }; });
  return STOCK_SYMBOLS.map(([tv, sym]) => ({ sym, ...(bySym[tv] || {}) }));
}

function renderStocksBody(rows) {
  document.getElementById('stocks-body').innerHTML = rows.map(({ sym, price, chg }) => {
    if (price == null) return `<div class="t-row"><span class="sym">${sym}</span><span class="t-muted">--</span></div>`;
    return `<div class="t-row"><span class="sym">${sym}</span><span>$${fmtNum(price, 2)} <span class="${pctClass(chg)}">${pctStr(chg)}</span></span></div>`;
  }).join('');
}

// --- Widget: Fear & Greed (alternative.me — no API key) ---
async function fetchFG() {
  const data = await fetchJSON('https://api.alternative.me/fng/?limit=1');
  const item = data?.data?.[0];
  if (!item) throw new Error('no data');
  const v = parseInt(item.value, 10);
  if (Number.isNaN(v)) throw new Error('bad value');
  return { value: v, label: String(item.value_classification || '') };
}

function renderFGBody({ value: v, label: rawLabel }) {
  const colorMap = { 'EXTREME FEAR': '#ff3b3b', 'FEAR': '#ff8a00', 'NEUTRAL': '#cccccc', 'GREED': '#9ad929', 'EXTREME GREED': '#00d084' };
  const label = colorMap[rawLabel.toUpperCase()] ? rawLabel.toUpperCase() : 'NEUTRAL';
  const color = colorMap[label];
  const filled = Math.max(0, Math.min(10, Math.round(v / 10)));
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const body = document.getElementById('fg-body');
  body.innerHTML = '';
  body.appendChild(el('div', { style: `text-align:center;font-size:2rem;color:${color};line-height:1.1;` }, String(v)));
  body.appendChild(el('div', { style: `text-align:center;color:${color};letter-spacing:1px;font-size:0.85rem;` }, label));
  body.appendChild(el('div', { style: `text-align:center;color:${color};margin-top:6px;font-family:monospace;` }, bar));
  body.appendChild(el('div', { style: 'text-align:center;color:#555;font-size:0.7rem;margin-top:4px;' }, 'crypto · alternative.me'));
}

// --- Widget: BTC Dominance + Global Market Cap (CoinGecko /global — no key) ---
async function fetchMarket() {
  const data = await fetchJSON('https://api.coingecko.com/api/v3/global');
  if (!data?.data) throw new Error('no data');
  return data;
}

function renderMarketBody(data) {
  const g = data.data;
  const mcap    = g.total_market_cap?.usd ?? 0;
  const mcapChg = g.market_cap_change_percentage_24h_usd ?? 0;
  const btcDom  = g.market_cap_percentage?.btc ?? 0;
  const ethDom  = g.market_cap_percentage?.eth ?? 0;
  const coins   = g.active_cryptocurrencies ?? 0;

  const fmt$ = (n) => {
    if (n >= 1e12) return '$' + fmtNum(n / 1e12, 2) + 'T';
    if (n >= 1e9)  return '$' + fmtNum(n / 1e9,  2) + 'B';
    return '$' + fmtNum(n, 0);
  };

  document.getElementById('market-body').innerHTML = [
    `<div class="t-row"><span class="sym">TOTAL MCAP</span><span class="${pctClass(mcapChg)}">${fmt$(mcap)} <small>${pctStr(mcapChg)}</small></span></div>`,
    `<div class="t-row"><span class="sym">BTC DOM</span><span>${fmtNum(btcDom, 1)}%</span></div>`,
    `<div class="t-row"><span class="sym">ETH DOM</span><span>${fmtNum(ethDom, 1)}%</span></div>`,
    `<div class="t-row"><span class="sym">COINS</span><span class="t-muted">${coins.toLocaleString()}</span></div>`,
  ].join('');
}

// --- Fetch any RSS feed as JSON via rss2json (handles CORS + parsing) ---
async function fetchFeedJSON(url, src) {
  const api = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(url);
  const data = await fetchJSON(api, 8000);
  if (data?.status !== 'ok' || !Array.isArray(data.items)) throw new Error('rss2json: ' + (data?.message || 'bad response'));
  return data.items.slice(0, 8).map(it => ({
    src,
    title: (it.title || '').trim(),
    link:  (it.link  || '').trim(),
    date:  it.pubDate || '',
  })).filter(i => i.title && i.link);
}

// --- Widget: News (RSS feeds via rss2json) ---
async function fetchNews() {
  const feeds = [
    { src: 'CT',    url: 'https://cointelegraph.com/rss' },
    { src: 'CD',    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { src: 'WSB',   url: 'https://www.reddit.com/r/wallstreetbets/.rss' },
  ];
  const results = await Promise.allSettled(feeds.map(f => fetchFeedJSON(f.url, f.src)));
  const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  if (items.length === 0) throw new Error('no items');
  items.sort((a, b) => new Date(b.date) - new Date(a.date));
  return items.slice(0, 12);
}

function renderNewsBody(items) {
  const body = document.getElementById('news-body');
  body.innerHTML = '';
  items.forEach(it => {
    const href = safeURL(it.link);
    if (!href) return;
    body.appendChild(el('a', { class: 't-newsitem', href, target: '_blank', rel: 'noopener noreferrer' }, [
      el('span', { class: 'src' }, it.src),
      ' ' + String(it.title).slice(0, 120) + ' ',
      el('span', { class: 'when' }, shortAgo(it.date)),
    ]));
  });
}

// --- Widget: Rug Pulls & Hacks (rekt.news RSS) ---
async function fetchRekt() {
  const items = await fetchFeedJSON('https://rekt.news/rss/feed.xml', 'REKT');
  if (items.length === 0) throw new Error('no items');
  return items.slice(0, 8);
}

function renderRektBody(items) {
  const body = document.getElementById('rekt-body');
  body.innerHTML = '';
  items.forEach(it => {
    const href = safeURL(it.link);
    if (!href) return;
    body.appendChild(el('a', { class: 't-newsitem', href, target: '_blank', rel: 'noopener noreferrer' }, [
      el('span', { class: 'src' }, 'REKT'),
      ' ' + String(it.title).slice(0, 120) + ' ',
      el('span', { class: 'when' }, shortAgo(it.date)),
    ]));
  });
}

// --- Clock ---
function renderClock() {
  const clockEl = document.getElementById('terminalClock');
  if (clockEl) clockEl.textContent = fmtTime(NOW());
}

// --- Init ---
const WIDGETS = [
  { key: 'rr:crypto2', ttlMs: 60_000,      bodyId: 'crypto-body', footId: 'crypto-foot', fetcher: fetchCrypto, renderer: renderCryptoBody, intervalMs: 60_000 },
  { key: 'rr:stocks2', ttlMs: 60_000,      bodyId: 'stocks-body', footId: 'stocks-foot', fetcher: fetchStocks, renderer: renderStocksBody, intervalMs: 60_000 },
  { key: 'rr:fng2',    ttlMs: 5 * 60_000,  bodyId: 'fg-body',     footId: 'fg-foot',     fetcher: fetchFG,     renderer: renderFGBody,     intervalMs: 5 * 60_000 },
  { key: 'rr:global2', ttlMs: 5 * 60_000,  bodyId: 'market-body', footId: 'market-foot', fetcher: fetchMarket, renderer: renderMarketBody, intervalMs: 5 * 60_000 },
  { key: 'rr:news5',   ttlMs: 30 * 60_000, bodyId: 'news-body',   footId: 'news-foot',   fetcher: fetchNews,   renderer: renderNewsBody,   intervalMs: 30 * 60_000 },
  { key: 'rr:rekt4',   ttlMs: 30 * 60_000, bodyId: 'rekt-body',   footId: 'rekt-foot',   fetcher: fetchRekt,   renderer: renderRektBody,   intervalMs: 30 * 60_000 },
];

function init() {
  renderClock();
  setInterval(renderClock, 1000);
  WIDGETS.forEach(w => {
    runWidget(w);
    setInterval(() => runWidget(w), w.intervalMs);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
