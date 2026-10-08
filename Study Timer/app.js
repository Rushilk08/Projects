(() => {
  const $ = s => document.querySelector(s);
  const MODES = {focus:{label:'Focus'}, short:{label:'Short break'}, long:{label:'Long break'}};
  const CYCLE = 4;
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem('tide.' + k)) ?? d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tide.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  const s = {
    mode: 'focus', running: false, endAt: 0, left: 0, cycle: store.get('cycle', 0),
    mins: store.get('mins', {focus: 25, short: 5, long: 15}),
    auto: store.get('auto', false), sound: store.get('sound', true),
    days: store.get('days', {})
  };
  const total = () => s.mins[s.mode] * 60000;
  s.left = total();

  const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function streak() {
    const d = new Date(); let n = 0;
    if (!s.days[dayKey(d)]) d.setDate(d.getDate() - 1); // today may still be empty
    while (s.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  const fmt = ms => { const t = Math.ceil(ms / 1000); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };

  function render() {
    const t = fmt(s.left);
    document.querySelectorAll('.time').forEach(e => e.textContent = t);
    document.querySelectorAll('.readout .label').forEach(e => e.textContent = MODES[s.mode].label);
    document.body.dataset.mode = s.mode;
    document.body.style.setProperty('--p', (1 - s.left / total()) * 100 + '%');
    document.title = (s.running ? '▶ ' : '') + t + ' · Tide';
    $('#toggle span').textContent = s.running ? 'Pause' : (s.left < total() ? 'Resume' : 'Start');
    document.querySelectorAll('.modes button').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === s.mode));
    $('#pips').innerHTML = [...Array(CYCLE)].map((_, i) => `<i class="${i < s.cycle ? 'on' : ''}"></i>`).join('');
    const n = streak(), today = s.days[dayKey()] || 0;
    $('#streak').textContent = n; $('#streakWord').textContent = n === 1 ? 'day streak' : 'day streak';
    $('.streak').classList.toggle('cold', n === 0);
    $('#today').textContent = `${today} ${today === 1 ? 'session' : 'sessions'} today`;
    $('#autoState').textContent = s.auto ? 'on' : 'off';
    $('#soundState').textContent = s.sound ? 'on' : 'off';
  }

  const say = m => { $('#live').textContent = m; };

  function beep() {
    if (!s.sound) return;
    try {
      const c = new (window.AudioContext || window.webkitAudioContext)();
      [660, 880, 1100].forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.value = f; o.connect(g); g.connect(c.destination);
        const t = c.currentTime + i * .18;
        g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(.2, t + .03); g.gain.exponentialRampToValueAtTime(.001, t + .25);
        o.start(t); o.stop(t + .3);
      });
    } catch (e) {}
  }

  function setMode(m, run = false) {
    s.mode = m; s.running = false; s.left = total();
    if (run) start();
    render();
  }
  function start() { s.running = true; s.endAt = Date.now() + s.left; render(); }
  function pause() { s.running = false; s.left = Math.max(0, s.endAt - Date.now()); render(); }
  const toggle = () => { s.running ? pause() : start(); say(s.running ? 'Started' : 'Paused'); };
  const reset = () => { s.running = false; s.left = total(); render(); say('Reset'); };

  function next(completed) {
    if (s.mode === 'focus') {
      if (completed) {
        const k = dayKey(); s.days[k] = (s.days[k] || 0) + 1; store.set('days', s.days);
        s.cycle++;
      }
      const long = s.cycle >= CYCLE;
      if (long) s.cycle = 0;
      store.set('cycle', s.cycle);
      setMode(long ? 'long' : 'short', s.auto && completed);
      if (long && completed) { /* cycle dots reset after the long break begins */ }
    } else setMode('focus', s.auto && completed);
    store.set('cycle', s.cycle);
  }

  setInterval(() => {
    if (!s.running) return;
    s.left = Math.max(0, s.endAt - Date.now());
    if (s.left === 0) {
      s.running = false; beep();
      say(s.mode === 'focus' ? 'Focus session complete. Time for a break.' : 'Break over. Ready to focus.');
      next(true);
    } else render();
  }, 250);

  function adjust(d) {
    if (s.running) return;
    s.mins[s.mode] = Math.min(180, Math.max(1, s.mins[s.mode] + d));
    store.set('mins', s.mins); s.left = total(); render(); say(`${MODES[s.mode].label} set to ${s.mins[s.mode]} minutes`);
  }

  const help = $('#help');
  const toggleHelp = () => help.open ? help.close() : help.showModal();

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.matches('input,textarea')) return;
    const k = e.key.toLowerCase();
    if (help.open) { if (k === '?' || k === 'h') { e.preventDefault(); toggleHelp(); } return; }
    const map = {
      ' ': toggle, r: reset, s: () => next(false),
      1: () => setMode('focus'), 2: () => setMode('short'), 3: () => setMode('long'),
      arrowup: () => adjust(1), arrowdown: () => adjust(-1),
      a: () => { s.auto = !s.auto; store.set('auto', s.auto); render(); say('Auto-start ' + (s.auto ? 'on' : 'off')); },
      m: () => { s.sound = !s.sound; store.set('sound', s.sound); render(); say('Sound ' + (s.sound ? 'on' : 'off')); },
      '?': toggleHelp, h: toggleHelp
    };
    if (map[k]) { e.preventDefault(); map[k](); }
  });

  $('#toggle').addEventListener('click', toggle);
  $('#reset').addEventListener('click', reset);
  $('#skip').addEventListener('click', () => next(false));
  $('#helpBtn').addEventListener('click', toggleHelp);
  $('#closeHelp').addEventListener('click', () => help.close());
  document.querySelectorAll('.modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
  render();
})();