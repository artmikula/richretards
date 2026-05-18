# Rich Retards Terminal Dashboard — Design Spec

**Date:** 2026-05-18
**Status:** Approved for planning

## Goal

Replace the current homepage with a **Bloomberg-style live finance terminal** that gives visitors a reason to come back daily, without losing any of the existing content or the chaotic "Rich Retards" brand identity. Also fix two unrelated issues: the non-functional newsletter signup and a missing `ads.txt` for AdSense.

The terminal is the new daily-destination hook; the existing site below it is the SEO + community + monetization surface.

## Non-Goals (v1)

- No backend service, no database, no build pipeline.
- No user accounts, no watchlists, no price alerts.
- No "Pro Terminal" paywall yet (planned for a later phase).
- No command bar / ticker lookup (planned for a later phase).

## High-Level Architecture

Everything stays static. Live data is fetched client-side from free public APIs on page load and refreshed on a timer. The site continues to deploy as plain HTML.

```
┌───────────────────────────────────────────────────────────┐
│  RICH RETARDS header (loud, unchanged)                    │
│  Top marquee ticker (unchanged)                           │
├───────────────────────────────────────────────────────────┤
│  ▓▓▓  THE TERMINAL  ▓▓▓   (new, sober styling)            │
│  6-widget grid, monospace, black/amber/green/red          │
├───────────────────────────────────────────────────────────┤
│  Everything else from the current homepage, unchanged:    │
│   - stats bar                                             │
│   - latest articles grid                                  │
│   - scam alerts / fails / wisdom sections                 │
│   - newsletter signup  ← now functional                   │
│   - merch teaser                                          │
│   - AdSense slots                                         │
│   - footer                                                │
└───────────────────────────────────────────────────────────┘
```

## The Terminal Section

### Visual treatment

- Quarantined visually from the chaos: solid black background, 1px sober border, no animations, no gradients.
- Monospace only (`IBM Plex Mono` or `JetBrains Mono` via Google Fonts; fall back to existing `VT323` if we want zero new font loads).
- Palette: `#0a0a0a` background, `#e0e0e0` text, `#ffb000` accents (amber), `#00d084` positive, `#ff3b3b` negative, `#666` muted.
- Each widget is a panel with a header bar (`▓ HEADER`), a body, and a small "last updated" timestamp in muted text.
- Layout: CSS grid, `grid-template-columns: repeat(4, 1fr)` on desktop, stacks to 2 cols on tablet, 1 col on mobile.

### Widgets (6 total for v1)

| # | Widget | Data source | Refresh |
|---|--------|------------|---------|
| 1 | Crypto prices (BTC, ETH, SOL, XRP, DOGE, top movers) | CoinGecko `/simple/price` + `/coins/markets` | 30s |
| 2 | Stocks & indices (SPY, QQQ, NVDA, TSLA, GME, AMC) | Yahoo Finance `query1.finance.yahoo.com/v7/finance/quote` | 30s |
| 3 | Fear & Greed gauges (crypto + traditional) | alternative.me `/fng/?limit=1` + CNN proxy | 5 min |
| 4 | ETH gas tracker | etherscan.io `/api?module=gastracker&action=gasoracle` (no key needed for low-rate calls) | 60s |
| 5 | News feed (rolling, ~15 headlines) | RSS via `api.rss2json.com` — CoinDesk, Decrypt, Yahoo Finance | 5 min |
| 6 | Rug pulls / hacks | rekt.news RSS via `api.rss2json.com` | 15 min |

All endpoints are public, key-free, and CORS-friendly (rss2json proxies the ones that aren't).

### Failure handling

Each widget renders independently. If a fetch fails, the widget shows `-- DATA UNAVAILABLE --` in muted text with the last successful timestamp. No global error states. No retry loops.

### File layout

- `index.html` — modified: insert the terminal `<section>` between the header and the existing stats bar. Add a `<style>` block scoped to `.terminal *` selectors so it can't pollute the existing chaos styles.
- `terminal.js` — new file, ~150 lines, vanilla JS, loaded with `defer`. One `init()` function, six `renderXxx()` functions, one shared `fetchJSON()` helper with timeout.

## Newsletter Signup — Real Implementation

Current state: `fakeSubscribe()` in `index.html` just shows a success message and discards the email. This needs to actually capture emails.

**Recommended provider: Buttondown** (free tier: 100 subscribers, simple `POST` API, no key needed for embeddable form). Alternative: Beehiiv form embed (better if planning paid newsletter tiers later).

**Implementation:**
- Replace the `onclick="fakeSubscribe()"` button with a real `<form>` that POSTs to the provider's hosted endpoint.
- Buttondown form action: `https://buttondown.email/api/emails/embed-subscribe/<username>` — no JS needed for the basic case.
- Keep the existing styling and the green/red feedback messages.
- Confirmation handled by Buttondown's double-opt-in email; our page just shows "Check your email."

**Decision needed during implementation:** which provider account does the user already have / want to create? (Buttondown vs Beehiiv vs ConvertKit.) Default to Buttondown unless told otherwise.

## ads.txt

Add a single file at the site root:

**Path:** `/ads.txt`
**Contents:**
```
google.com, pub-5691945685029042, DIRECT, f08c47fec0942fa0
```

That's it. AdSense will pick it up on its next crawl.

## Out-of-Scope / Future Phases

These are deliberately deferred so v1 ships in an afternoon:

- **Phase 2:** Command bar (type a ticker → scroll to widget; type a scam name → search articles).
- **Phase 2:** Additional widgets — WSB top tickers, liquidations, treasury yields, DXY, sponsored "ticker of the day."
- **Phase 3:** "RR Pro Terminal" — Stripe-gated ad-free version with watchlists (localStorage) and email alerts. $5–9/mo.
- **Phase 3:** Affiliate widgets in panel corners (exchange referrals, brokerage referrals).

## Acceptance Criteria

1. Loading the homepage shows the terminal with all 6 widgets populated within 3 seconds on a normal connection.
2. The terminal is visually distinct from the rest of the page (sober vs chaotic) but rendered in the same HTML document.
3. All existing homepage content (articles, scams, fails, wisdom, merch, footer) is still present and unchanged below the terminal.
4. Submitting an email to the newsletter form actually reaches the chosen provider's subscriber list (verified by sending a test address).
5. `https://richretards.com/ads.txt` returns the required line.
6. No new build step, no new server, no new framework.
