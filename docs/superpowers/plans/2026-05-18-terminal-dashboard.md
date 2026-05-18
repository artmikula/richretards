# Terminal Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Bloomberg-style live finance terminal to the top of the homepage, make the newsletter signup actually capture emails via Buttondown, and add `ads.txt` for AdSense.

**Architecture:** Pure static site, no build step, no backend. Terminal is one `<section>` injected into `index.html` plus a single vanilla-JS file (`terminal.js`) that fetches free public APIs client-side and refreshes on timers. Newsletter form replaced with a Buttondown-hosted form action.

**Tech Stack:** Vanilla HTML + CSS + ES2019 JS. Free public APIs: CoinGecko, Yahoo Finance, alternative.me, Etherscan, rss2json. Buttondown for email capture.

**A note on testing:** This is a static HTML site with no test framework installed. Adding Jest/Playwright for an afternoon project violates YAGNI. Verification is manual: open the page in a browser, check the widget renders, check the network tab, check the console for errors. Each task ends with explicit verification steps and a commit.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `ads.txt` | Create | Single-line AdSense authorization at site root |
| `index.html` | Modify | Insert terminal `<section>` after header, replace fake newsletter form with Buttondown form, add `<script defer src="/terminal.js">` |
| `terminal.js` | Create | All terminal logic: `fetchJSON()` helper + one `renderXxx()` per widget + a 30-second refresh loop |

`terminal.js` is the only new code file. It's expected to be ~150–200 lines and is kept flat (no modules, no bundler) so it works from a static host with zero tooling.

---

### Task 1: Add `ads.txt`

**Files:**
- Create: `ads.txt`

- [ ] **Step 1: Create the file**

Create `/Users/artm/Code/richretards/ads.txt` with exactly this content (single line, no trailing whitespace):

```
google.com, pub-5691945685029042, DIRECT, f08c47fec0942fa0
```

- [ ] **Step 2: Verify locally**

Run: `cat ads.txt`
Expected output: `google.com, pub-5691945685029042, DIRECT, f08c47fec0942fa0`

- [ ] **Step 3: Commit**

```bash
git add ads.txt
git commit -m "Add ads.txt for AdSense authorization"
```

---

### Task 2: Replace fake newsletter signup with Buttondown form

**Files:**
- Modify: `index.html` (the `<div class="newsletter-box">` block, roughly lines 887–899, and the `fakeSubscribe()` function in the bottom `<script>` block roughly lines 1127–1140)

**Pre-step (one-time, manual):** Sign up at https://buttondown.email and note your username (the part before `@buttondown.email` in your profile URL). The free tier allows 100 subscribers. Throughout this task, replace `<USERNAME>` with that exact username.

- [ ] **Step 1: Replace the newsletter form markup**

Find this block in `index.html`:

```html
<div class="email-form">
  <input type="email" placeholder="your@email.com (we won't sell it... probably)" id="emailInput" />
  <button type="button" onclick="fakeSubscribe()">SUBSCRIBE!!!</button>
</div>
<p id="subMessage" style="margin-top:12px;display:none;"></p>
```

Replace with (substitute `<USERNAME>`):

```html
<form
  action="https://buttondown.email/api/emails/embed-subscribe/<USERNAME>"
  method="post"
  target="popupwindow"
  onsubmit="window.open('https://buttondown.email/<USERNAME>', 'popupwindow')"
  class="email-form"
>
  <input type="email" name="email" placeholder="your@email.com (we won't sell it... probably)" required />
  <button type="submit">SUBSCRIBE!!!</button>
</form>
<p style="margin-top:12px;font-size:0.75rem;color:#666;">
  📬 Double opt-in via Buttondown. Check your inbox to confirm.
</p>
```

- [ ] **Step 2: Remove the `fakeSubscribe` function and its Enter-key listener**

In the bottom `<script>` block of `index.html`, delete the entire `fakeSubscribe` function and the `document.getElementById('emailInput').addEventListener(...)` line that depends on it. The visitor-counter and online-count code stays.

Delete this block:

```javascript
// Fake subscriber
function fakeSubscribe() {
  const email = document.getElementById('emailInput').value;
  const msg = document.getElementById('subMessage');
  if (email && email.includes('@')) {
    msg.style.display = 'block';
    msg.style.color = '#00ff00';
    msg.innerHTML = '✅ WELCOME TO THE RETARD ARMY! Check your inbox (or spam, we end up there sometimes).';
    document.getElementById('emailInput').value = '';
  } else {
    msg.style.display = 'block';
    msg.style.color = '#ff0000';
    msg.innerHTML = '❌ That\'s not an email address, retard. Try again.';
  }
}
```

