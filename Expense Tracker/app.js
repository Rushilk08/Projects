(() => {
  const CATS = {
    Housing:['🏠','#5b3df5'], Food:['🍜','#ff6b5a'], Transport:['🚌','#2bb3c0'],
    Fun:['🎟️','#f5a623'], Health:['💊','#e0559c'], Shopping:['🛍️','#7a8cff'],
    Salary:['💼','#1a9b57'], Other:['✨','#8a8fb0']
  };
  const EXP = Object.keys(CATS).filter(c => c !== 'Salary');
  const $ = id => document.getElementById(id);
  const money = n => (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('en-US', {maximumFractionDigits: 0});
  const money2 = n => '$' + n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const esc = s => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ym = d => d.slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);

  let state = load();
  function load() {
    try { const s = JSON.parse(localStorage.getItem('pocketbook')); if (s) return s; } catch (e) {}
    const m = today.slice(0, 8), d = n => m + String(n).padStart(2, '0');
    return {
      budgets: {Housing:1200, Food:450, Transport:150, Fun:120, Health:80, Shopping:200, Other:100},
      tx: [
        {id:1,type:'income',category:'Salary',amount:4200,date:d(1),note:'Paycheck'},
        {id:2,type:'expense',category:'Housing',amount:1150,date:d(2),note:'Rent'},
        {id:3,type:'expense',category:'Food',amount:86.4,date:d(3),note:'Groceries'},
        {id:4,type:'expense',category:'Transport',amount:42,date:d(4),note:'Metro pass'},
        {id:5,type:'expense',category:'Fun',amount:138,date:d(5),note:'Concert tickets'},
        {id:6,type:'expense',category:'Food',amount:64.2,date:d(6),note:'Dinner out'}
      ]
    };
  }
  const save = () => localStorage.setItem('pocketbook', JSON.stringify(state));

  const monthEl = $('month'); monthEl.value = ym(today);
  $('cat').innerHTML = EXP.map(c => `<option>${c}</option>`).join('');
  document.querySelector('[name=date]').value = today;

  document.querySelectorAll('[name=type]').forEach(r => r.addEventListener('change', () => {
    $('cat').innerHTML = (r.value === 'income' ? ['Salary','Other'] : EXP).map(c => `<option>${c}</option>`).join('');
  }));

  $('form').addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(e.target);
    state.tx.push({id: Date.now(), type: f.get('type'), category: f.get('category'),
      amount: parseFloat(f.get('amount')), date: f.get('date'), note: f.get('note').trim()});
    save(); monthEl.value = ym(f.get('date'));
    e.target.amount.value = ''; e.target.note.value = '';
    render();
  });

  monthEl.addEventListener('change', render);
  $('csv').addEventListener('click', () => {
    const rows = [['Date','Type','Category','Amount','Note'], ...state.tx.map(t => [t.date,t.type,t.category,t.amount,'"' + t.note.replace(/"/g,'""') + '"'])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], {type:'text/csv'}));
    a.download = 'pocketbook.csv'; a.click();
  });

  function render() {
    const m = monthEl.value || ym(today);
    const list = state.tx.filter(t => ym(t.date) === m).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const income = list.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const spent = list.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const byCat = {};
    list.filter(t => t.type === 'expense').forEach(t => byCat[t.category] = (byCat[t.category] || 0) + t.amount);
    const budgetTotal = Object.values(state.budgets).reduce((s, n) => s + n, 0);

    // hero
    const left = budgetTotal - spent;
    $('left').textContent = money(left); $('left').className = left < 0 ? 'neg' : '';
    $('sIn').textContent = money(income); $('sOut').textContent = money(spent);
    $('sRate').textContent = income ? Math.round(Math.max(0, (income - spent) / income) * 100) + '%' : '–';
    $('meter').innerHTML = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) =>
      `<i title="${c}" style="width:${Math.min(100, v / Math.max(budgetTotal, spent, 1) * 100)}%;background:${CATS[c][1]}"></i>`).join('');
    $('heroNote').textContent = left < 0 ? `You're ${money(-left)} over your ${money(budgetTotal)} plan.` : `${money(spent)} of ${money(budgetTotal)} planned spending used.`;

    // donut + legend
    let off = 0;
    $('donut').innerHTML = '<circle cx="21" cy="21" r="15.9155" stroke="#eceef7"/>' + Object.entries(byCat).map(([c, v]) => {
      const p = v / spent * 100, s = `<circle cx="21" cy="21" r="15.9155" stroke="${CATS[c][1]}" stroke-dasharray="${Math.max(p - .8, .1)} ${100 - p + .8}" stroke-dashoffset="${-off}"/>`;
      off += p; return s;
    }).join('');
    $('legend').innerHTML = spent ? Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) =>
      `<li><i style="background:${CATS[c][1]}"></i>${c}<b>${money(v)}</b></li>`).join('') : '<li class="muted">No spending yet this month.</li>';

    // 6-month bars
    const months = [...Array(6)].map((_, i) => { const d = new Date(m + '-01T00:00'); d.setMonth(d.getMonth() - 5 + i); return d; });
    const sums = months.map(d => { const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), t = state.tx.filter(x => ym(x.date) === k);
      return {l: d.toLocaleString('en', {month:'short'}), i: t.filter(x => x.type === 'income').reduce((s, x) => s + x.amount, 0), o: t.filter(x => x.type === 'expense').reduce((s, x) => s + x.amount, 0)}; });
    const max = Math.max(...sums.flatMap(s => [s.i, s.o]), 1);
    $('bars').innerHTML = sums.map(s => `<div class="bar"><div class="pair"><i style="height:${s.i / max * 100}%;background:var(--lime)" title="Income ${money(s.i)}"></i><i style="height:${s.o / max * 100}%;background:var(--violet)" title="Spent ${money(s.o)}"></i></div>${s.l}</div>`).join('');

    // budgets
    $('budgetList').innerHTML = EXP.filter(c => c in state.budgets).map(c => {
      const used = byCat[c] || 0, lim = state.budgets[c], pct = lim ? Math.min(100, used / lim * 100) : 0, over = used > lim;
      return `<div class="b"><div class="h"><span>${CATS[c][0]} ${c}</span><input type="number" min="0" value="${lim}" data-cat="${c}" aria-label="${c} budget"></div>
        <div class="track"><i style="width:${pct}%;background:${over ? 'var(--coral)' : CATS[c][1]}"></i></div>
        <small class="${over ? 'over' : ''}">${over ? money(used - lim) + ' over' : money(lim - used) + ' left'}</small></div>`;
    }).join('');
    document.querySelectorAll('#budgetList input').forEach(i => i.addEventListener('change', () => {
      state.budgets[i.dataset.cat] = Math.max(0, parseFloat(i.value) || 0); save(); render();
    }));

    // transactions
    $('txList').innerHTML = list.length ? list.map(t => `<li>
      <span class="dot" style="background:${CATS[t.category][1]}22">${CATS[t.category][0]}</span>
      <div class="tx-main"><div>${esc(t.note || t.category)}</div><small>${t.category} · ${new Date(t.date + 'T00:00').toLocaleDateString('en', {month:'short', day:'numeric'})}</small></div>
      <span class="amt ${t.type === 'income' ? 'pos' : ''}">${t.type === 'income' ? '+' : '-'}${money2(t.amount)}</span>
      <button class="del" data-id="${t.id}" aria-label="Delete transaction">×</button></li>`).join('')
      : '<li class="empty">Nothing here yet. Add your first transaction.</li>';
    document.querySelectorAll('.del').forEach(b => b.addEventListener('click', () => {
      state.tx = state.tx.filter(t => t.id !== +b.dataset.id); save(); render();
    }));
  }
  render();
})();