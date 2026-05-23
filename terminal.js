// RR Terminal — vanilla JS, no build step.
// Each widget fetches independently. A widget failure does not affect others.

const NOW = () => new Date();
const fmtTime = (d) => d.toISOString().slice(11, 19) + ' UTC';
const fmtNum = (n, digits = 2) => {
  if (n === null || n === undefined || Number.isNaN(n)) return '--';
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });
};
const pctClass = (n) => (n > 0 ? 't-pos' : n < 0 ? 't-neg' : 't-muted');
const pctStr  = (n) => (n > 0 ? '+' : '') + fmtNum(n, 2) + '%';

async function fetchJSON(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

async function fetchText(url, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(t); }
}

async function cachedFetch(key, fetcher, ttlMs) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts < ttlMs) return data;
    }
  } catch (e) { /* ignore */ }
  const data = await fetcher();
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch (e) { /* quota */ }
  return data;
}

// CORS proxies tried in order
const P1 = (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u);
const P2 = (u) => 'https://corsproxy.io/?url='          + encodeURIComponent(u);

async function proxiedJSON(url) {
  // Try direct (Yahoo often allows it), then two proxies
  for (const attempt of [url, P1(url), P2(url)]) {
    try { return await fetchJSON(attempt, 6000); } catch (_) {}
  }
  throw new Error('all sources failed');
}

async function proxiedText(url) {
  for (const attempt of [P1(url), P2(url)]) {
    try { return await fetchText(attempt, 8000); } catch (_) {}
  }
  throw new Error('all sources failed');
}

function setLoading(bodyId) {
  const body = document.getElementById(bodyId);
  if (!body || body.dataset.loaded) return;
  body.innerHTML = '<span class="t-loading">loading</span>';
}

