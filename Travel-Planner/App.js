/* ==========================================================================
   Wayfare – application logic
   Sections: constants → utilities → state → derived data → templates →
             dialogs → actions → events → init
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */
  const STORE_KEY = 'wayfare.v1';
  const MAX_TRIP_DAYS = 120;
  const CATEGORIES = ['Transport', 'Stay', 'Food', 'Activities', 'Shopping', 'Other'];
  const STATUSES = ['Dreaming', 'Planned', 'Booked'];
  const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'AUD', 'CAD', 'AED', 'SGD', 'THB'];
  const VIEWS = [
    { id: 'overview', label: 'Overview' },
    { id: 'itinerary', label: 'Itinerary' },
    { id: 'destinations', label: 'Destinations' },
    { id: 'budget', label: 'Budget' },
  ];

  const ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    print: '<path d="M6 9V3h12v6"/><path d="M6 18H4v-7h16v7h-2"/><path d="M6 14h12v7H6z"/>',
    close: '<path d="M18 6 6 18M6 6l12 12"/>',
  };

  /* ------------------------------------------------------------------ *
   * Utilities
   * ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const icon = (name) =>
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

  // Dates are stored as "YYYY-MM-DD" strings and parsed in local time to avoid timezone drift.
  const parseDate = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayISO = () => toISO(new Date());
  const addDays = (s, n) => {
    const d = parseDate(s);
    d.setDate(d.getDate() + n);
    return toISO(d);
  };
  const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
  const fmtDate = (s, opts) => parseDate(s).toLocaleDateString(undefined, opts);
  const fmtShort = (s) => fmtDate(s, { day: 'numeric', month: 'short' });
  const fmtDay = (s) => fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short' });
  const fmtRange = (a, b) => {
    const sameYear = parseDate(a).getFullYear() === parseDate(b).getFullYear();
    const left = sameYear ? fmtShort(a) : fmtDate(a, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${left} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };
  const fmtTime = (t) => {
    if (!t) return 'Anytime';
    const [h, m] = t.split(':').map(Number);
    return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  const money = (amount, currency) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
      }).format(amount || 0);
    } catch {
      return `${currency} ${(amount || 0).toFixed(2)}`;
    }
  };

  const sum = (list, pick) => list.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  /* ------------------------------------------------------------------ *
   * State & persistence
   * ------------------------------------------------------------------ */
  let state = load();
  const ui = { view: 'overview', destFilter: 'All' };

  function seed() {
    const start = addDays(todayISO(), 21);
    const kyoto = { id: uid(), name: 'Kyoto', country: 'Japan', status: 'Booked', arrive: start, depart: addDays(start, 3), notes: 'Stay near Gion so evening walks are easy.' };
    const osaka = { id: uid(), name: 'Osaka', country: 'Japan', status: 'Planned', arrive: addDays(start, 3), depart: addDays(start, 6), notes: 'Street food in Dotonbori, day trip to Nara.' };
    const nara = { id: uid(), name: 'Nara', country: 'Japan', status: 'Dreaming', arrive: '', depart: '', notes: 'Deer park and Todai-ji if there is time.' };
    const act = (day, time, title, category, destId, cost, notes = '') =>
      ({ id: uid(), date: addDays(start, day), time, title, category, destId, cost, notes, done: false });
    const trip = {
      id: uid(),
      name: 'Autumn in Kyoto and Osaka',
      start,
      end: addDays(start, 6),
      currency: 'USD',
      budget: 2800,
      destinations: [kyoto, osaka, nara],
      activities: [
        act(0, '14:30', 'Check in at ryokan', 'Stay', kyoto.id, 0, 'Confirmation is in the booking email.'),
        act(0, '18:30', 'Dinner in Pontocho alley', 'Food', kyoto.id, 45),
        act(1, '07:30', 'Fushimi Inari at sunrise', 'Activities', kyoto.id, 0, 'Go early to beat the crowds.'),
        act(1, '13:00', 'Tea ceremony in Higashiyama', 'Activities', kyoto.id, 38),
        act(2, '09:00', 'Arashiyama bamboo grove', 'Activities', kyoto.id, 0),
        act(3, '10:00', 'Train to Osaka', 'Transport', osaka.id, 14),
        act(3, '19:00', 'Okonomiyaki dinner', 'Food', osaka.id, 22),
        act(4, '09:30', 'Day trip to Nara', 'Activities', nara.id, 30),
      ],
      expenses: [
        { id: uid(), title: 'Return flights', category: 'Transport', amount: 1120, date: addDays(todayISO(), -12), paid: true },
        { id: uid(), title: 'Ryokan, 3 nights', category: 'Stay', amount: 540, date: start, paid: true },
        { id: uid(), title: 'Osaka hotel, 3 nights', category: 'Stay', amount: 360, date: addDays(start, 3), paid: false },
        { id: uid(), title: '7-day rail pass', category: 'Transport', amount: 210, date: start, paid: false },
      ],
    };
    return { trips: [trip], activeId: trip.id };
  }

  function normalizeTrip(t) {
    return {
      id: uid(),
      name: String(t.name || 'Untitled trip'),
      start: /^\d{4}-\d{2}-\d{2}$/.test(t.start) ? t.start : todayISO(),
      end: /^\d{4}-\d{2}-\d{2}$/.test(t.end) ? t.end : todayISO(),
      currency: CURRENCIES.includes(t.currency) ? t.currency : 'USD',
      budget: Math.max(0, Number(t.budget) || 0),
      destinations: Array.isArray(t.destinations) ? t.destinations.map((d) => ({ notes: '', country: '', arrive: '', depart: '', status: 'Dreaming', ...d })) : [],
      activities: Array.isArray(t.activities) ? t.activities.map((a) => ({ time: '', notes: '', destId: '', cost: 0, category: 'Activities', done: false, ...a, cost: Number(a.cost) || 0 })) : [],
      expenses: Array.isArray(t.expenses) ? t.expenses.map((e) => ({ date: '', paid: false, category: 'Other', ...e, amount: Number(e.amount) || 0 })) : [],
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.trips)) return parsed;
      }
    } catch { /* fall through to seed data */ }
    return seed();
  }

  let saveWarned = false;
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      if (!saveWarned) {
        saveWarned = true;
        toast('Changes could not be saved in this browser. Export your data to keep a copy.');
      }
    }
  }

  const activeTrip = () => state.trips.find((t) => t.id === state.activeId) || null;

  /** Apply a change, persist it, re-render, and offer an undo. */
  function mutate(message, fn, { undo = false } = {}) {
    const snapshot = JSON.stringify(state);
    fn();
    save();
    render();
    if (message) {
      toast(message, undo ? { label: 'Undo', onClick: () => { state = JSON.parse(snapshot); save(); render(); } } : undefined);
    }
  }

  /* ------------------------------------------------------------------ *
   * Derived data
   * ------------------------------------------------------------------ */
  const tripDays = (t) => {
    const days = [];
    const count = Math.min(diffDays(t.start, t.end) + 1, MAX_TRIP_DAYS);
    for (let i = 0; i < count; i++) days.push(addDays(t.start, i));
    return days;
  };

  const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99');
  const byDateTime = (a, b) => a.date.localeCompare(b.date) || byTime(a, b);

  function countdown(t) {
    const today = todayISO();
    if (today < t.start) {
      const n = diffDays(today, t.start);
      return n === 1 ? 'Starts tomorrow' : `Starts in ${n} days`;
    }
    if (today <= t.end) return `Day ${diffDays(t.start, today) + 1} of ${diffDays(t.start, t.end) + 1}`;
    return 'Trip ended';
  }

  function budgetItems(t) {
    const expenses = t.expenses.map((e) => ({ id: e.id, title: e.title, category: e.category, amount: e.amount, date: e.date, paid: e.paid, source: 'expense' }));
    const activities = t.activities
      .filter((a) => a.cost > 0)
      .map((a) => ({ id: a.id, title: a.title, category: a.category, amount: a.cost, date: a.date, paid: false, source: 'activity' }));
    return [...expenses, ...activities].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  }

  function budgetStats(t) {
    const items = budgetItems(t);
    const total = sum(items, (i) => i.amount);
    const paid = sum(items.filter((i) => i.paid), (i) => i.amount);
    const byCategory = CATEGORIES.map((name) => ({ name, total: sum(items.filter((i) => i.category === name), (i) => i.amount) }));
    const days = Math.max(1, diffDays(t.start, t.end) + 1);
    return {
      items, total, paid,
      remaining: t.budget - total,
      pct: t.budget > 0 ? (total / t.budget) * 100 : 0,
      byCategory,
      perDay: total / days,
    };
  }

  const destName = (t, id) => (t.destinations.find((d) => d.id === id) || {}).name || '';

  /* ------------------------------------------------------------------ *
   * Templates
   * ------------------------------------------------------------------ */
  const els = {
    tripList: $('#tripList'),
    view: $('#view'),
    dialog: $('#dialog'),
    toasts: $('#toasts'),
    importFile: $('#importFile'),
  };

  function render() {
    renderSidebar();
    renderMain();
  }

  function renderSidebar() {
    els.tripList.innerHTML = state.trips.length
      ? state.trips.map((t) => `
          <button type="button" class="trip-item ${t.id === state.activeId ? 'is-active' : ''}" data-action="switch-trip" data-id="${t.id}"
            ${t.id === state.activeId ? 'aria-current="true"' : ''}>
            <span class="trip-name">${esc(t.name)}</span>
            <span class="trip-dates">${fmtRange(t.start, t.end)}</span>
          </button>`).join('')
      : '<p class="side-empty">No trips yet.</p>';
  }

  function renderMain() {
    const t = activeTrip();
    if (!t) {
      els.view.innerHTML = `
        <div class="empty empty-page">
          <h1>Plan your first trip</h1>
          <p>Create a trip with dates and a budget. Then add destinations, build a day-by-day itinerary, and keep spending in check.</p>
          <button type="button" class="btn btn-primary" data-action="new-trip">${icon('plus')} Create a trip</button>
        </div>`;
      return;
    }

    const stats = budgetStats(t);
    const length = diffDays(t.start, t.end) + 1;
    const counts = { itinerary: t.activities.length, destinations: t.destinations.length };

    const body = { overview: viewOverview, itinerary: viewItinerary, destinations: viewDestinations, budget: viewBudget }[ui.view](t, stats);

    els.view.innerHTML = `
      <header class="trip-head">
        <div>
          <h1>${esc(t.name)}</h1>
          <p class="trip-meta">
            <span><strong>${fmtRange(t.start, t.end)}</strong></span>
            <span>${plural(length, 'day')}</span>
            <span class="countdown">${countdown(t)}</span>
          </p>
        </div>
        <div class="head-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-action="edit-trip">${icon('edit')} Edit trip</button>
          <button type="button" class="btn btn-ghost btn-sm" data-action="print">${icon('print')} Print</button>
          <button type="button" class="btn btn-danger btn-sm" data-action="delete-trip">${icon('trash')} Delete</button>
        </div>
      </header>

      <nav class="tabs" aria-label="Trip sections">
        ${VIEWS.map((v) => `
          <button type="button" class="tab" data-action="tab" data-view="${v.id}" ${ui.view === v.id ? 'aria-current="page"' : ''}>
            ${v.label}${counts[v.id] ? `<span class="count">${counts[v.id]}</span>` : ''}
          </button>`).join('')}
      </nav>

      <section aria-label="${VIEWS.find((v) => v.id === ui.view).label}">${body}</section>`;
  }

  /* ---- Overview ---- */
  function meter(stats, budget) {
    const cls = budget <= 0 ? '' : stats.pct > 100 ? 'is-over' : stats.pct > 85 ? 'is-warn' : '';
    return `<div class="meter ${cls}" role="img" aria-label="${Math.round(stats.pct)} percent of budget committed"><span style="width:${Math.min(stats.pct, 100)}%"></span></div>`;
  }

  function viewOverview(t, stats) {
    const doneCount = t.activities.filter((a) => a.done).length;
    const today = todayISO();
    const upcoming = t.activities.filter((a) => !a.done && a.date >= today).sort(byDateTime).slice(0, 5);
    const nextList = upcoming.length ? upcoming : t.activities.filter((a) => !a.done).sort(byDateTime).slice(0, 5);

    return `
      <div class="facts">
        <div class="fact"><div class="fact-value">${diffDays(t.start, t.end) + 1}</div><div class="fact-label">Days</div></div>
        <div class="fact"><div class="fact-value">${t.destinations.length}</div><div class="fact-label">Destinations</div></div>
        <div class="fact"><div class="fact-value">${doneCount}/${t.activities.length}</div><div class="fact-label">Activities done</div></div>
        <div class="fact"><div class="fact-value">${t.budget > 0 ? Math.round(stats.pct) + '%' : '–'}</div><div class="fact-label">Budget committed</div></div>
      </div>

      <div class="grid-2">
        <div class="stack">
          <section class="panel">
            <h3>Coming up</h3>
            ${nextList.length ? `<ul class="upcoming">${nextList.map((a) => `
              <li>
                <span class="when"><b>${fmtShort(a.date)}</b>${fmtTime(a.time)}</span>
                <span class="what">${esc(a.title)}${destName(t, a.destId) ? `<span class="where">${esc(destName(t, a.destId))}</span>` : ''}</span>
                <span class="chip" data-cat="${a.category}">${a.category}</span>
              </li>`).join('')}</ul>`
              : `<p class="where" style="color:var(--muted)">Nothing left on the schedule. Add activities in the itinerary.</p>
                 <p style="margin-top:12px"><button type="button" class="btn btn-ghost btn-sm" data-action="tab" data-view="itinerary">Open itinerary</button></p>`}
          </section>

          <section class="panel">
            <h3>Budget</h3>
            ${t.budget > 0 ? `
              ${meter(stats, t.budget)}
              <div class="meter-caption num">
                <span><strong>${money(stats.total, t.currency)}</strong> committed of ${money(t.budget, t.currency)}</span>
                <span>${stats.remaining >= 0 ? `${money(stats.remaining, t.currency)} left` : `${money(-stats.remaining, t.currency)} over`}</span>
              </div>`
              : `<p style="color:var(--muted)">Set a total budget to see how much is left as you plan.</p>
                 <p style="margin-top:12px"><button type="button" class="btn btn-ghost btn-sm" data-action="edit-trip">Set budget</button></p>`}
          </section>
        </div>

        <section class="panel">
          <h3>Route</h3>
          ${t.destinations.length ? `<ol class="route">${t.destinations.map((d) => `
            <li data-status="${d.status}">
              <strong>${esc(d.name)}</strong>
              <span>${[d.country, d.arrive ? fmtRange(d.arrive, d.depart || d.arrive) : d.status].filter(Boolean).map(esc).join(', ')}</span>
            </li>`).join('')}</ol>`
            : `<p style="color:var(--muted)">Add destinations to map out the order of your stops.</p>
               <p style="margin-top:12px"><button type="button" class="btn btn-ghost btn-sm" data-action="add-dest">Add a destination</button></p>`}
        </section>
      </div>`;
  }

  /* ---- Itinerary ---- */
  function stopHtml(t, a) {
    const dest = destName(t, a.destId);
    return `
      <li class="stop ${a.done ? 'is-done' : ''}" draggable="true" data-id="${a.id}" data-cat="${a.category}">
        <label class="check">
          <input type="checkbox" data-change="toggle-act" data-id="${a.id}" ${a.done ? 'checked' : ''}>
          <span class="sr-only">Mark “${esc(a.title)}” as done</span>
        </label>
        <div>
          <div class="stop-time">${fmtTime(a.time)}</div>
          <div class="stop-title">${esc(a.title)}</div>
          <div class="stop-meta">
            <span class="chip" data-cat="${a.category}">${a.category}</span>
            ${dest ? `<span>${esc(dest)}</span>` : ''}
          </div>
          ${a.notes ? `<p class="stop-notes">${esc(a.notes)}</p>` : ''}
        </div>
        <div class="stop-side">
          ${a.cost > 0 ? `<span class="stop-cost">${money(a.cost, t.currency)}</span>` : ''}
          <button type="button" class="icon-btn" data-action="edit-act" data-id="${a.id}" aria-label="Edit ${esc(a.title)}">${icon('edit')}</button>
        </div>
      </li>`;
  }

  function viewItinerary(t) {
    const days = tripDays(t);
    const inRange = new Set(days);
    const outside = t.activities.filter((a) => !inRange.has(a.date)).sort(byDateTime);

    const dayBlocks = days.map((date, i) => {
      const acts = t.activities.filter((a) => a.date === date).sort(byTime);
      const cost = sum(acts, (a) => a.cost);
      return `
        <article class="day">
          <div class="day-rail">
            <div class="day-num">Day ${i + 1}</div>
            <div class="day-date">${fmtDay(date)}</div>
            ${cost > 0 ? `<div class="day-cost">${money(cost, t.currency)} planned</div>` : ''}
          </div>
          <div class="day-body">
            <ul class="stops" data-dropzone="${date}">
              ${acts.length ? acts.map((a) => stopHtml(t, a)).join('') : '<li class="day-empty">Nothing planned yet. Add an activity or drag one here.</li>'}
            </ul>
            <div class="add-row"><button type="button" class="btn btn-ghost btn-sm" data-action="add-act" data-date="${date}">${icon('plus')} Add activity</button></div>
          </div>
        </article>`;
    }).join('');

    const outsideBlock = outside.length ? `
      <article class="day">
        <div class="day-rail"><div class="day-num" style="font-size:1.5rem">Outside dates</div></div>
        <div class="day-body">
          <p class="notice">These activities fall outside your trip dates. Open one to move it to a day in the trip.</p>
          <ul class="stops">${outside.map((a) => stopHtml(t, a).replace('<div class="stop-time">', `<div class="stop-time">${fmtShort(a.date)}, `)).join('')}</ul>
        </div>
      </article>` : '';

    return `
      <div class="section-head">
        <div>
          <h2>Itinerary</h2>
          <p>Drag activities between days to reschedule them.</p>
        </div>
        <button type="button" class="btn btn-primary" data-action="add-act" data-date="${days[0] || t.start}">${icon('plus')} Add activity</button>
      </div>
      <div class="days">${dayBlocks}${outsideBlock}</div>`;
  }

  /* ---- Destinations ---- */
  function viewDestinations(t) {
    const all = t.destinations;
    const list = ui.destFilter === 'All' ? all : all.filter((d) => d.status === ui.destFilter);
    const countFor = (s) => (s === 'All' ? all.length : all.filter((d) => d.status === s).length);

    const filters = all.length ? `
      <div class="filters" role="group" aria-label="Filter by status">
        ${['All', ...STATUSES].map((s) => `<button type="button" class="filter" data-action="filter" data-status="${s}" aria-pressed="${ui.destFilter === s}">${s} (${countFor(s)})</button>`).join('')}
      </div>` : '';

    const cards = list.map((d) => {
      const index = all.indexOf(d);
      const actCount = t.activities.filter((a) => a.destId === d.id).length;
      return `
        <article class="dest" data-status="${d.status}">
          <div class="dest-row">
            <div>
              <h3>${esc(d.name)}</h3>
              ${d.country ? `<div class="dest-country">${esc(d.country)}</div>` : ''}
            </div>
            <span class="chip plain status" data-status="${d.status}">${d.status}</span>
          </div>
          ${d.arrive ? `<div class="dest-dates">${fmtRange(d.arrive, d.depart || d.arrive)}</div>` : ''}
          ${d.notes ? `<p class="dest-notes">${esc(d.notes)}</p>` : ''}
          <div class="dest-foot">
            <span>${plural(actCount, 'activity').replace('activitys', 'activities')}</span>
            <span class="dest-tools">
              <button type="button" class="icon-btn" data-action="move-dest" data-id="${d.id}" data-dir="-1" aria-label="Move ${esc(d.name)} earlier in route" ${index === 0 ? 'disabled' : ''}>${icon('up')}</button>
              <button type="button" class="icon-btn" data-action="move-dest" data-id="${d.id}" data-dir="1" aria-label="Move ${esc(d.name)} later in route" ${index === all.length - 1 ? 'disabled' : ''}>${icon('down')}</button>
              <button type="button" class="icon-btn" data-action="edit-dest" data-id="${d.id}" aria-label="Edit ${esc(d.name)}">${icon('edit')}</button>
              <button type="button" class="icon-btn" data-action="delete-dest" data-id="${d.id}" aria-label="Delete ${esc(d.name)}">${icon('trash')}</button>
            </span>
          </div>
        </article>`;
    }).join('');

    return `
      <div class="section-head">
        <div>
          <h2>Destinations</h2>
          <p>The order here is the order of your route.</p>
        </div>
        <button type="button" class="btn btn-primary" data-action="add-dest">${icon('plus')} Add destination</button>
      </div>
      ${filters}
      ${all.length === 0
        ? `<div class="empty"><h3>No destinations yet</h3><p>Add the cities, regions, or stops you are considering. Mark them as dreaming, planned, or booked as your plans firm up.</p></div>`
        : list.length === 0
          ? `<div class="empty"><h3>No ${ui.destFilter.toLowerCase()} destinations</h3><p>Change a destination’s status or pick a different filter.</p></div>`
          : `<div class="dest-grid">${cards}</div>`}`;
  }

  /* ---- Budget ---- */
  function viewBudget(t, stats) {
    const max = Math.max(...stats.byCategory.map((c) => c.total), 1);
    const activityCosts = t.activities.filter((a) => a.cost > 0).length;
    const over = stats.remaining < 0 && t.budget > 0;

    const rows = stats.items.map((i) => `
      <tr>
        <td>${esc(i.title)}<div class="source">${i.source === 'activity' ? 'From itinerary' : 'Expense'}</div></td>
        <td><span class="chip" data-cat="${i.category}">${i.category}</span></td>
        <td>${i.date ? fmtShort(i.date) : '–'}</td>
        <td>${i.source === 'expense' ? (i.paid ? '<span class="paid">Paid</span>' : '<span class="unpaid">To pay</span>') : '<span class="unpaid">Estimate</span>'}</td>
        <td class="r amount">${money(i.amount, t.currency)}</td>
        <td class="r">
          <button type="button" class="icon-btn" data-action="${i.source === 'expense' ? 'edit-exp' : 'edit-act'}" data-id="${i.id}" aria-label="Edit ${esc(i.title)}">${icon('edit')}</button>
        </td>
      </tr>`).join('');

    return `
      <div class="section-head">
        <div>
          <h2>Budget</h2>
          <p>Activity costs from the itinerary are included automatically.</p>
        </div>
        <button type="button" class="btn btn-primary" data-action="add-exp">${icon('plus')} Add expense</button>
      </div>

      <div class="budget-tiles">
        <div class="tile"><div class="tile-label">Total budget</div><div class="tile-value">${t.budget > 0 ? money(t.budget, t.currency) : '–'}</div>
          <div class="tile-foot">${t.budget > 0 ? `${money(stats.perDay, t.currency)} per day planned` : '<button type="button" class="link-btn" style="color:var(--ink-3);padding:0" data-action="edit-trip">Set a budget</button>'}</div></div>
        <div class="tile"><div class="tile-label">Committed</div><div class="tile-value">${money(stats.total, t.currency)}</div>
          <div class="tile-foot">${money(stats.paid, t.currency)} paid</div></div>
        <div class="tile"><div class="tile-label">${over ? 'Over budget' : 'Remaining'}</div>
          <div class="tile-value ${over ? 'is-over' : ''}">${t.budget > 0 ? money(Math.abs(stats.remaining), t.currency) : '–'}</div>
          <div class="tile-foot">${t.budget > 0 ? `${Math.round(stats.pct)}% of budget used` : 'No budget set'}</div></div>
        <div class="tile"><div class="tile-label">Line items</div><div class="tile-value">${stats.items.length}</div>
          <div class="tile-foot">${plural(t.expenses.length, 'expense')}, ${plural(activityCosts, 'activity cost')}</div></div>
      </div>

      <div class="stack">
        ${t.budget > 0 ? `<section class="panel"><h3>Progress</h3>${meter(stats, t.budget)}
          <div class="meter-caption num"><span>${money(stats.total, t.currency)} committed</span><span>${money(t.budget, t.currency)} budget</span></div></section>` : ''}

        <section class="panel">
          <h3>By category</h3>
          <div class="cat-list">
            ${stats.byCategory.map((c) => `
              <div class="cat-row" data-cat="${c.name}">
                <span class="cat-name">${c.name}</span>
                <span class="cat-bar" aria-hidden="true"><span style="width:${(c.total / max) * 100}%"></span></span>
                <span class="cat-amt">${money(c.total, t.currency)}</span>
              </div>`).join('')}
          </div>
        </section>

        <section class="panel">
          <h3>Line items</h3>
          ${stats.items.length
            ? `<div class="table-wrap"><table>
                <thead><tr><th>Item</th><th>Category</th><th>Date</th><th>Status</th><th class="r">Amount</th><th><span class="sr-only">Actions</span></th></tr></thead>
                <tbody>${rows}</tbody></table></div>`
            : `<p style="color:var(--muted)">No costs yet. Add an expense for flights, stays, or anything you have booked.</p>`}
        </section>
      </div>`;
  }

  /* ------------------------------------------------------------------ *
   * Dialogs & forms
   * ------------------------------------------------------------------ */
  function closeDialog() {
    if (els.dialog.open) els.dialog.close();
  }

  function fieldHtml(f, values) {
    const raw = values[f.name] ?? f.value ?? '';
    const id = `f_${f.name}`;
    const opts = (f.options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
    let control;
    if (f.type === 'select') {
      control = `<select id="${id}" name="${f.name}">${opts.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(raw) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      control = `<textarea id="${id}" name="${f.name}" ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''}>${esc(raw)}</textarea>`;
    } else {
      control = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(raw)}"
        ${f.required ? 'required' : ''} ${f.step ? `step="${f.step}"` : ''} ${f.min != null ? `min="${f.min}"` : ''}
        ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.autofocus ? 'autofocus' : ''} ${f.type === 'text' || !f.type ? 'autocomplete="off"' : ''}>`;
    }
    return `
      <div class="field ${f.full ? 'full' : ''}">
        <label for="${id}">${esc(f.label)}${f.optional ? ' <span class="opt">(optional)</span>' : ''}</label>
        ${control}
        ${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}
      </div>`;
  }

  function openForm({ title, fields, values = {}, submitLabel = 'Save', onSubmit, onDelete, deleteLabel = 'Delete' }) {
    els.dialog.innerHTML = `
      <form class="dialog-form" method="dialog">
        <div class="dialog-head">
          <h2 id="dialogTitle">${esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="Close">${icon('close')}</button>
        </div>
        <div class="dialog-body">
          ${fields.map((f) => fieldHtml(f, values)).join('')}
          <p class="form-error" role="alert"></p>
        </div>
        <div class="dialog-foot">
          ${onDelete ? `<button type="button" class="btn btn-danger btn-sm" data-delete>${esc(deleteLabel)}</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn btn-ghost" data-close>Cancel</button>
          <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
        </div>
      </form>`;

    const form = $('form', els.dialog);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const data = Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      const error = onSubmit(data);
      if (error) $('.form-error', form).textContent = error;
      else closeDialog();
    });
    if (onDelete) {
      $('[data-delete]', form).addEventListener('click', () => { closeDialog(); onDelete(); });
    }
    if (!els.dialog.open) els.dialog.showModal();
  }

  /* ---- Form definitions ---- */
  function tripForm(existing) {
    openForm({
      title: existing ? 'Edit trip' : 'New trip',
      submitLabel: existing ? 'Save changes' : 'Create trip',
      values: existing || { start: todayISO(), end: addDays(todayISO(), 6), currency: 'USD', budget: '' },
      fields: [
        { name: 'name', label: 'Trip name', required: true, full: true, placeholder: 'Autumn in Kyoto', autofocus: true },
        { name: 'start', label: 'Start date', type: 'date', required: true },
        { name: 'end', label: 'End date', type: 'date', required: true },
        { name: 'currency', label: 'Currency', type: 'select', options: CURRENCIES },
        { name: 'budget', label: 'Total budget', type: 'number', min: 0, step: '0.01', optional: true, placeholder: '0' },
      ],
      onSubmit(d) {
        if (d.end < d.start) return 'The end date must be on or after the start date.';
        if (diffDays(d.start, d.end) + 1 > MAX_TRIP_DAYS) return `Trips can span up to ${MAX_TRIP_DAYS} days.`;
        const patch = { name: d.name, start: d.start, end: d.end, currency: d.currency, budget: Math.max(0, parseFloat(d.budget) || 0) };
        if (existing) {
          mutate('Trip updated', () => Object.assign(existing, patch));
        } else {
          mutate('Trip created', () => {
            const trip = { id: uid(), ...patch, destinations: [], activities: [], expenses: [] };
            state.trips.push(trip);
            state.activeId = trip.id;
            ui.view = 'overview';
          });
        }
      },
    });
  }

  function destForm(existing) {
    const t = activeTrip();
    openForm({
      title: existing ? 'Edit destination' : 'Add destination',
      submitLabel: existing ? 'Save changes' : 'Add destination',
      values: existing || { status: 'Dreaming' },
      fields: [
        { name: 'name', label: 'Place', required: true, placeholder: 'Kyoto', autofocus: true },
        { name: 'country', label: 'Country', optional: true, placeholder: 'Japan' },
        { name: 'status', label: 'Status', type: 'select', options: STATUSES, full: true },
        { name: 'arrive', label: 'Arrive', type: 'date', optional: true },
        { name: 'depart', label: 'Depart', type: 'date', optional: true },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, optional: true, placeholder: 'Where to stay, what not to miss' },
      ],
      onSubmit(d) {
        if (d.arrive && d.depart && d.depart < d.arrive) return 'The departure date must be on or after the arrival date.';
        const data = { name: d.name, country: d.country, status: d.status, arrive: d.arrive, depart: d.depart, notes: d.notes };
        if (existing) mutate('Destination updated', () => Object.assign(existing, data));
        else mutate('Destination added', () => t.destinations.push({ id: uid(), ...data }));
      },
    });
  }

  function actForm(existing, presetDate) {
    const t = activeTrip();
    const today = todayISO();
    const fallbackDate = presetDate || (today >= t.start && today <= t.end ? today : t.start);
    openForm({
      title: existing ? 'Edit activity' : 'Add activity',
      submitLabel: existing ? 'Save changes' : 'Add activity',
      values: existing || { date: fallbackDate, category: 'Activities', cost: '' },
      fields: [
        { name: 'title', label: 'What are you doing?', required: true, full: true, placeholder: 'Fushimi Inari at sunrise', autofocus: true },
        { name: 'date', label: 'Date', type: 'date', required: true },
        { name: 'time', label: 'Time', type: 'time', optional: true },
        { name: 'category', label: 'Category', type: 'select', options: CATEGORIES },
        { name: 'cost', label: 'Estimated cost', type: 'number', min: 0, step: '0.01', optional: true, placeholder: '0' },
        { name: 'destId', label: 'Destination', type: 'select', full: true, options: [{ value: '', label: 'None' }, ...t.destinations.map((d) => ({ value: d.id, label: d.name }))] },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, optional: true },
      ],
      onSubmit(d) {
        const data = { title: d.title, date: d.date, time: d.time, category: d.category, cost: Math.max(0, parseFloat(d.cost) || 0), destId: d.destId, notes: d.notes };
        if (existing) mutate('Activity updated', () => Object.assign(existing, data));
        else mutate('Activity added', () => t.activities.push({ id: uid(), done: false, ...data }));
      },
      onDelete: existing ? () => mutate('Activity deleted', () => { t.activities = t.activities.filter((a) => a.id !== existing.id); }, { undo: true }) : null,
    });
  }

  function expForm(existing) {
    const t = activeTrip();
    openForm({
      title: existing ? 'Edit expense' : 'Add expense',
      submitLabel: existing ? 'Save changes' : 'Add expense',
      values: existing ? { ...existing, paid: existing.paid ? 'yes' : 'no' } : { category: 'Transport', paid: 'no', date: todayISO() },
      fields: [
        { name: 'title', label: 'Description', required: true, full: true, placeholder: 'Return flights', autofocus: true },
        { name: 'amount', label: `Amount (${t.currency})`, type: 'number', required: true, min: 0, step: '0.01' },
        { name: 'category', label: 'Category', type: 'select', options: CATEGORIES },
        { name: 'date', label: 'Date', type: 'date', optional: true },
        { name: 'paid', label: 'Status', type: 'select', options: [{ value: 'no', label: 'To pay' }, { value: 'yes', label: 'Paid' }] },
      ],
      onSubmit(d) {
        const amount = parseFloat(d.amount);
        if (!(amount >= 0)) return 'Enter an amount of zero or more.';
        const data = { title: d.title, amount: Math.round(amount * 100) / 100, category: d.category, date: d.date, paid: d.paid === 'yes' };
        if (existing) mutate('Expense updated', () => Object.assign(existing, data));
        else mutate('Expense added', () => t.expenses.push({ id: uid(), ...data }));
      },
      onDelete: existing ? () => mutate('Expense deleted', () => { t.expenses = t.expenses.filter((e) => e.id !== existing.id); }, { undo: true }) : null,
    });
  }

  /* ------------------------------------------------------------------ *
   * Toasts
   * ------------------------------------------------------------------ */
  function toast(message, action) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.innerHTML = `<span>${esc(message)}</span>`;
    const remove = () => node.remove();
    if (action) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.addEventListener('click', () => { action.onClick(); remove(); });
      node.append(btn);
    }
    els.toasts.append(node);
    setTimeout(remove, action ? 7000 : 3500);
  }

  /* ------------------------------------------------------------------ *
   * Import / export
   * ------------------------------------------------------------------ */
  function exportData() {
    const blob = new Blob([JSON.stringify({ app: 'wayfare', version: 1, trips: state.trips }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wayfare-trips-${todayISO()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Exported your trips');
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        const trips = Array.isArray(parsed) ? parsed : parsed.trips;
        if (!Array.isArray(trips) || !trips.length) throw new Error('No trips found');
        mutate(`Imported ${plural(trips.length, 'trip')}`, () => {
          const added = trips.map(normalizeTrip);
          state.trips.push(...added);
          state.activeId = added[0].id;
          ui.view = 'overview';
        }, { undo: true });
      } catch {
        toast('That file is not a valid Wayfare export.');
      }
    };
    reader.readAsText(file);
  }

  /* ------------------------------------------------------------------ *
   * Event handling
   * ------------------------------------------------------------------ */
  const findIn = (list, id) => list.find((x) => x.id === id);

  const actions = {
    'switch-trip': (el) => { state.activeId = el.dataset.id; ui.view = 'overview'; ui.destFilter = 'All'; save(); render(); },
    'new-trip': () => tripForm(null),
    'edit-trip': () => tripForm(activeTrip()),
    'delete-trip': () => {
      const t = activeTrip();
      mutate(`Deleted “${t.name}”`, () => {
        state.trips = state.trips.filter((x) => x.id !== t.id);
        state.activeId = state.trips[0] ? state.trips[0].id : null;
      }, { undo: true });
    },
    'print': () => window.print(),
    'tab': (el) => { ui.view = el.dataset.view; render(); },
    'filter': (el) => { ui.destFilter = el.dataset.status; render(); },
    'add-dest': () => destForm(null),
    'edit-dest': (el) => destForm(findIn(activeTrip().destinations, el.dataset.id)),
    'delete-dest': (el) => {
      const t = activeTrip();
      const d = findIn(t.destinations, el.dataset.id);
      mutate(`Deleted ${d.name}`, () => {
        t.destinations = t.destinations.filter((x) => x.id !== d.id);
        t.activities.forEach((a) => { if (a.destId === d.id) a.destId = ''; });
      }, { undo: true });
    },
    'move-dest': (el) => {
      const list = activeTrip().destinations;
      const i = list.findIndex((d) => d.id === el.dataset.id);
      const j = i + Number(el.dataset.dir);
      if (j < 0 || j >= list.length) return;
      mutate(null, () => { [list[i], list[j]] = [list[j], list[i]]; });
    },
    'add-act': (el) => actForm(null, el.dataset.date),
    'edit-act': (el) => actForm(findIn(activeTrip().activities, el.dataset.id)),
    'add-exp': () => expForm(null),
    'edit-exp': (el) => expForm(findIn(activeTrip().expenses, el.dataset.id)),
    'export': exportData,
    'import': () => els.importFile.click(),
  };

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) { closeDialog(); return; }
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change="toggle-act"]');
    if (!el) return;
    const a = findIn(activeTrip().activities, el.dataset.id);
    if (a) mutate(null, () => { a.done = el.checked; });
  });

  els.importFile.addEventListener('change', () => {
    const file = els.importFile.files[0];
    if (file) importData(file);
    els.importFile.value = '';
  });

  // Close the dialog when the backdrop is clicked.
  els.dialog.addEventListener('mousedown', (e) => { if (e.target === els.dialog) closeDialog(); });

  /* ---- Drag and drop between days ---- */
  let dragId = null;

  document.addEventListener('dragstart', (e) => {
    const stop = e.target.closest && e.target.closest('.stop');
    if (!stop) return;
    dragId = stop.dataset.id;
    stop.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragId);
  });

  document.addEventListener('dragend', () => {
    dragId = null;
    document.querySelectorAll('.is-dragging, .is-over').forEach((n) => n.classList.remove('is-dragging', 'is-over'));
  });

  document.addEventListener('dragover', (e) => {
    const zone = e.target.closest && e.target.closest('[data-dropzone]');
    if (!zone || !dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.is-over').forEach((n) => { if (n !== zone) n.classList.remove('is-over'); });
    zone.classList.add('is-over');
  });

  document.addEventListener('drop', (e) => {
    const zone = e.target.closest && e.target.closest('[data-dropzone]');
    if (!zone || !dragId) return;
    e.preventDefault();
    const a = findIn(activeTrip().activities, dragId);
    const date = zone.dataset.dropzone;
    if (a && a.date !== date) mutate(`Moved to ${fmtDay(date)}`, () => { a.date = date; });
    else render();
  });

  /* ------------------------------------------------------------------ *
   * Init
   * ------------------------------------------------------------------ */
  if (!activeTrip() && state.trips.length) state.activeId = state.trips[0].id;
  render();
})();