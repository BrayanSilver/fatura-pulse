// Dados fictícios do dashboard, gravados no localStorage deste navegador.
(function () {
  const DATA_KEY = 'dashboard_faturamento_mock_v1';
  const FILTER_KEY = 'dashboard_faturamento_filters_v1';
  const VERSION = 2;

  const MONTHS_UP = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];
  const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const HOLIDAYS = new Set(['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25']);
  const CHANNEL_WEIGHTS = [0.52, 0.21, 0.16, 0.11];
  const REGION_BASE = [
    { name: 'Regional 1', weight: 0.42, perf: 1.06, meta1: 8000000, meta2: 8800000, ufs: ['SP', 'RJ', 'MG', 'ES'], repCount: 3 },
    { name: 'Regional 2', weight: 0.22, perf: 0.96, meta1: 4200000, meta2: 4650000, ufs: ['PR', 'SC', 'RS'], repCount: 2 },
    { name: 'Regional 3', weight: 0.16, perf: 0.9, meta1: 3000000, meta2: 3300000, ufs: ['BA', 'PE', 'CE', 'RN'], repCount: 2 },
    { name: 'Regional 4', weight: 0.12, perf: 1.08, meta1: 2300000, meta2: 2550000, ufs: ['GO', 'DF', 'MT', 'MS'], repCount: 2 },
    { name: 'Regional 5', weight: 0.08, perf: 0.94, meta1: 1500000, meta2: 1700000, ufs: ['PA', 'AM', 'RO'], repCount: 1 }
  ];
  const UF_LABEL = {
    SP: 'São Paulo', RJ: 'Rio de Janeiro', MG: 'Minas Gerais', ES: 'Espírito Santo',
    PR: 'Paraná', SC: 'Santa Catarina', RS: 'Rio Grande do Sul',
    BA: 'Bahia', PE: 'Pernambuco', CE: 'Ceará', RN: 'Rio Grande do Norte',
    GO: 'Goiás', DF: 'Distrito Federal', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul',
    PA: 'Pará', AM: 'Amazonas', RO: 'Rondônia'
  };

  const memory = {};
  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch (_) { return memory[key] || null; }
    },
    set(key, value) {
      memory[key] = String(value);
      try { localStorage.setItem(key, memory[key]); } catch (_) {}
    },
    remove(key) {
      delete memory[key];
      try { localStorage.removeItem(key); } catch (_) {}
    }
  };
  store.remove('lumi_dashboard_mock_v1');
  store.remove('lumi_dashboard_filters_v1');

  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function isoDate(date) { return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
  function isBusinessDay(date) {
    const dow = date.getDay();
    if (dow === 0 || dow === 6) return false;
    return !HOLIDAYS.has(pad(date.getMonth() + 1) + '-' + pad(date.getDate()));
  }
  function daysInMonth(y, m0) { return new Date(y, m0 + 1, 0).getDate(); }
  function countBusiness(y, m0, from, to) {
    let n = 0;
    for (let day = from; day <= to; day++) if (isBusinessDay(new Date(y, m0, day))) n++;
    return n;
  }
  function shuffle(rng, list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }
  function quotaBag(rng, total, entries) {
    const bag = [];
    entries.forEach((entry) => {
      const n = Math.round(total * entry.weight);
      for (let i = 0; i < n; i++) bag.push(entry.item);
    });
    while (bag.length < total) bag.push(entries[bag.length % entries.length].item);
    return shuffle(rng, bag.slice(0, total));
  }
  function sum(list) { return list.reduce((s, o) => s + (Number(o.value) || 0), 0); }
  function share(part, whole) { return whole > 0 ? part / whole : 0; }
  function brlShort(v) {
    const abs = Math.abs(v || 0);
    const sign = v < 0 ? '-' : '';
    if (abs >= 1e6) return sign + 'R$ ' + nf1.format(abs / 1e6) + ' mi';
    if (abs >= 1e3) return sign + 'R$ ' + nf1.format(abs / 1e3) + ' mil';
    return sign + money.format(abs);
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  }

  function makeCatalog(rng) {
    const used = new Set();
    function code(prefix, digits) {
      let label;
      do {
        const n = Math.floor(rng() * Math.pow(10, digits));
        label = prefix + ' ' + String(n).padStart(digits, '0');
      } while (used.has(label));
      used.add(label);
      return label;
    }
    const channels = CHANNEL_WEIGHTS.map((weight) => ({ name: code('Canal', 2), weight }));
    const repPerf = {};
    const regionals = REGION_BASE.map((base) => {
      const reps = [];
      for (let i = 0; i < base.repCount; i++) {
        const name = code('Representante', 3);
        reps.push(name);
        repPerf[name] = Math.round((0.88 + rng() * 0.26) * 100) / 100;
      }
      return {
        name: base.name,
        weight: base.weight,
        perf: base.perf,
        meta1: base.meta1,
        meta2: base.meta2,
        ufs: base.ufs.slice(),
        reps
      };
    });
    const clients = [];
    for (let i = 0; i < 32; i++) clients.push(code('Cliente', 4));
    return {
      channels,
      featured: channels[1].name,
      weekend: channels[channels.length - 1].name,
      regionals,
      repPerf,
      clients
    };
  }

  function generate() {
    const now = new Date();
    const asOf = isoDate(now);
    const company = { meta1: 19000000, meta2: 21000000 };
    const catalog = makeCatalog(mulberry32((Date.now() ^ 0x9e3779b9) >>> 0));
    const orders = [];
    let seq = 80420;

    for (let back = 2; back >= 0; back--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const y = monthDate.getFullYear();
      const m0 = monthDate.getMonth();
      const index = 2 - back;
      const lastDay = daysInMonth(y, m0);
      const isLatest = back === 0;
      const endDay = isLatest ? now.getDate() : lastDay;
      const totalBiz = countBusiness(y, m0, 1, lastDay) || 1;
      const elapsed = countBusiness(y, m0, 1, endDay);
      const attainment = isLatest ? 1.04 * (elapsed / totalBiz) : (index === 0 ? 1.07 : 0.92);
      const target = Math.max(50000, Math.round(company.meta1 * (elapsed === 0 ? 0.02 : attainment)));
      const rng = mulberry32(y * 1000 + (m0 + 1) * 17 + 91);
      const pool = catalog.clients.slice(0, Math.min(catalog.clients.length, 16 + index * 8));
      const newcomers = pool.slice(-6);
      const slots = [];
      for (let day = 1; day <= endDay; day++) {
        const business = isBusinessDay(new Date(y, m0, day));
        const ramp = 0.86 + 0.28 * (day / lastDay);
        slots.push({ day, business, w: (business ? 1 : 0.16) * ramp });
      }
      const count = Math.max(24, Math.round(target / 76000));
      const wsum = slots.reduce((s, sl) => s + sl.w, 0) || 1;
      let left = count;
      slots.forEach((sl, i) => {
        if (i === slots.length - 1) sl.n = left;
        else {
          sl.n = Math.min(left, Math.max(0, Math.round(count * sl.w / wsum)));
          left -= sl.n;
        }
      });

      const actual = slots.reduce((s, sl) => s + sl.n, 0);
      const regionalBag = quotaBag(rng, actual, catalog.regionals.map((r) => ({ item: r, weight: r.weight })));
      const channelBag = quotaBag(rng, actual, catalog.channels.map((c) => ({ item: c.name, weight: c.weight })));
      let bagIndex = 0;
      const monthOrders = [];
      slots.forEach((sl) => {
        for (let i = 0; i < sl.n; i++) {
          const reg = regionalBag[bagIndex];
          const channel = sl.business ? channelBag[bagIndex] : catalog.weekend;
          bagIndex++;
          const rep = reg.reps[Math.floor(rng() * reg.reps.length)];
          const uf = reg.ufs[Math.floor(rng() * reg.ufs.length)];
          const client = (rng() < 0.2)
            ? newcomers[Math.floor(rng() * newcomers.length)]
            : (rng() < 0.75 ? pool[Math.floor(rng() * Math.min(10, pool.length))] : pool[Math.floor(rng() * pool.length)]);
          const hour = sl.business ? 8 + Math.floor(rng() * 10) : 10 + Math.floor(rng() * 6);
          const minute = Math.floor(rng() * 60);
          monthOrders.push({
            id: 'PV-' + (seq++),
            date: y + '-' + pad(m0 + 1) + '-' + pad(sl.day) + 'T' + pad(hour) + ':' + pad(minute) + ':00',
            client,
            regional: reg.name,
            uf,
            rep,
            channel,
            newClient: newcomers.indexOf(client) >= 0,
            raw: (8000 + Math.pow(rng(), 1.35) * 150000) * reg.perf * (catalog.repPerf[rep] || 1) * (sl.business ? 1 : 0.4),
            returnRate: rng() < 0.07 ? (0.12 + rng() * 0.23) : 0,
            marginRate: 0.18 + rng() * 0.16
          });
        }
      });

      const rawSum = monthOrders.reduce((s, o) => s + o.raw, 0) || 1;
      const factor = target / rawSum;
      monthOrders.forEach((o) => { o.value = Math.max(1, Math.round(o.raw * factor)); });
      const drift = target - monthOrders.reduce((s, o) => s + o.value, 0);
      if (monthOrders.length) monthOrders[monthOrders.length - 1].value = Math.max(1, monthOrders[monthOrders.length - 1].value + drift);
      monthOrders.forEach((o) => {
        o.returns = Math.round(o.value * o.returnRate);
        o.gross = o.value + o.returns;
        o.margin = Math.round(o.value * o.marginRate);
        delete o.raw;
        delete o.returnRate;
        delete o.marginRate;
        orders.push(o);
      });
    }

    return {
      version: VERSION,
      asOf,
      generatedAt: new Date().toISOString(),
      company,
      catalog,
      televendas: { name: catalog.featured, meta1: 3000000, meta2: 4000000 },
      regionals: catalog.regionals.map((r) => ({ name: r.name, meta1: r.meta1, meta2: r.meta2 })),
      orders
    };
  }

  let cache = null;
  function getStore() {
    if (cache) return cache;
    try {
      const raw = store.get(DATA_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === VERSION && parsed.catalog && Array.isArray(parsed.orders) && parsed.orders.length) {
          cache = parsed;
          return cache;
        }
      }
    } catch (_) {}
    cache = generate();
    store.set(DATA_KEY, JSON.stringify(cache));
    return cache;
  }

  function live() {
    return getStore().catalog;
  }

  function listMonths() {
    return [...new Set(getStore().orders.map((o) => o.date.slice(0, 7)))].sort();
  }

  function defaultFilters() {
    const months = listMonths();
    return { month: months[months.length - 1] || '', regional: '', uf: '', rep: '', channel: '' };
  }

  function readFilters() {
    const filters = defaultFilters();
    try {
      const raw = store.get(FILTER_KEY);
      if (raw) Object.assign(filters, JSON.parse(raw));
    } catch (_) {}
    const months = listMonths();
    if (!months.includes(filters.month)) filters.month = months[months.length - 1] || '';
    const regs = live().regionals;
    if (!regs.some((r) => r.name === filters.regional)) filters.regional = '';
    const reg = regs.find((r) => r.name === filters.regional);
    if (filters.uf && reg && reg.ufs.indexOf(filters.uf) < 0) filters.uf = '';
    if (filters.uf && !Object.prototype.hasOwnProperty.call(UF_LABEL, filters.uf)) filters.uf = '';
    const repReg = regs.find((r) => r.reps.indexOf(filters.rep) >= 0);
    if (filters.rep && !repReg) filters.rep = '';
    if (filters.rep && reg && reg.reps.indexOf(filters.rep) < 0) filters.rep = '';
    if (filters.rep && filters.uf) {
      const ufReg = regs.find((r) => r.ufs.indexOf(filters.uf) >= 0);
      if (ufReg && ufReg.reps.indexOf(filters.rep) < 0) filters.rep = '';
    }
    if (!live().channels.some((c) => c.name === filters.channel)) filters.channel = '';
    return filters;
  }

  function writeFilters(filters) { store.set(FILTER_KEY, JSON.stringify(filters)); }

  function match(order, filters) {
    if (filters.regional && order.regional !== filters.regional) return false;
    if (filters.uf && order.uf !== filters.uf) return false;
    if (filters.rep && order.rep !== filters.rep) return false;
    if (filters.channel && order.channel !== filters.channel) return false;
    return true;
  }

  function groupBy(list, keyFn) {
    const map = new Map();
    list.forEach((order) => {
      const key = keyFn(order);
      if (!map.has(key)) map.set(key, { name: key, value: 0, orders: 0 });
      const row = map.get(key);
      row.value += order.value;
      row.orders += 1;
    });
    return map;
  }

  function heroGoals(data, monthOrders, filtered, filters) {
    const open = !filters.regional && !filters.uf && !filters.rep && !filters.channel;
    if (open) return { meta1: data.company.meta1, meta2: data.company.meta2 };
    const featured = data.catalog.featured;
    if (filters.channel === featured && !filters.uf && !filters.rep) {
      const allFeat = sum(monthOrders.filter((o) => o.channel === featured));
      const ratio = filters.regional ? share(sum(filtered), allFeat) : 1;
      return { meta1: Math.round(data.televendas.meta1 * ratio), meta2: Math.round(data.televendas.meta2 * ratio) };
    }
    const parent = filters.regional
      ? (data.regionals.find((r) => r.name === filters.regional) || data.company)
      : data.company;
    const parentOrders = monthOrders.filter((o) => !filters.regional || o.regional === filters.regional);
    const ratio = share(sum(filtered), sum(parentOrders));
    return { meta1: Math.round(parent.meta1 * ratio), meta2: Math.round(parent.meta2 * ratio) };
  }

  function televendasSlice(data, monthOrders, filters) {
    const featured = data.catalog.featured;
    const dim = monthOrders.filter((o) => o.channel === featured
      && (!filters.regional || o.regional === filters.regional)
      && (!filters.uf || o.uf === filters.uf)
      && (!filters.rep || o.rep === filters.rep));
    const allFeat = sum(monthOrders.filter((o) => o.channel === featured));
    const ratio = share(sum(dim), allFeat);
    const hidden = filters.channel && filters.channel !== featured;
    return {
      currentValue: hidden ? 0 : sum(dim),
      meta1: Math.round(data.televendas.meta1 * ratio),
      meta2: Math.round(data.televendas.meta2 * ratio)
    };
  }

  function buildInsights(data, monthOrders, filtered, filters, goals) {
    const ref = filters.month === String(data.asOf || '').slice(0, 7)
      ? data.asOf
      : (filters.month + '-' + pad(daysInMonth(Number(filters.month.slice(0, 4)), Number(filters.month.slice(5, 7)) - 1)));
    const refDay = Number(ref.slice(8, 10));
    const y = Number(filters.month.slice(0, 4));
    const m0 = Number(filters.month.slice(5, 7)) - 1;
    const totalDays = daysInMonth(y, m0);
    const byDay = new Map();
    filtered.forEach((o) => {
      const day = Number(o.date.slice(8, 10));
      byDay.set(day, (byDay.get(day) || 0) + o.value);
    });
    let businessDays = 0;
    let elapsed = 0;
    const daily = [];
    for (let day = 1; day <= totalDays; day++) {
      const businessDay = isBusinessDay(new Date(y, m0, day));
      if (businessDay) businessDays++;
      if (businessDay && day <= refDay) elapsed++;
      daily.push({ day, value: byDay.get(day) || 0, businessDay });
    }
    const net = sum(filtered);
    const gross = filtered.reduce((s, o) => s + o.gross, 0);
    const returns = filtered.reduce((s, o) => s + o.returns, 0);
    const mc = filtered.reduce((s, o) => s + o.margin, 0);
    const todayOrders = filtered.filter((o) => o.date.slice(0, 10) === ref);
    const clients = new Set(filtered.map((o) => o.client));
    const newOnes = filtered.filter((o) => o.newClient);
    const newNames = new Set(newOnes.map((o) => o.client));
    const grouped = groupBy(filtered, (o) => o.regional);
    const dim = !!(filters.regional || filters.uf || filters.rep || filters.channel);
    const regionals = data.regionals
      .filter((r) => !filters.regional || r.name === filters.regional)
      .map((r) => {
        const full = monthOrders.filter((o) => o.regional === r.name);
        const slice = full.filter((o) => match(o, { regional: '', uf: filters.uf, rep: filters.rep, channel: filters.channel }));
        const ratio = share(sum(slice), sum(full));
        const g = grouped.get(r.name);
        return {
          name: r.name,
          meta1: Math.round(r.meta1 * ratio),
          meta2: Math.round(r.meta2 * ratio),
          value: g ? g.value : 0,
          orders: g ? g.orders : 0
        };
      })
      .filter((r) => r.orders > 0 || !dim);

    const top = (key) => [...groupBy(filtered, key).values()].sort((a, b) => b.value - a.value).slice(0, 5);
    const dailyAverage = elapsed > 0 ? net / elapsed : 0;
    return {
      today: ref,
      goals: { meta1: goals.meta1, meta2: goals.meta2 },
      totals: {
        today: sum(todayOrders),
        todayOrders: todayOrders.length,
        orders: filtered.length,
        averageTicket: filtered.length ? net / filtered.length : 0,
        clients: clients.size,
        newClients: newNames.size,
        newClientsValue: sum(newOnes),
        returns,
        gross,
        mc,
        mcPercentage: gross > 0 ? (mc / gross) * 100 : null,
        net
      },
      pace: {
        projection: elapsed > 0 ? dailyAverage * businessDays : null,
        dailyAverage,
        businessDaysRemaining: Math.max(businessDays - elapsed, 0),
        businessDays: businessDays || 1
      },
      regionals,
      topReps: top((o) => o.rep),
      topUfs: top((o) => o.uf),
      daily
    };
  }

  function snapshot() {
    const data = getStore();
    const filters = readFilters();
    const monthOrders = data.orders.filter((o) => o.date.slice(0, 7) === filters.month);
    const filtered = monthOrders.filter((o) => match(o, filters));
    const goals = heroGoals(data, monthOrders, filtered, filters);
    const insights = buildInsights(data, monthOrders, filtered, filters, goals);
    const recentOrders = filtered.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1)));
    const monthIndex = Number(filters.month.slice(5, 7)) - 1;
    return {
      asOf: data.asOf,
      filters,
      monthLabel: MONTHS_UP[monthIndex] || '',
      sales: {
        goal: goals.meta1,
        meta2: goals.meta2,
        currentValue: insights.totals.net,
        televendas: televendasSlice(data, monthOrders, filters),
        recentOrders: recentOrders.slice(0, 8)
      },
      orders: recentOrders,
      insights,
      featuredChannel: data.catalog.featured,
      channelNames: data.catalog.channels.map((c) => c.name),
      signature: [filters.month, filters.regional, filters.uf, filters.rep, filters.channel, filtered.length, Math.round(insights.totals.net)].join('|')
    };
  }

  function ufsFor(regional) {
    const regs = live().regionals;
    const rows = regional ? regs.filter((r) => r.name === regional) : regs;
    const list = [];
    rows.forEach((r) => r.ufs.forEach((uf) => list.push(uf)));
    return list;
  }
  function repsFor(regional, uf) {
    let rows = live().regionals;
    if (regional) rows = rows.filter((r) => r.name === regional);
    if (uf) rows = rows.filter((r) => r.ufs.indexOf(uf) >= 0);
    const list = [];
    rows.forEach((r) => r.reps.forEach((rep) => list.push(rep)));
    return list;
  }

  class SalesDashboard {
    constructor() {
      this.goalValue = 19000000;
      this.meta2Goal = 21000000;
      this.currentValue = 0;
      this.televendasValue = 0;
      this.televendasGoal = 3000000;
      this.televendasMeta1 = 3000000;
      this.televendasMeta2 = 4000000;
      this.ctx = null;
      this.televendasCtx = null;
      this.updateInterval = 15000;
      this.lastUpdateTime = Date.now();
      this.hasInitialData = false;
      this.cachedSalesData = null;
      this._timer = null;
    }

    prepare() {
      const sales = document.getElementById('salesChart');
      const tv = document.getElementById('televendasChart');
      if (sales) {
        sales.width = 450;
        sales.height = 450;
        this.ctx = sales.getContext('2d');
      }
      if (tv) {
        tv.width = 240;
        tv.height = 240;
        this.televendasCtx = tv.getContext('2d');
      }
      if (this._timer) return;
      this.lastUpdateTime = Date.now();
      this.updateTimerDisplay();
      this._timer = setInterval(() => this.tick(), 250);
    }

    tick() {
      this.updateTimerDisplay();
      if (document.body.classList.contains('is-paused')) return;
      if (Date.now() - this.lastUpdateTime >= this.updateInterval) this.refreshAll();
    }

    refreshAll() {
      if (typeof window.__lumiSync === 'function') window.__lumiSync();
      else this.applySnapshot();
      this.lastUpdateTime = Date.now();
      this.updateDateTimeFromOffset();
      this.updateTimerDisplay();
      return Promise.resolve();
    }

    applySnapshot(snap) {
      const view = snap || snapshot();
      const tv = view.sales.televendas;
      this.televendasMeta1 = tv.meta1;
      this.televendasMeta2 = tv.meta2;
      this.televendasGoal = tv.meta1;
      this.televendasValue = tv.currentValue;
      const title = document.getElementById('featuredChannelTitle');
      if (title) title.textContent = view.featuredChannel || 'Canal';
      this.updateDashboard({ goal: view.sales.goal, meta2: view.sales.meta2, currentValue: view.sales.currentValue });
      this.updateDisplayValues();
      this.updateTelevendasDisplayValues({ currentValue: tv.currentValue });
      this.updateStatus();
      this.renderOrders(view.sales.recentOrders, view.insights.totals.orders);
      const monthEl = document.getElementById('currentMonth');
      if (monthEl) monthEl.textContent = view.monthLabel;
      if (this.ctx) this.drawChart();
      if (this.televendasCtx) this.drawTelevendasChart();
      this.updateDateTimeFromOffset();
    }

    updateDashboard(data) {
      if (!data) return;
      this.goalValue = Number(data.goal) || 0;
      this.currentValue = Number(data.currentValue) || 0;
      this.meta2Goal = Number(data.meta2) || 0;
      this.cachedSalesData = data;
      this.hasInitialData = true;
    }

    updateDisplayValues() {
      const pct = this.goalValue > 0 ? this.currentValue / this.goalValue * 100 : 0;
      const diff = Math.abs(this.goalValue - this.currentValue);
      text('percentageValue', this.goalValue > 0 ? nf1.format(pct) + '%' : '0%');
      text('chartCurrentValue', money.format(this.currentValue));
      text('goalValue', money.format(this.goalValue));
      text('meta2GoalValue', money.format(this.meta2Goal));
      text('currentValue', money.format(this.currentValue));
      text('differenceValue', money.format(diff));
    }

    updateTelevendasDisplayValues(data) {
      const current = Number(data && data.currentValue) || 0;
      this.televendasValue = current;
      text('televendasValue', money.format(current));
      text('televendasDifference', money.format(Math.abs((this.televendasMeta1 || 0) - current)));
      text('televendasMeta1Value', money.format(this.televendasMeta1 || 0));
      text('televendasMeta2Value', money.format(this.televendasMeta2 || 0));
      const label = document.getElementById('televendasDiffLabel');
      if (label) label.textContent = current >= (this.televendasMeta1 || 0) ? 'Acima da Meta 1' : 'Faltam para a Meta 1';
    }

    updateStatus() {
      const p1 = this.goalValue > 0 ? this.currentValue / this.goalValue * 100 : 0;
      const p2 = this.meta2Goal > 0 ? this.currentValue / this.meta2Goal * 100 : 0;
      text('statusText', this.goalValue > 0 ? nf1.format(p1) + '% da Meta' : 'Sem meta no recorte');
      text('meta2StatusText', this.meta2Goal > 0 ? (p2 >= 100 ? 'Meta 2 atingida' : nf1.format(p2) + '% da Meta 2') : 'Sem meta no recorte');
    }

    renderOrders(list, total) {
      const box = document.getElementById('pedidosList');
      const count = document.getElementById('pedidosCount');
      if (count) count.textContent = total ? (total + (total === 1 ? ' nota' : ' notas')) : '';
      if (!box) return;
      if (!list || !list.length) {
        box.innerHTML = '<div class="pedido-item loading"><div class="pedido-info"><span class="pedido-cliente">Nenhuma nota neste recorte</span></div></div>';
        return;
      }
      box.innerHTML = list.map((o) => `
        <div class="pedido-item">
          <div class="pedido-info">
            <span class="pedido-numero">${esc(String(o.id).replace(/^PV-/, 'NF-'))}</span>
            <span class="pedido-cliente">${esc(o.client)} · ${esc(o.channel)} · ${esc(o.uf)}</span>
          </div>
          <span class="pedido-valor">${money.format(o.value)}</span>
        </div>`).join('');
    }

    updateTimerDisplay() {
      const el = document.getElementById('timerValue');
      if (!el) return;
      const left = Math.max(0, this.updateInterval - (Date.now() - this.lastUpdateTime));
      el.textContent = Math.ceil(left / 1000) + 's';
    }

    updateDateTimeFromOffset() {
      const lbl = document.getElementById('lastUpdate');
      if (!lbl) return;
      lbl.textContent = 'Última atualização: ' + new Date().toLocaleTimeString('pt-BR');
    }

    drawChart() {}
    drawTelevendasChart() {}
  }

  function text(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function fillSelect(el, options, current, allLabel) {
    if (!el) return current || '';
    el.innerHTML = '';
    if (allLabel) {
      const all = document.createElement('option');
      all.value = '';
      all.textContent = allLabel;
      el.appendChild(all);
    }
    options.forEach((opt) => {
      const node = document.createElement('option');
      node.value = opt.value;
      node.textContent = opt.label;
      el.appendChild(node);
    });
    const keep = options.some((opt) => opt.value === current);
    el.value = keep ? current : '';
    return el.value;
  }

  function readForm() {
    return {
      month: valueOf('filterMonth'),
      regional: valueOf('filterRegional'),
      uf: valueOf('filterUf'),
      rep: valueOf('filterRep'),
      channel: valueOf('filterChannel')
    };
  }
  function valueOf(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
  }

  function paintForm(filters) {
    const months = listMonths().map((ym) => ({ value: ym, label: MONTHS[Number(ym.slice(5, 7)) - 1] + ' ' + ym.slice(0, 4) }));
    fillSelect(document.getElementById('filterMonth'), months, filters.month, '');
    const cat = live();
    fillSelect(document.getElementById('filterRegional'), cat.regionals.map((r) => ({ value: r.name, label: r.name })), filters.regional, 'Todas');
    filters.uf = fillSelect(
      document.getElementById('filterUf'),
      ufsFor(filters.regional).map((uf) => ({ value: uf, label: uf + ' · ' + UF_LABEL[uf] })),
      filters.uf,
      'Todos'
    );
    filters.rep = fillSelect(
      document.getElementById('filterRep'),
      repsFor(filters.regional, filters.uf).map((rep) => ({ value: rep, label: rep })),
      filters.rep,
      'Todos'
    );
    fillSelect(document.getElementById('filterChannel'), cat.channels.map((c) => ({ value: c.name, label: c.name })), filters.channel, 'Todos');
    document.querySelectorAll('#filtersBar .filter-field').forEach((field) => {
      const sel = field.querySelector('select');
      field.classList.toggle('is-active', !!(sel && sel.value && sel.id !== 'filterMonth'));
    });
    const monthField = document.getElementById('filterMonth');
    if (monthField) monthField.value = filters.month;
    return filters;
  }

  function updateSummary() {
    const el = document.getElementById('filterSummary');
    if (!el) return;
    const view = snapshot();
    const f = view.filters;
    const adjusted = !!(f.regional || f.uf || f.rep || f.channel);
    const n = view.insights.totals.orders;
    el.textContent = n + (n === 1 ? ' nota · ' : ' notas · ') + brlShort(view.insights.totals.net) + ' líquidos'
      + (adjusted ? ' · metas do recorte' : '');
  }

  function emitFilters(filters) {
    writeFilters(filters);
    updateSummary();
    window.dispatchEvent(new CustomEvent('lumi-filters-changed'));
  }

  function setupFilters() {
    const bar = document.getElementById('filtersBar');
    if (!bar) return;
    const filters = paintForm(readFilters());
    writeFilters(filters);
    updateSummary();
    bar.addEventListener('change', (event) => {
      if (!event.target.matches('select')) return;
      emitFilters(paintForm(readForm()));
    });
    const clear = document.getElementById('clearFilters');
    if (clear) {
      clear.addEventListener('click', () => {
        const next = defaultFilters();
        next.month = valueOf('filterMonth') || next.month;
        emitFilters(paintForm(next));
      });
    }
  }

  window.SalesDashboard = SalesDashboard;
  window.dashboard = new SalesDashboard();
  window.LumiMock = { snapshot, readFilters, writeFilters, defaultFilters, dataKey: DATA_KEY };
  if (typeof document !== 'undefined') setupFilters();
})();