And this block:

```javascript
// Enter key for email
document.getElementById('emailInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fakeSubscribe();
});
```

- [ ] **Step 3: Verify in browser**

Open `index.html` locally (e.g. `python3 -m http.server 8000` then visit `http://localhost:8000`). Scroll to the newsletter box. Enter a real test email and click SUBSCRIBE. A Buttondown popup should appear confirming the subscription. Check your test email's inbox for the double opt-in message.

- [ ] **Step 4: Verify no JS console errors**

In the browser DevTools console, confirm there are no `ReferenceError: fakeSubscribe is not defined` errors and no errors about the missing `emailInput` element.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "Wire newsletter signup to Buttondown (replaces fake handler)"
```

---

### Task 3: Add terminal section HTML skeleton + scoped CSS (no data yet)

**Files:**
- Modify: `index.html` — insert a new `<section class="terminal">` immediately after the closing `</header>` tag (roughly line 669) and BEFORE the existing `<!-- AD BANNER 1 — STAKE -->` comment.

This task lands the visual frame. Widgets show `-- LOADING --` placeholders. No JS yet.

- [ ] **Step 1: Insert the terminal HTML**

Add this block between `</header>` and the `<!-- AD BANNER 1 — STAKE -->` comment:

```html
<!-- TERMINAL (sober finance dashboard) -->
<section class="terminal" id="terminal">
  <div class="terminal-bar">
    <span class="terminal-title">▓ RR TERMINAL</span>
    <span class="terminal-status" id="terminalStatus">● LIVE</span>
    <span class="terminal-clock" id="terminalClock">--:--:-- UTC</span>
  </div>

  <div class="terminal-grid">

    <div class="t-panel" id="panel-crypto">
      <div class="t-panel-head">▓ CRYPTO</div>
      <div class="t-panel-body" id="crypto-body">-- LOADING --</div>
      <div class="t-panel-foot" id="crypto-foot">updated --:--:--</div>
    </div>

    <div class="t-panel" id="panel-stocks">
      <div class="t-panel-head">▓ STOCKS / INDICES</div>
      <div class="t-panel-body" id="stocks-body">-- LOADING --</div>
      <div class="t-panel-foot" id="stocks-foot">updated --:--:--</div>
    </div>

    <div class="t-panel" id="panel-fg">
      <div class="t-panel-head">▓ FEAR &amp; GREED</div>
      <div class="t-panel-body" id="fg-body">-- LOADING --</div>
      <div class="t-panel-foot" id="fg-foot">updated --:--:--</div>
    </div>

    <div class="t-panel" id="panel-gas">
      <div class="t-panel-head">▓ ETH GAS</div>
      <div class="t-panel-body" id="gas-body">-- LOADING --</div>
      <div class="t-panel-foot" id="gas-foot">updated --:--:--</div>
    </div>

    <div class="t-panel t-panel-wide" id="panel-news">
      <div class="t-panel-head">▓ NEWS</div>
      <div class="t-panel-body" id="news-body">-- LOADING --</div>
      <div class="t-panel-foot" id="news-foot">updated --:--:--</div>
    </div>

    <div class="t-panel t-panel-wide" id="panel-rekt">
      <div class="t-panel-head">▓ RUG PULLS &amp; HACKS</div>
      <div class="t-panel-body" id="rekt-body">-- LOADING --</div>
      <div class="t-panel-foot" id="rekt-foot">updated --:--:--</div>
    </div>

  </div>
