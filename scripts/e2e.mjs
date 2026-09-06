/**
 * Headless click-through of the demo path, driven over the Chrome DevTools
 * Protocol. Verifies the interactions a live demo depends on: filters, sorting,
 * window switching, navigation, the research action and its persistence.
 *
 *   node scripts/e2e.mjs http://localhost:4178/crowding-risk-monitor
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Includes the project base path the build is served under (vite.config.ts).
const BASE = (process.argv[2] ?? 'http://localhost:4178/crowding-risk-monitor').replace(/\/$/, '')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333

const chrome = spawn(CHROME, [
  '--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), 'crm-e2e-'))}`,
  '--window-size=1440,940',
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch { /* chrome not up yet */ }
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint never became available')
}

let id = 0
const pending = new Map()
let ws

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })

/** Evaluate in the page and return the awaited value. */
async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'evaluate threw')
  return result.value
}

const goto = async (hash) => {
  await send('Page.navigate', { url: `${BASE}/#${hash}` })
  await sleep(650)
}

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const HELPERS = `
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const rows = () => $$('table.data tbody tr');
  const byText = (sel, text) => $$(sel).find((n) => n.textContent.trim().includes(text));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const setNativeValue = (el, value) => {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
`

async function main() {
  const wsUrl = await target()
  ws = new WebSocket(wsUrl)
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message))
      else resolve(msg.result)
    }
  })
  await new Promise((r) => ws.addEventListener('open', r, { once: true }))

  await send('Page.enable')
  await send('Runtime.enable')

  // collect any uncaught page error or console error for the whole run
  const consoleErrors = []
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data)
    if (msg.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(msg.params.exceptionDetails.exception?.description ?? 'exception')
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '))
    }
  })

  /* ---------------------------------------------------------- monitor -- */
  await goto('/')
  const initial = await evaluate(`${HELPERS} return {
    rows: rows().length,
    first: rows()[0]?.children[0].textContent.trim(),
    selected: $('.selected__code')?.textContent,
    heading: $('.pagehead h1')?.textContent,
  };`)
  check('monitor renders all 12 rows', initial.rows === 12, `${initial.rows} rows — ${initial.heading}`)
  check('rows rank by attention multiple', String(initial.first).startsWith('ORBX'), `top row: ${initial.first}`)
  check('top row is selected in the side panel', initial.selected === 'ORBX', `panel shows ${initial.selected}`)

  /* -------- the demo path: one template, switched by the ticker clicked -- */
  for (const [ticker, state, multiple, consensus, coverage, event] of [
    ['NVX', 'Elevated', '3.1×', '78% bullish', 'High', 'Earnings'],
    ['MIN', 'Watch', '1.8×', '61% bullish', 'High', 'Analyst upgrade'],
    ['QGG', 'Watch', '1.6×', '57% bearish', 'Medium', 'Media coverage'],
  ]) {
    const picked = await evaluate(`${HELPERS}
      const row = rows().find((r) => r.children[0].textContent.trim().startsWith('${ticker}'));
      row.click(); await wait(220);
      return {
        code: $('.selected__code')?.textContent ?? '',
        name: $('.selected__name')?.textContent ?? '',
        badge: $('.selected .badge')?.textContent ?? '',
        panel: $('.selected__body')?.textContent ?? '',
        rowState: row.children[1].textContent.trim(),
        rowMultiple: row.children[2].textContent.trim(),
        rowConsensus: row.children[3].textContent.trim(),
        rowCoverage: row.children[4].textContent.trim(),
        rowEvent: row.children[5].textContent.trim(),
        selectedRows: $$('tr.is-selected').length,
      };`)
    check(
      `clicking ${ticker} swaps the Selected Security panel`,
      picked.code === ticker && picked.selectedRows === 1,
      `${picked.code} — ${picked.name}`,
    )
    check(
      `${ticker} row reads ${state} · ${multiple} · ${consensus} · ${coverage} · ${event}`,
      picked.rowState.includes(state) &&
        picked.rowMultiple === multiple &&
        picked.rowConsensus.includes(consensus) &&
        picked.rowCoverage.includes(coverage) &&
        picked.rowEvent.includes(event),
      [picked.rowState, picked.rowMultiple, picked.rowConsensus, picked.rowCoverage, picked.rowEvent].join(' · '),
    )
    check(
      `${ticker} panel agrees with the row`,
      picked.badge.includes(state) && picked.panel.includes(consensus.split(' ')[0]) && picked.panel.includes(event),
      `panel badge: ${picked.badge.trim()}`,
    )
    check(
      `${ticker} keeps the classified item count`,
      /n=[\d,]+ classified/.test(picked.rowConsensus) && picked.panel.includes('Consensus · n='),
      picked.rowConsensus.replace(/\s+/g, ' '),
    )
  }

  // Both chrome elements are dismissible, and both have to come back: the
  // panel through the row click that filled it, the sidebar through its own
  // toggle. A collapse that strands you on a rail with no way out is worse
  // than no collapse at all.
  const panelToggle = await evaluate(`${HELPERS}
    $('.selected__close').click(); await wait(400);
    const closed = !$('.selected');
    rows()[3].click(); await wait(400);
    return { closed, reopened: $('.selected__code')?.textContent ?? '' };`)
  check(
    'the side panel closes and a row click brings it back',
    panelToggle.closed && panelToggle.reopened.length > 0,
    `closed → reopened on ${panelToggle.reopened}`,
  )

  const rail = await evaluate(`${HELPERS}
    const width = () => $('.sidebar').getBoundingClientRect().width;
    const open = width();
    $('.sidebar__toggle').click(); await wait(400);
    const collapsed = width();
    const nav = $$('.sidebar--collapsed .sidebar__short').map((n) => n.textContent.trim());
    $('.sidebar__toggle').click(); await wait(400);
    return { open, collapsed, nav, restored: width() };`)
  check(
    'the sidebar collapses to a navigable rail and expands back',
    rail.collapsed < rail.open && rail.nav.length >= 3 && rail.restored === rail.open,
    `${rail.open}px → ${rail.collapsed}px (${rail.nav.join('/')}) → ${rail.restored}px`,
  )

  const causation = await evaluate(`${HELPERS} return { text: document.body.innerText };`)
  check(
    'related events are only ever described as coinciding',
    /coincided/.test(causation.text) && !/(caused|because of|driven by) the (event|signal)/i.test(causation.text),
    'no causal claim on the monitor',
  )

  const filtered = await evaluate(`${HELPERS}
    byText('.filterbar button', 'Stable').click(); await wait(120);
    byText('.filterbar button', 'Watch').click(); await wait(120);
    byText('.filterbar button', 'Insufficient').click(); await wait(200);
    return { rows: rows().length };`)
  check('alert-state filter narrows to Elevated only', filtered.rows === 3, `${filtered.rows} rows`)

  const searched = await evaluate(`${HELPERS}
    setNativeValue($('.input--search'), 'kavira'); await wait(250);
    return { rows: rows().length, first: rows()[0]?.children[0].textContent.trim() };`)
  check('search matches on company name', searched.rows === 1 && searched.first.startsWith('KVRA'), `${searched.rows} row(s)`)

  const empty = await evaluate(`${HELPERS}
    setNativeValue($('.input--search'), 'zzzz'); await wait(250);
    return { hasTable: !!$('table.data'), empty: $('.state__title')?.textContent ?? null };`)
  check('empty state replaces the table when nothing matches', !empty.hasTable && !!empty.empty, empty.empty ?? '')

  const reset = await evaluate(`${HELPERS}
    byText('.btn', 'Reset filters').click(); await wait(250);
    return { rows: rows().length };`)
  check('reset restores the full universe', reset.rows === 12, `${reset.rows} rows`)

  const windowed = await evaluate(`${HELPERS}
    const before = rows().map((r) => r.children[0].textContent.trim());
    byText('.segmented button', '90d').click(); await wait(350);
    const after = rows().map((r) => r.children[0].textContent.trim());
    const mult = rows().slice(0, 3).map((r) => r.children[2].textContent.trim());
    byText('.segmented button', '30d').click(); await wait(250);
    return { changed: JSON.stringify(before) !== JSON.stringify(after), mult };`)
  check('look-back window recomputes the ranking', windowed.changed, `90d top multiples: ${windowed.mult.join(', ')}`)

  const sorted = await evaluate(`${HELPERS}
    byText('th', 'Ticker').click(); await wait(250);
    return { first: rows()[0]?.children[0].textContent.trim() };`)
  check('column sorting works', sorted.first.startsWith('ZNTH'), `top row: ${sorted.first}`)

  const board = await evaluate(`${HELPERS} return {
    cells: $$('.board__cell').length,
    summary: $('.board__value')?.textContent,
  };`)
  check('board summary strip renders', board.cells === 3, `${board.cells} cells — ${board.summary}`)

  /* ----------------------------------------------------------- detail -- */
  await goto('/signal/NVX')
  const detail = await evaluate(`${HELPERS} return {
    title: $('.pagehead h1')?.textContent,
    summary: $$('.summary__cell').length,
    bars: $$('.trend svg rect').length,
    drivers: $$('.bullets li').length,
    sources: $$('.barrow').length,
    evidence: $$('table.data tbody tr').length,
    checks: $$('.checklist li').length,
    components: $$('.brow').length,
    total: $('.btotal__pts')?.textContent,
  };`)
  check('detail header renders the signal', /NVX — /.test(detail.title ?? ''), detail.title ?? '')
  check('summary band shows four measures', detail.summary === 4, `${detail.summary} cells`)
  check('attention trend draws bars', detail.bars >= 20, `${detail.bars} bars`)
  check('why-this-changed and source mix populate', detail.drivers >= 3 && detail.sources >= 3, `${detail.drivers} drivers, ${detail.sources} sources`)
  check('evidence items and next checks render', detail.evidence >= 1 && detail.checks === 3, `${detail.evidence} evidence rows`)
  check('score breakdown shows every term', detail.components >= 4, `${detail.components} rows, total ${detail.total}`)

  const thin = await evaluate(`${HELPERS}
    byText('.segmented button', '7d').click(); await wait(350);
    const warn = $('.notice')?.textContent ?? '';
    byText('.segmented button', '30d').click(); await wait(250);
    return { warn };`)
  check('short window raises the unstable-baseline warning', thin.warn.includes('baseline'), thin.warn.slice(0, 62).trim() + '…')

  const tab = await evaluate(`${HELPERS}
    byText('.tabs button', 'Historical evidence').click(); await wait(400);
    return { url: location.hash, cases: $$('.case').length, cohort: $$('table.data tbody tr').length, notice: !!$('.notice') };`)
  check('historical evidence tab is deep-linkable', tab.url.includes('tab=history'), tab.url)
  check('evidence shows cases and cohort rows', tab.cases === 4 && tab.cohort >= 6, `${tab.cases} cases, ${tab.cohort} table rows`)

  /* -------------------------------------------------- research action -- */
  const saved = await evaluate(`${HELPERS}
    byText('.tabs button', 'Signal detail').click(); await wait(350);
    setNativeValue($('textarea'), 'check short interest and holdings overlap'); await wait(150);
    byText('.btn--primary', 'Investigate further').click(); await wait(300);
    return { stored: localStorage.getItem('crm.investigations.v1') };`)
  check('investigate-further saves a research note', !!saved.stored && saved.stored.includes('short interest'), 'note persisted')

  await goto('/')
  const flagged = await evaluate(`${HELPERS}
    byText('.filterbar button', 'Flagged only').click(); await wait(300);
    return { rows: rows().length, first: rows()[0]?.children[0].textContent.trim() };`)
  check('note persists back on the monitor', flagged.rows === 1 && flagged.first.startsWith('NVX'), `filter → ${flagged.first}`)

  /* ---------------------------------------------------- alert history -- */
  await goto('/alerts')
  const alerts = await evaluate(`${HELPERS} return {
    summary: $$('.summary__cell').length,
    log: $$('table.data tbody tr').length,
    bars: $$('.barrow').length,
    legend: $$('.legend button').length,
    firstChange: rows()[0]?.children[2]?.textContent?.trim() ?? $$('table.data tbody tr')[0]?.children[2]?.textContent?.trim(),
  };`)
  check('alert history summarises the change log', alerts.summary === 4, `${alerts.summary} summary cells`)
  check('change log derives state transitions', alerts.log >= 5, `${alerts.log} changes — first: ${alerts.firstChange}`)
  check('history filters and change summary render', alerts.legend === 4 && alerts.bars === 3, `${alerts.legend} filters, ${alerts.bars} bars`)

  const historyFiltered = await evaluate(`${HELPERS}
    const before = $$('table.data tbody tr').length;
    byText('.legend button', 'Returned to stable').click(); await wait(300);
    const after = $$('table.data tbody tr').length;
    byText('.legend button', 'Returned to stable').click(); await wait(200);
    return { before, after };`)
  check('history state filter narrows the log', historyFiltered.after < historyFiltered.before, `${historyFiltered.before} → ${historyFiltered.after}`)

  /* -------------------------------------------------------- watchlist -- */
  await goto('/watchlist')
  const watchlist = await evaluate(`${HELPERS} return {
    summary: $$('.summary__cell').length,
    rows: $$('table.data tbody tr').length,
    settings: $$('.kv').length,
    tracked: byText('.kv', 'Tracked')?.textContent ?? '',
  };`)
  check('watchlist lists the monitoring universe', watchlist.rows === 12, `${watchlist.rows} tickers`)
  check('watchlist shows board settings', watchlist.summary === 4 && watchlist.settings === 5, `${watchlist.settings} settings rows`)
  check('watchlist reflects the tracked ticker', watchlist.tracked.includes('1 ticker'), watchlist.tracked.replace(/\s+/g, ' ').trim())

  const tracking = await evaluate(`${HELPERS}
    const before = $$('table.data tbody tr').length;
    setNativeValue($('#ticker-code'), 'BRVO'); await wait(150);
    byText('.btn--primary', 'Add to watchlist').click(); await wait(300);
    return { before, note: $$('.panel__note').map((n) => n.textContent).find((t) => t.includes('BRVO')) ?? '' };`)
  check('tracking a ticker from the watchlist works', tracking.note.includes('BRVO'), tracking.note.trim())

  /* ------------------------------------------------------------ misc -- */
  await goto('/method')
  const method = await evaluate(`${HELPERS} return {
    callout: $('.callout__statement')?.textContent?.slice(0, 40) ?? '',
    caveat: $('.callout__caveat')?.textContent ?? '',
    stages: $$('.stage').length,
    surface: !!$('.stage--surface'),
    coverage: $$('table.data tbody tr').length,
    bullets: $$('.bullets li').length,
    footActive: !!$('.sidebar__foot.is-active'),
    formula: !!$('.formula'),
    defs: $$('.deflist dt').length,
  };`)
  check('methodology leads with the exploratory-proxy statement', method.callout.startsWith('AttnShift highlights') && method.caveat.includes('does not provide a trading'), method.callout + '…')
  check('signal pipeline renders four stages', method.stages === 4 && method.surface, `${method.stages} stages, surface highlighted`)
  check('coverage labels and measure lists render', method.coverage === 3 && method.bullets === 8, `${method.coverage} coverage rows, ${method.bullets} bullets`)
  check('sidebar marks the methodology route', method.footActive, 'footer entry highlighted')
  check('method page publishes the full calculation', method.formula && method.defs >= 5, `${method.defs} definitions`)

  /* ------------------------------------------- navigation round trip -- */
  await goto('/signal/MIN')
  const roundTrip = await evaluate(`${HELPERS}
    const seen = [];
    byText('.tabs button', 'Historical evidence').click(); await wait(350);
    seen.push(location.hash);
    byText('.pagehead__actions button', 'Method').click(); await wait(500);
    seen.push(location.hash + ' | ' + ($('.pagehead h1')?.textContent ?? ''));
    byText('.btn-back', 'Back').click(); await wait(500);
    seen.push(location.hash);
    $('.btn-back').click(); await wait(500);
    seen.push(location.hash);
    return { seen };`)
  check(
    'signal detail → historical evidence → method → back → monitor',
    roundTrip.seen[0].includes('tab=history') &&
      roundTrip.seen[1].includes('/method') &&
      roundTrip.seen[1].includes('Method & Limitations') &&
      roundTrip.seen[2].includes('/signal/MIN') &&
      /#\/?$/.test(roundTrip.seen[3]),
    roundTrip.seen.join('  →  '),
  )

  // A signal has no route of its own back to a list — the row that opened it
  // stamps the origin. Regression guard: the back control and the sidebar both
  // have to name the list you came from, not the monitor.
  for (const [route, label] of [['/alerts', 'Alert History'], ['/watchlist', 'Watchlist']]) {
    await goto(route)
    const opened = await evaluate(`${HELPERS}
      rows()[1].click(); await wait(600);
      const back = $('.btn-back')?.textContent ?? '';
      const lit = $$('.sidebar__nav a.is-active .sidebar__full').map((a) => a.textContent.trim());
      $('.btn-back').click(); await wait(600);
      return { back, lit, landed: location.hash };`)
    check(
      `signal opened from ${label} goes back to ${label}`,
      opened.back.includes(label) && opened.lit.includes(label) && opened.landed.includes(route),
      `${opened.back.trim()}  →  ${opened.landed}`,
    )
  }

  const deepLinked = await evaluate(`${HELPERS}
    location.hash = '#/method'; await wait(600);
    return { eyebrow: $('.btn-back')?.textContent ?? '', back: !!byText('.pagehead__actions button', 'Back to monitor') };`)
  check(
    'method reached directly still offers a way back',
    deepLinked.eyebrow.includes('Back to monitor') && deepLinked.back,
    `eyebrow: ${deepLinked.eyebrow.trim()}`,
  )

  await goto('/signal/NOPE')
  const missing = await evaluate(`${HELPERS} return { title: $('.state__title')?.textContent ?? '' };`)
  check('unknown ticker degrades to an empty state', missing.title.includes('No instrument'), missing.title)

  await goto('/')
  const stamp = await evaluate(`${HELPERS}
    return {
      updated: ($('.pagehead__sub')?.textContent ?? '').replace('Updated ', '').trim(),
      ingest: byText('.board__cell', 'Latest ingest')?.querySelector('.board__value')?.textContent?.trim() ?? '',
    };`)
  check(
    'last updated is one value read from the snapshot, not a pinned design date',
    stamp.updated.length > 0 && stamp.updated === stamp.ingest && !Number.isNaN(Date.parse(stamp.updated)),
    stamp.updated,
  )

  check('no uncaught page errors during the run', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '))

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
  ws.close()
  chrome.kill()
  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('e2e run failed:', err.message)
  chrome.kill()
  process.exit(1)
})