function setFoot(id, ok = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (ok ? 'updated ' : 'stale ') + fmtTime(NOW());
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

// --- Parse RSS XML in-browser (no third-party JSON wrapper needed) ---
function parseRSS(xmlText, src) {
  try {
    const doc = new DOMParser().parseFromString(xmlText, 'text/xml');
    return Array.from(doc.querySelectorAll('item, entry')).slice(0, 8).map(item => {
      const title = item.querySelector('title')?.textContent || '';
      // <link> can be element text or href attribute (Atom)
      const linkEl = item.querySelector('link');
      const link = linkEl?.getAttribute('href') || linkEl?.textContent || '';
      const date = item.querySelector('pubDate, published, updated')?.textContent || '';
      return { src, title: title.trim(), link: link.trim(), date };
    }).filter(i => i.title && i.link);
  } catch (e) { return []; }
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
async function renderCrypto() {
  setLoading('crypto-body');
  const ids = 'bitcoin,ethereum,solana,ripple,dogecoin,cardano';
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  try {
    const data = await cachedFetch('rr:crypto', () => fetchJSON(url), 60_000);
    const rows = [
      ['BTC',  data.bitcoin],
      ['ETH',  data.ethereum],
      ['SOL',  data.solana],
      ['XRP',  data.ripple],
      ['DOGE', data.dogecoin],
      ['ADA',  data.cardano],
    ].map(([sym, d]) => {
      if (!d) return `<div class="t-row"><span class="sym">${sym}</span><span class="t-muted">--</span></div>`;
      const chg = d.usd_24h_change;
      return `<div class="t-row"><span class="sym">${sym}</span><span>$${fmtNum(d.usd, d.usd < 1 ? 4 : 2)} <span class="${pctClass(chg)}">${pctStr(chg)}</span></span></div>`;
    }).join('');
    document.getElementById('crypto-body').innerHTML = rows;
    setFoot('crypto-foot', true);
  } catch (e) { setError('crypto-body', 'crypto-foot'); }
}

// --- Widget: Stocks (Yahoo Finance, multi-proxy fallback) ---
async function renderStocks() {
  setLoading('stocks-body');
  const symbols = ['SPY', 'QQQ', 'NVDA', 'TSLA', 'GME', 'AMC'];
  const fetchOne = async (sym) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=2d`;
    const data = await proxiedJSON(url);
    const r = data?.chart?.result?.[0];
    if (!r) throw new Error('no result');
    const { regularMarketPrice: price, chartPreviousClose, previousClose } = r.meta;
    const prev = chartPreviousClose ?? previousClose ?? price;
    const chg = prev ? ((price - prev) / prev) * 100 : 0;
    return { sym, price, chg };
  };

  const results = await Promise.allSettled(symbols.map(fetchOne));
  const anyOk = results.some(r => r.status === 'fulfilled');
  if (!anyOk) { setError('stocks-body', 'stocks-foot'); return; }

  document.getElementById('stocks-body').innerHTML = results.map((res, i) => {
    const sym = symbols[i];
    if (res.status !== 'fulfilled') return `<div class="t-row"><span class="sym">${sym}</span><span class="t-muted">--</span></div>`;
    const { price, chg } = res.value;
    return `<div class="t-row"><span class="sym">${sym}</span><span>$${fmtNum(price, 2)} <span class="${pctClass(chg)}">${pctStr(chg)}</span></span></div>`;
  }).join('');
  setFoot('stocks-foot', true);
}

// --- Widget: Fear & Greed (alternative.me — no API key) ---
async function renderFG() {
  setLoading('fg-body');
  try {
    const data = await fetchJSON('https://api.alternative.me/fng/?limit=1');
    const item = data?.data?.[0];
    if (!item) throw new Error('no data');
    const v = parseInt(item.value, 10);
    if (Number.isNaN(v)) throw new Error('bad value');
    const rawLabel = String(item.value_classification || '').toUpperCase();
    const colorMap = { 'EXTREME FEAR': '#ff3b3b', 'FEAR': '#ff8a00', 'NEUTRAL': '#cccccc', 'GREED': '#9ad929', 'EXTREME GREED': '#00d084' };
    const label = colorMap[rawLabel] ? rawLabel : 'NEUTRAL';
    const color = colorMap[label];
    const bar = '█'.repeat(Math.max(0, Math.min(10, Math.round(v / 10)))) + '░'.repeat(10 - Math.max(0, Math.min(10, Math.round(v / 10))));
    const body = document.getElementById('fg-body');
    body.innerHTML = '';
    body.appendChild(el('div', { style: `text-align:center;font-size:2rem;color:${color};line-height:1.1;` }, String(v)));
    body.appendChild(el('div', { style: `text-align:center;color:${color};letter-spacing:1px;font-size:0.85rem;` }, label));
    body.appendChild(el('div', { style: `text-align:center;color:${color};margin-top:6px;font-family:monospace;` }, bar));
    body.appendChild(el('div', { style: 'text-align:center;color:#555;font-size:0.7rem;margin-top:4px;' }, 'crypto · alternative.me'));
    setFoot('fg-foot', true);
  } catch (e) { setError('fg-body', 'fg-foot'); }
}

// --- Widget: BTC Dominance + Global Market Cap (CoinGecko /global — no key) ---
async function renderMarket() {
  setLoading('market-body');
  try {
    const data = await cachedFetch('rr:global', () => fetchJSON('https://api.coingecko.com/api/v3/global'), 5 * 60_000);
    const g = data?.data;
    if (!g) throw new Error('no data');

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

    const body = document.getElementById('market-body');
    body.innerHTML = [
      `<div class="t-row"><span class="sym">TOTAL MCAP</span><span class="${pctClass(mcapChg)}">${fmt$(mcap)} <small>${pctStr(mcapChg)}</small></span></div>`,
      `<div class="t-row"><span class="sym">BTC DOM</span><span>${fmtNum(btcDom, 1)}%</span></div>`,
      `<div class="t-row"><span class="sym">ETH DOM</span><span>${fmtNum(ethDom, 1)}%</span></div>`,
      `<div class="t-row"><span class="sym">COINS</span><span class="t-muted">${coins.toLocaleString()}</span></div>`,
    ].join('');
    setFoot('market-foot', true);
  } catch (e) { setError('market-body', 'market-foot'); }
}

// --- Widget: News (RSS feeds, parsed in-browser via allorigins proxy) ---
async function renderNews() {
  setLoading('news-body');
  const feeds = [
    { src: 'CT',    url: 'https://cointelegraph.com/rss' },
    { src: 'CD',    url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
    { src: 'WSB',   url: 'https://www.reddit.com/r/wallstreetbets/.rss' },
  ];
  try {
    const results = await Promise.allSettled(feeds.map(f =>
      cachedFetch('rr:news3:' + f.src, () => proxiedText(f.url).then(xml => parseRSS(xml, f.src)), 30 * 60_000)
    ));
    const items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    if (items.length === 0) throw new Error('no items');
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    const body = document.getElementById('news-body');
    body.innerHTML = '';
    items.slice(0, 12).forEach(it => {
      const href = safeURL(it.link);
      if (!href) return;
      body.appendChild(el('a', { class: 't-newsitem', href, target: '_blank', rel: 'noopener noreferrer' }, [
        el('span', { class: 'src' }, it.src),
        ' ' + String(it.title).slice(0, 120) + ' ',
        el('span', { class: 'when' }, shortAgo(it.date)),
      ]));
    });
    setFoot('news-foot', true);
  } catch (e) { setError('news-body', 'news-foot'); }
}

// --- Widget: Rug Pulls & Hacks (rekt.news RSS) ---
async function renderRekt() {
  setLoading('rekt-body');
  const url = 'https://rekt.news/rss/feed.xml';
  try {
    const items = await cachedFetch('rr:rekt2', () => proxiedText(url).then(xml => parseRSS(xml, 'REKT')), 30 * 60_000);
    if (items.length === 0) throw new Error('no items');
    const body = document.getElementById('rekt-body');
    body.innerHTML = '';
    items.slice(0, 8).forEach(it => {
      const href = safeURL(it.link);
      if (!href) return;
      const ago = shortAgo(it.date);
      body.appendChild(el('a', { class: 't-newsitem', href, target: '_blank', rel: 'noopener noreferrer' }, [
        el('span', { class: 'src' }, 'REKT'),
        ' ' + String(it.title).slice(0, 120) + ' ',
        el('span', { class: 'when' }, ago),
      ]));
    });
    setFoot('rekt-foot', true);
  } catch (e) { setError('rekt-body', 'rekt-foot'); }
}

// --- Clock ---
function renderClock() {
  const clockEl = document.getElementById('terminalClock');
  if (clockEl) clockEl.textContent = fmtTime(NOW());
}

// --- Init ---
function init() {
  renderClock();
  setInterval(renderClock, 1000);

  renderCrypto();
  setInterval(renderCrypto, 60_000);

  renderStocks();
  setInterval(renderStocks, 60_000);

  renderFG();
  setInterval(renderFG, 5 * 60_000);

  renderMarket();
  setInterval(renderMarket, 5 * 60_000);

  renderNews();
  setInterval(renderNews, 30 * 60_000);

  renderRekt();
  setInterval(renderRekt, 30 * 60_000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