</section>
```

- [ ] **Step 2: Add scoped CSS for the terminal**

In `index.html`, scroll to the closing `</style>` tag of the existing `<style>` block (near line 634). Insert the following CSS immediately BEFORE that closing `</style>`. All selectors are scoped under `.terminal` so they cannot affect the existing chaos styles.

```css
/* === RR TERMINAL (sober) === */
.terminal {
  background: #0a0a0a;
  border-top: 1px solid #222;
  border-bottom: 1px solid #222;
  font-family: 'VT323', 'Courier New', monospace;
  color: #e0e0e0;
  padding: 12px 16px 16px;
  margin: 0;
  position: relative;
  z-index: 2;
}
.terminal-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  color: #888;
  border-bottom: 1px solid #1a1a1a;
  padding-bottom: 6px;
  margin-bottom: 10px;
  letter-spacing: 1px;
}
.terminal-title { color: #ffb000; font-weight: bold; }
.terminal-status { color: #00d084; }
.terminal-clock { color: #666; }

.terminal-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.t-panel {
  background: #0d0d0d;
  border: 1px solid #1f1f1f;
  padding: 8px 10px 6px;
  min-height: 140px;
  display: flex;
  flex-direction: column;
}
.t-panel-wide { grid-column: span 2; }
.t-panel-head {
  color: #ffb000;
  font-size: 0.85rem;
  letter-spacing: 1px;
  border-bottom: 1px solid #1a1a1a;
  padding-bottom: 4px;
  margin-bottom: 6px;
}
.t-panel-body {
  flex: 1;
  font-size: 1rem;
  line-height: 1.35;
  color: #e0e0e0;
  overflow: hidden;
}
.t-panel-foot {
  font-size: 0.7rem;
  color: #555;
  margin-top: 4px;
  letter-spacing: 1px;
}

.t-row { display: flex; justify-content: space-between; padding: 1px 0; }
.t-row .sym { color: #ccc; }
.t-pos { color: #00d084; }
.t-neg { color: #ff3b3b; }
.t-muted { color: #666; }
.t-err { color: #ff3b3b; }

.t-newsitem {
  display: block;
  font-size: 0.85rem;
  color: #ccc;
  text-decoration: none;
  padding: 2px 0;
  border-bottom: 1px dotted #1a1a1a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.t-newsitem:hover { color: #ffb000; }
.t-newsitem .src { color: #555; margin-right: 6px; }
.t-newsitem .when { color: #444; margin-left: 6px; font-size: 0.7rem; }

@media (max-width: 1024px) {
  .terminal-grid { grid-template-columns: repeat(2, 1fr); }
  .t-panel-wide { grid-column: span 2; }
}
@media (max-width: 600px) {
  .terminal-grid { grid-template-columns: 1fr; }
  .t-panel-wide { grid-column: span 1; }
}
```

- [ ] **Step 3: Verify in browser**

Reload `http://localhost:8000`. Below the loud RR header, you should see a black sober terminal section with 6 panels, each showing `-- LOADING --`. The rest of the page (stats bar, articles, newsletter, footer) should look exactly as before.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Add terminal section skeleton (no data wiring yet)"
```

---

### Task 4: Create `terminal.js` with core helpers + crypto widget

**Files:**
- Create: `terminal.js`
- Modify: `index.html` — add `<script defer src="/terminal.js"></script>` immediately before the closing `</body>` tag.

- [ ] **Step 1: Create `terminal.js`**

Create `/Users/artm/Code/richretards/terminal.js`:

```javascript
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
```

- [ ] **Step 2: Link the script from `index.html`**

In `index.html`, find the closing `</body>` tag (around line 1155). Immediately before it, add:

```html
<script defer src="/terminal.js"></script>
```

(There is already an inline `<script>` block above for the visitor counter — leave it untouched. The new line is for the terminal only.)

- [ ] **Step 3: Verify in browser**

Reload `http://localhost:8000`. Within ~2 seconds:
- The terminal clock in the top bar should tick every second.
- The CRYPTO panel should show 6 rows (BTC, ETH, SOL, XRP, DOGE, ADA) with dollar prices and a 24h % change in green or red.
- The other 5 panels should still show `-- LOADING --` (we wire them up next).

Open DevTools → Network and confirm one `api.coingecko.com` request returns 200.

- [ ] **Step 4: Commit**

```bash
git add terminal.js index.html
git commit -m "Add terminal.js with fetchJSON helper, clock, and crypto widget"
```

---

### Task 5: Add stocks/indices widget (Yahoo Finance)

**Files:**
- Modify: `terminal.js` — add `renderStocks()` function and register it in `init()`.

Note on the API: Yahoo's `query1.finance.yahoo.com/v7/finance/quote` endpoint sometimes blocks CORS from browsers. We use the `query2` host plus the `crumbless` `v8/finance/chart` endpoint as a fallback strategy. We use `chart` here because it reliably allows browser CORS.

- [ ] **Step 1: Add `renderStocks()` to `terminal.js`**

Insert the following function in `terminal.js` immediately after `renderCrypto()`:

```javascript
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
```

- [ ] **Step 2: Register it in `init()`**

In the `init()` function in `terminal.js`, add these two lines below the crypto calls:

```javascript
  renderStocks();
  setInterval(renderStocks, 30_000);
```

- [ ] **Step 3: Verify in browser**

Reload. The STOCKS / INDICES panel should now show SPY, QQQ, NVDA, TSLA, GME, AMC with prices and % change. If markets are closed the prices are still shown (last close).

Known limitation: Yahoo's endpoint may rate-limit or occasionally CORS-reject. If so, the panel falls back to `-- DATA UNAVAILABLE --`. That's acceptable for v1.

- [ ] **Step 4: Commit**

```bash
git add terminal.js
git commit -m "Add stocks widget (Yahoo Finance v8 chart endpoint)"
```

---

### Task 6: Add Fear & Greed widget (alternative.me)

**Files:**
- Modify: `terminal.js` — add `renderFG()` and register it.

- [ ] **Step 1: Add `renderFG()` to `terminal.js`**

Insert after `renderStocks()`:

```javascript
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
```

- [ ] **Step 2: Register it in `init()`**

```javascript
  renderFG();
  setInterval(renderFG, 5 * 60_000); // 5 minutes
```

- [ ] **Step 3: Verify in browser**

Reload. The FEAR & GREED panel should show a big number 0–100, a label (e.g. "GREED"), and a 10-block bar.

- [ ] **Step 4: Commit**

```bash
git add terminal.js
git commit -m "Add Fear & Greed widget (alternative.me)"
```

---

### Task 7: Add ETH gas widget (Etherscan)

**Files:**
- Modify: `terminal.js` — add `renderGas()` and register it.

Note: Etherscan's gas oracle works without an API key at low call rates. If a key is later added, set the `key` query param.

- [ ] **Step 1: Add `renderGas()` to `terminal.js`**

Insert after `renderFG()`:

```javascript
// --- Widget: ETH Gas (Etherscan gas oracle) ---
async function renderGas() {
  try {
    const data = await fetchJSON('https://api.etherscan.io/api?module=gastracker&action=gasoracle');
    if (!data || data.status !== '1' || !data.result) throw new Error('bad response');
    const { SafeGasPrice, ProposeGasPrice, FastGasPrice } = data.result;
    document.getElementById('gas-body').innerHTML = `
      <div class="t-row"><span class="sym">SLOW</span><span>${SafeGasPrice} gwei</span></div>
      <div class="t-row"><span class="sym">AVG</span><span>${ProposeGasPrice} gwei</span></div>
      <div class="t-row"><span class="sym">FAST</span><span>${FastGasPrice} gwei</span></div>
      <div style="margin-top:6px;color:#555;font-size:0.7rem;">mainnet · etherscan</div>
    `;
    setFoot('gas-foot', true);
  } catch (e) {
    setError('gas-body', 'gas-foot');
  }
}
```

- [ ] **Step 2: Register it in `init()`**

```javascript
  renderGas();
  setInterval(renderGas, 60_000); // 1 minute
```

- [ ] **Step 3: Verify in browser**

Reload. The ETH GAS panel should show SLOW / AVG / FAST gwei values.

- [ ] **Step 4: Commit**

```bash
git add terminal.js
git commit -m "Add ETH gas widget (Etherscan gas oracle)"
```

---

### Task 8: Add News feed widget (rss2json)

**Files:**
- Modify: `terminal.js` — add `renderNews()` and register it.

We use `api.rss2json.com` (free, no key, CORS-enabled, rate-limited to 10 req/hr per IP — plenty for a 5-min refresh).

- [ ] **Step 1: Add `renderNews()` to `terminal.js`**

Insert after `renderGas()`:

```javascript
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
    const html = items.slice(0, 12).map(it => `
      <a class="t-newsitem" href="${it.link}" target="_blank" rel="noopener">
        <span class="src">${it.src}</span>${it.title}<span class="when">${shortAgo(it.date)}</span>
      </a>
    `).join('');
    document.getElementById('news-body').innerHTML = html;
    setFoot('news-foot', true);
  } catch (e) {
    setError('news-body', 'news-foot');
  }
}
```

- [ ] **Step 2: Register it in `init()`**

```javascript
  renderNews();
  setInterval(renderNews, 5 * 60_000); // 5 minutes
```

- [ ] **Step 3: Verify in browser**

Reload. The NEWS panel should show ~12 most-recent headlines across CoinDesk, Decrypt, and Yahoo Finance, with source label and "Xm" or "Xh" timestamp. Clicking a headline opens the article in a new tab.

- [ ] **Step 4: Commit**

```bash
git add terminal.js
git commit -m "Add news widget (CoinDesk/Decrypt/YFinance via rss2json)"
```

---

### Task 9: Add Rug Pulls / Hacks widget (rekt.news via rss2json)

**Files:**
- Modify: `terminal.js` — add `renderRekt()` and register it.

- [ ] **Step 1: Add `renderRekt()` to `terminal.js`**

Insert after `renderNews()`:

```javascript
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
    const html = feed.items.slice(0, 8).map(it => `
      <a class="t-newsitem" href="${it.link}" target="_blank" rel="noopener">
        <span class="src">REKT</span>${it.title}<span class="when">${shortAgo(it.pubDate)}</span>
      </a>
    `).join('');
    document.getElementById('rekt-body').innerHTML = html;
    setFoot('rekt-foot', true);
  } catch (e) {
    setError('rekt-body', 'rekt-foot');
  }
}
```

- [ ] **Step 2: Register it in `init()`**

```javascript
  renderRekt();
  setInterval(renderRekt, 15 * 60_000); // 15 minutes
```

- [ ] **Step 3: Verify in browser**

Reload. The RUG PULLS & HACKS panel should list ~8 recent rekt.news posts.

- [ ] **Step 4: Commit**

```bash
git add terminal.js
git commit -m "Add rug pulls / hacks widget (rekt.news RSS)"
```

---

### Task 10: Final polish & responsive verification

**Files:**
- (Possibly) Modify: `index.html` / `terminal.js` based on what you find.

- [ ] **Step 1: Visual sanity check at three widths**

Open the page at viewport widths 1440px, 1000px, and 375px (Chrome DevTools device toolbar). Verify:
- 1440px: 4-column grid, NEWS and RUG PULLS panels each span 2 columns.
- 1000px: 2-column grid.
- 375px: single column.

- [ ] **Step 2: Check terminal does not affect existing content**

Scroll past the terminal. The marquee ticker, header, stats bar, scam alerts, fails, wisdom, newsletter (Buttondown form), merch teaser, and footer should all still look exactly as they did before this work. Specifically confirm the existing animations and Geocities styling are unchanged.

- [ ] **Step 3: Check load behavior**

In DevTools → Network, hard-reload. Confirm:
- `terminal.js` loads as a deferred script.
- 6 widget endpoints fire in parallel.
- No request blocks page rendering.
- No JS console errors.

- [ ] **Step 4: Verify `ads.txt` is reachable**

With the local server still running:

```bash
curl -s http://localhost:8000/ads.txt
```

Expected: `google.com, pub-5691945685029042, DIRECT, f08c47fec0942fa0`

- [ ] **Step 5: Verify Buttondown end-to-end**

Subscribe with a real test email you control. Confirm the double opt-in email arrives. Click the confirmation. Log into Buttondown and confirm the subscriber appears in your list.

- [ ] **Step 6: Final commit (only if any fixes were needed in this task)**

```bash
git add -A
git commit -m "Terminal dashboard: responsive + final polish pass"
```

If no fixes were needed, skip the commit — there's nothing to record.

---

## Self-Review

**Spec coverage:**
- Terminal section with 6 widgets → Tasks 3–9 ✓
- Visual sober styling, scoped CSS, no chaos pollution → Task 3 ✓
- Client-side fetch, no backend → Tasks 4–9 ✓
- Independent widget failure handling → `setError()` helper in Task 4, used in every widget ✓
- Refresh timers per the spec table → registered in `init()` in each widget task ✓
- Newsletter signup fixed → Task 2 ✓
- `ads.txt` added → Task 1 ✓
- All existing homepage content preserved below terminal → Task 3 inserts BEFORE existing content; Task 10 step 2 verifies ✓
- Acceptance criteria 1 (load < 3s) → verified in Task 10 step 3 ✓
- Acceptance criteria 2 (visually distinct) → Task 3 styling ✓
- Acceptance criteria 3 (existing content unchanged) → Task 10 step 2 ✓
- Acceptance criteria 4 (newsletter delivers) → Task 10 step 5 ✓
- Acceptance criteria 5 (ads.txt reachable) → Task 10 step 4 ✓
- Acceptance criteria 6 (no build step) → entire plan uses vanilla JS, no tooling ✓

**Placeholder scan:** One real placeholder is the Buttondown `<USERNAME>`, called out explicitly as a one-time pre-step in Task 2 with instructions on how to obtain it. Not a plan defect — it's a credential the user must supply.

**Type consistency:** Element IDs are consistent across tasks: each widget uses `<name>-body` and `<name>-foot`, matching the skeleton in Task 3. Function names follow `renderXxx()` pattern uniformly. `fetchJSON`, `setFoot`, `setError`, `fmtNum`, `fmtTime`, `pctClass`, `pctStr` are defined once in Task 4 and reused unchanged.
