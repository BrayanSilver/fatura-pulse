// ============================================================
// Dashboard de Vendas (teste) - novo visual + indicadores detalhados
// Carregado depois de script.js: reaproveita a classe SalesDashboard
// e só substitui o desenho dos gráficos e a origem da meta.
// ============================================================
(function () {
    const ROTATE_MS = 30000;      // tempo de cada tela na alternância automática
    const POLL_MS = 60000;        // o servidor recalcula os indicadores a cada ~2 min
    const RETRY_MS = 8000;        // enquanto o primeiro cálculo não fica pronto
  
    const byId = (id) => document.getElementById(id);
    const nf0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
    const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const nf2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const brl = (v) => (v < 0 ? '-' : '') + 'R$ ' + nf0.format(Math.abs(Math.round(v || 0)));
    const brlShort = (v) => {
      const abs = Math.abs(v || 0), sign = v < 0 ? '-' : '';
      if (abs >= 1e6) return `${sign}R$ ${nf2.format(abs / 1e6)} mi`;
      if (abs >= 1e3) return `${sign}R$ ${nf1.format(abs / 1e3)} mil`;
      return `${sign}R$ ${nf0.format(abs)}`;
    };
    const pct = (v) => nf1.format(v || 0) + '%';
    const plural = (n, one, many) => `${nf0.format(n)} ${n === 1 ? one : many}`;
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
    const toneFor = (value, meta1, meta2) => {
      if (!(meta1 > 0)) return 'tone-neutral';
      if (meta2 > 0 && value >= meta2) return 'tone-purple';
      const p = value / meta1 * 100;
      return p >= 100 ? 'tone-green' : p >= 80 ? 'tone-amber' : 'tone-red';
    };
    const UF_NAMES = {
      AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
      ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
      PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
      RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
      EX: 'Exterior'
    };
  
    // ===== Anéis de progresso =====
    const RING_COLORS = {
      red: ['#fb7185', '#f97316', 'rgba(249,115,22,0.55)'],
      amber: ['#f59e0b', '#fde047', 'rgba(250,204,21,0.5)'],
      green: ['#10b981', '#6ee7b7', 'rgba(52,211,153,0.55)'],
      violet: ['#8b5cf6', '#c4b5fd', 'rgba(167,139,250,0.5)'],
      sky: ['#0ea5e9', '#818cf8', 'rgba(56,189,248,0.5)']
    };
    const ringTone = (percentage) => (percentage >= 100 ? RING_COLORS.green : percentage >= 80 ? RING_COLORS.amber : RING_COLORS.red);
  
    function arcStroke(ctx, cx, cy, fraction, from, to) {
      if (!ctx.createConicGradient) return to;
      const gradient = ctx.createConicGradient(-Math.PI / 2, cx, cy);
      gradient.addColorStop(0, from);
      gradient.addColorStop(Math.max(fraction, 0.001), to);
      gradient.addColorStop(1, from);
      return gradient;
    }
  
    function drawRing(ctx, cx, cy, radius, width, fraction, colors, glow) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineWidth = width;
      ctx.strokeStyle = 'rgba(148,163,184,0.12)';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
  
      if (fraction > 0) {
        const start = -Math.PI / 2;
        const end = start + fraction * Math.PI * 2;
        ctx.strokeStyle = arcStroke(ctx, cx, cy, fraction, colors[0], colors[1]);
        ctx.shadowColor = colors[2];
        ctx.shadowBlur = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, start, end);
        ctx.stroke();
  
        if (width >= 12) {
          ctx.shadowColor = 'rgba(0,0,0,0.45)';
          ctx.shadowBlur = 6;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(cx + Math.cos(end) * radius, cy + Math.sin(end) * radius, width * 0.26, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  
    function drawTicks(ctx, cx, cy, radius) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < 40; i++) {
        const major = i % 10 === 0;
        const angle = -Math.PI / 2 + (i / 40) * Math.PI * 2;
        const inner = radius - (major ? 9 : 4);
        ctx.strokeStyle = major ? 'rgba(226,232,240,0.55)' : 'rgba(148,163,184,0.22)';
        ctx.lineWidth = major ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
        ctx.stroke();
      }
      ctx.restore();
    }
  
    SalesDashboard.prototype.drawChart = function () {
      if (!this.ctx) return;
      const ctx = this.ctx, size = 450, c = size / 2;
      ctx.clearRect(0, 0, size, size);
  
      const pct1 = this.goalValue > 0 ? this.currentValue / this.goalValue * 100 : 0;
      const pct2 = this.meta2Goal > 0 ? this.currentValue / this.meta2Goal * 100 : 0;
      drawTicks(ctx, c, c, 220);
      drawRing(ctx, c, c, 190, 24, Math.min(pct1 / 100, 1), ringTone(pct1), 22);
      drawRing(ctx, c, c, 157, 7, Math.min(pct2 / 100, 1), RING_COLORS.violet, 10);
  
      const inline = byId('meta2PctInline');
      if (inline) inline.textContent = pct(pct2);
    };
  
    SalesDashboard.prototype.drawTelevendasChart = function () {
      if (!this.televendasCtx) return;
      const ctx = this.televendasCtx, size = 240, c = size / 2;
      ctx.clearRect(0, 0, size, size);
  
      const percentage = this.televendasGoal > 0 ? this.televendasValue / this.televendasGoal * 100 : 0;
      drawRing(ctx, c, c, 100, 16, Math.min(percentage / 100, 1), percentage >= 100 ? RING_COLORS.green : RING_COLORS.sky, 12);
  
      const pctEl = byId('televendasPct');
      if (pctEl) pctEl.textContent = pct(percentage);
      const label = byId('televendasDiffLabel');
      if (label) label.textContent = this.televendasValue >= this.televendasGoal ? 'Acima da Meta 1' : 'Faltam para a Meta 1';
    };
  
    // ===== Cores da paleta nova (script.js aplica cores fixas inline) =====
    const toneColor = (percentage) => (percentage >= 100 ? 'var(--green)' : percentage >= 80 ? 'var(--amber)' : 'var(--rose)');
    const paint = (el, prop, value) => { if (el) el.style.setProperty(prop, value, 'important'); };
  
    const baseUpdateDisplayValues = SalesDashboard.prototype.updateDisplayValues;
    SalesDashboard.prototype.updateDisplayValues = function () {
      baseUpdateDisplayValues.call(this);
      const percentage = this.goalValue > 0 ? this.currentValue / this.goalValue * 100 : 0;
      paint(byId('percentageValue'), 'color', toneColor(percentage));
      paint(byId('chartCurrentValue'), 'color', 'var(--text-strong)');
      paint(document.querySelector('.status-dot-large'), 'background', toneColor(percentage));
      paint(byId('differenceValue'), 'color', this.currentValue >= this.goalValue ? 'var(--green)' : 'var(--rose)');
      paint(byId('meta2StatusDot'), 'background', this.currentValue >= this.meta2Goal ? 'var(--green)' : 'var(--rose)');
    };
  
    const baseUpdateTelevendasDisplayValues = SalesDashboard.prototype.updateTelevendasDisplayValues;
    SalesDashboard.prototype.updateTelevendasDisplayValues = function (data) {
      baseUpdateTelevendasDisplayValues.call(this, data);
      if (data) paint(byId('televendasDifference'), 'color', (Number(data.currentValue) || 0) >= this.televendasMeta1 ? 'var(--green)' : 'var(--rose)');
    };
  
    // ===== Meta do mês vinda de METAS_REGIONAL (substitui GOAL_VALUE e a Meta 2 fixa) =====
    let insights = null;
    let dbGoals = null;
  
    const baseUpdateDashboard = SalesDashboard.prototype.updateDashboard;
    SalesDashboard.prototype.updateDashboard = function (data) {
      if (dbGoals && data) {
        if (dbGoals.meta2 > 0) this.meta2Goal = dbGoals.meta2;
        data = Object.assign({}, data, { goal: dbGoals.meta1 });
      }
      return baseUpdateDashboard.call(this, data);
    };
  
    function applyDbGoals(goals) {
      if (!goals || !(goals.meta1 > 0)) return;
      const changed = !dbGoals || dbGoals.meta1 !== goals.meta1 || dbGoals.meta2 !== goals.meta2;
      dbGoals = goals;
      if (!changed || typeof dashboard === 'undefined' || !dashboard || !dashboard.hasInitialData || !dashboard.cachedSalesData) return;
      dashboard.updateDashboard(dashboard.cachedSalesData);
      dashboard.updateDisplayValues();
      dashboard.updateStatus();
      dashboard.drawChart();
    }
  
    function currentMeta1() {
      if (insights && insights.goals && insights.goals.meta1 > 0) return insights.goals.meta1;
      return (typeof dashboard !== 'undefined' && dashboard && dashboard.goalValue) || 0;
    }
  
    // ===== Alternância entre as telas =====
    const views = {
      indicadores: byId('viewIndicadores'),
      notas: byId('viewNotas'),
      clientes: byId('viewClientes'),
      canais: byId('viewCanais'),
      faturamento: byId('viewGeral')
    };
    const viewOrder = ['indicadores', 'notas', 'clientes', 'canais', 'faturamento'];
    const rotateBar = byId('rotateProgressBar');
    let currentView = 'indicadores';
    let autoRotate = localStorage.getItem('teste_auto_rotate') !== '0';
    let rotateTimer = null;
    let rotateRemaining = ROTATE_MS;
    let rotateStartedAt = 0;
    let paused = false;
  
    function showView(name) {
      currentView = name;
      for (const [key, el] of Object.entries(views)) el.classList.toggle('hidden', key !== name);
      document.querySelectorAll('.view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
      if (name === 'indicadores') requestAnimationFrame(drawDailyChart);
      scheduleRotation();
    }
  
    function scheduleRotation() {
      clearTimeout(rotateTimer);
      rotateRemaining = ROTATE_MS;
      rotateBar.style.transition = 'none';
      rotateBar.style.width = '0%';
      if (autoRotate && !paused) runRotation();
    }
  
    function runRotation() {
      rotateStartedAt = Date.now();
      void rotateBar.offsetWidth;
      rotateBar.style.transition = `width ${rotateRemaining}ms linear`;
      rotateBar.style.width = '100%';
      rotateTimer = setTimeout(() => {
        const index = viewOrder.indexOf(currentView);
        showView(viewOrder[(index + 1) % viewOrder.length]);
      }, rotateRemaining);
    }
  
    function freezeRotation() {
      clearTimeout(rotateTimer);
      if (!autoRotate) return;
      rotateRemaining = Math.max(0, rotateRemaining - (Date.now() - rotateStartedAt));
      rotateBar.style.transition = 'none';
      rotateBar.style.width = `${(1 - rotateRemaining / ROTATE_MS) * 100}%`;
    }
  
    // ===== Pausa: congela a alternância e a atualização dos dados =====
    const pauseBtn = byId('pauseToggle');
    let insightsWaiting = false;
  
    const baseRefreshAll = SalesDashboard.prototype.refreshAll;
    SalesDashboard.prototype.refreshAll = function () {
      if (paused) return Promise.resolve();
      return baseRefreshAll.apply(this, arguments);
    };
  
    const baseUpdateTimerDisplay = SalesDashboard.prototype.updateTimerDisplay;
    SalesDashboard.prototype.updateTimerDisplay = function () {
      const el = byId('timerValue');
      if (el) el.classList.toggle('paused', paused);
      if (paused) {
        if (el) el.textContent = 'pausado';
        return;
      }
      return baseUpdateTimerDisplay.apply(this, arguments);
    };
  
    const baseUpdateDateTime = SalesDashboard.prototype.updateDateTimeFromOffset;
    SalesDashboard.prototype.updateDateTimeFromOffset = function () {
      if (paused) return;
      return baseUpdateDateTime.apply(this, arguments);
    };
  
    function setPaused(value) {
      paused = value;
      const lbl = byId('lastUpdate');
      if (paused && lbl) lbl.textContent = lbl.textContent.replace('Última atualização:', 'Pausado · dados de');
      if (!paused && lbl) lbl.textContent = lbl.textContent.replace('Pausado · dados de', 'Última atualização:');
      document.body.classList.toggle('is-paused', paused);
      pauseBtn.classList.toggle('paused', paused);
      pauseBtn.setAttribute('aria-pressed', String(paused));
      pauseBtn.title = paused ? 'Retomar (volta a atualizar e alternar)' : 'Pausar (congela a tela e a alternância)';
      if (paused) {
        freezeRotation();
        return;
      }
      if (autoRotate) runRotation();
      if (typeof dashboard !== 'undefined' && dashboard) {
        const untilNextTick = dashboard.updateInterval - (Date.now() - dashboard.lastUpdateTime);
        if (untilNextTick > 2000) dashboard.refreshAll().catch(() => {});
      }
      if (insightsWaiting) {
        insightsWaiting = false;
        loadInsights();
      }
    }
  
    pauseBtn.addEventListener('click', () => setPaused(!paused));
  
    function renderRotateButton() {
      const btn = byId('rotateToggle');
      btn.classList.toggle('active', autoRotate);
      btn.title = autoRotate ? 'Alternância automática ligada (clique para desligar)' : 'Alternância automática desligada (clique para ligar)';
    }
  
    document.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
    byId('rotateToggle').addEventListener('click', () => {
      autoRotate = !autoRotate;
      localStorage.setItem('teste_auto_rotate', autoRotate ? '1' : '0');
      renderRotateButton();
      scheduleRotation();
    });
    byId('soundToggle').addEventListener('click', (e) => e.currentTarget.classList.toggle('muted'));
  
    // ===== Carga dos indicadores (localStorage ou API) =====
    let lastInsightSig = '';

    function syncFromMock() {
      const snap = window.LumiMock.snapshot();
      if (snap.signature === lastInsightSig && insights) return;
      lastInsightSig = snap.signature;
      dbGoals = snap.insights.goals || { meta1: 0, meta2: 0 };
      if (typeof dashboard !== 'undefined' && dashboard && dashboard.applySnapshot) dashboard.applySnapshot(snap);
      insights = snap.insights;
      insights.orders = snap.orders || [];
      insights.channelNames = snap.channelNames || [];
      renderInsights();
      renderFooter({
        mock: true,
        lastUpdate: new Date().toISOString(),
        orderCount: insights.totals.orders
      });
    }

    async function loadInsights() {
      if (paused) {
        insightsWaiting = true;
        return;
      }
      if (window.LumiMock) {
        try { syncFromMock(); } catch (err) { if (!insights) renderPending(err.message); }
        return;
      }
      let next = POLL_MS;
      try {
        const r = await fetch('/api/insights', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
        const j = await r.json();
        if (j.data) {
          insights = j.data;
          applyDbGoals(insights.goals);
          renderInsights();
        } else {
          next = RETRY_MS;
          if (!insights) renderPending(j.error);
        }
        renderFooter(j);
      } catch (err) {
        next = RETRY_MS;
        if (!insights) renderPending(err.message);
      }
      setTimeout(loadInsights, next);
    }
  
    function renderPending(error) {
      byId('regionalList').innerHTML = `<div class="loading">${error ? 'Erro ao carregar indicadores: ' + esc(error) : 'Calculando indicadores...'}</div>`;
    }
  
    function renderFooter(meta) {
      const footer = byId('insightsFooter');
      if (meta && meta.mock) {
        const when = meta.lastUpdate ? new Date(meta.lastUpdate).toLocaleTimeString('pt-BR') : '';
        const n = Number(meta.orderCount) || 0;
        footer.textContent = 'Demonstração salva neste navegador · ' + n + (n === 1 ? ' nota no recorte' : ' notas no recorte') + (when ? ' · atualizado às ' + when : '');
        footer.classList.remove('stale');
        return;
      }
      const parts = ['Fonte: Protheus (faturamento líquido de devoluções) e METAS_REGIONAL'];
      if (meta.lastUpdate) parts.push('atualizado às ' + new Date(meta.lastUpdate).toLocaleTimeString('pt-BR'));
      if (meta.refreshIntervalMs) parts.push(`recalculado a cada ${Math.round(meta.refreshIntervalMs / 60000)} min`);
      parts.push('dias úteis = segunda a sexta, sem feriados');
      if (meta.stale && meta.lastUpdate) parts.push('⚠️ dados desatualizados');
      footer.textContent = parts.join('  ·  ');
      footer.classList.toggle('stale', !!(meta.stale && meta.lastUpdate));
    }
  
    function setKpi(id, value, sub, tone) {
      const el = byId(id);
      el.textContent = value;
      el.className = 'kpi-value' + (tone ? ' ' + tone : '');
      byId(id + 'Sub').textContent = sub || '\u00a0';
    }
  
    function renderInsights() {
      const t = insights.totals;
      const p = insights.pace;
      const meta1 = currentMeta1();
      const todayLbl = byId('kpiTodayLabel');
      if (todayLbl && insights.today) {
        const now = new Date();
        const iso = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        todayLbl.textContent = insights.today === iso ? 'Faturado hoje' : ('Faturado em ' + insights.today.slice(8, 10) + '/' + insights.today.slice(5, 7));
      }
  
      setKpi('kpiToday', brl(t.today), plural(t.todayOrders, 'nota hoje', 'notas hoje'));
      setKpi('kpiOrders', nf0.format(t.orders), 'Ticket médio ' + brl(t.averageTicket));
      setKpi('kpiClients', nf0.format(t.clients), `${plural(t.newClients, 'novo', 'novos')} (1ª nota) · ${brlShort(t.newClientsValue)}`);
      setKpi('kpiReturns', brl(Math.abs(t.returns)),
        t.gross > 0 ? `${pct(Math.abs(t.returns) / t.gross * 100)} do faturamento bruto` : '', 'tone-red');
      setKpi('kpiMargin', t.mcPercentage != null ? pct(t.mcPercentage) : '--', brl(t.mc) + ' de margem');
  
      if (p.projection != null) {
        const sub = (meta1 > 0 ? `${pct(p.projection / meta1 * 100)} da Meta 1 · ` : '') + `média ${brlShort(p.dailyAverage)}/dia útil`;
        setKpi('kpiProjection', brl(p.projection), sub, toneFor(p.projection, meta1, insights.goals && insights.goals.meta2));
      } else {
        setKpi('kpiProjection', '--', 'Disponível após o 1º dia útil');
      }
  
      const missing = meta1 - t.net;
      if (meta1 > 0 && missing <= 0) {
        setKpi('kpiRequired', 'Meta batida! 🎉', `${brlShort(-missing)} acima da Meta 1`, 'tone-green');
      } else if (meta1 > 0 && p.businessDaysRemaining > 0) {
        setKpi('kpiRequired', brl(missing / p.businessDaysRemaining) + '/dia',
          `${plural(p.businessDaysRemaining, 'dia útil restante', 'dias úteis restantes')} · faltam ${brlShort(missing)}`, 'tone-amber');
      } else {
        setKpi('kpiRequired', '--', meta1 > 0 ? `Faltam ${brlShort(missing)} · sem dias úteis restantes` : 'Meta não disponível');
      }
  
      renderRegionals(insights.regionals);
      renderRanking(byId('repRanking'), insights.topReps, (name) => name);
      renderRanking(byId('ufRanking'), insights.topUfs, (uf) => (UF_NAMES[uf] ? `${uf} · ${UF_NAMES[uf]}` : uf));
      renderBilling(insights.orders || []);
      drawDailyChart();
    }
  
    function notaStatus(order) {
      if (!order.returns) return { label: 'Faturada', cls: 'ok' };
      if (order.gross > 0 && order.returns >= order.gross * 0.5) return { label: 'Devolvida', cls: 'bad' };
      return { label: 'Parcial', cls: 'warn' };
    }

    function nfCode(id) { return String(id || '').replace(/^PV-/, 'NF-'); }

    function whenLabel(iso) {
      if (!iso) return '';
      const [day, time] = String(iso).split('T');
      const parts = day.split('-');
      return (parts[2] || '') + '/' + (parts[1] || '') + (time ? ' ' + time.slice(0, 5) : '');
    }

    function groupBilling(list, keyFn) {
      const map = new Map();
      list.forEach(order => {
        const key = keyFn(order);
        if (!map.has(key)) map.set(key, { name: key, value: 0, gross: 0, returns: 0, margin: 0, orders: 0, last: '', regional: order.regional, uf: order.uf, newClient: false });
        const row = map.get(key);
        row.value += order.value || 0;
        row.gross += order.gross || 0;
        row.returns += order.returns || 0;
        row.margin += order.margin || 0;
        row.orders += 1;
        if (!row.last || order.date > row.last) row.last = order.date;
        if (order.newClient) row.newClient = true;
      });
      return [...map.values()].sort((a, b) => b.value - a.value);
    }

    function renderBilling(orders) {
      const list = Array.isArray(orders) ? orders : [];
      const net = list.reduce((s, o) => s + (o.value || 0), 0);
      const gross = list.reduce((s, o) => s + (o.gross || 0), 0);
      const returns = list.reduce((s, o) => s + (o.returns || 0), 0);
      const withReturn = list.filter(o => o.returns > 0).length;
      setKpi('notasCount', nf0.format(list.length), withReturn ? plural(withReturn, 'com devolução', 'com devolução') : 'sem devolução');
      setKpi('notasGross', brl(gross), list.length ? 'antes das devoluções' : '');
      setKpi('notasNet', brl(net), gross > 0 ? pct(net / gross * 100) + ' do bruto' : '');
      setKpi('notasReturns', brl(returns), gross > 0 ? pct(returns / gross * 100) + ' do bruto' : '', returns ? 'tone-red' : '');
      setKpi('notasTicket', list.length ? brl(net / list.length) : '--', 'líquido por nota');

      const hint = byId('notasHint');
      const shown = list.slice(0, 60);
      if (hint) hint.textContent = list.length > shown.length ? 'exibindo ' + shown.length + ' de ' + nf0.format(list.length) : (list.length ? nf0.format(list.length) + ' notas' : '');
      const body = byId('notasBody');
      if (body) {
        body.innerHTML = shown.length ? shown.map(o => {
          const st = notaStatus(o);
          const marginPct = o.value > 0 ? o.margin / o.value * 100 : 0;
          return `<tr>
            <td>${esc(nfCode(o.id))}</td>
            <td>${esc(whenLabel(o.date))}</td>
            <td class="client-cell" title="${esc(o.client)}">${esc(o.client)}</td>
            <td>${esc(o.uf)}</td>
            <td>${esc(o.channel)}</td>
            <td class="num">${brl(o.gross)}</td>
            <td class="num">${brl(o.value)}</td>
            <td class="num">${pct(marginPct)}</td>
            <td><span class="badge ${st.cls}">${st.label}</span></td>
          </tr>`;
        }).join('') : '<tr><td colspan="9">Nenhuma nota neste recorte</td></tr>';
      }

      const clients = groupBilling(list, o => o.client);
      const newcomers = clients.filter(c => c.newClient);
      const recurring = clients.length - newcomers.length;
      const top5 = clients.slice(0, 5).reduce((s, c) => s + c.value, 0);
      setKpi('cliCount', nf0.format(clients.length), plural(list.length, 'nota', 'notas'));
      setKpi('cliNew', nf0.format(newcomers.length), brlShort(newcomers.reduce((s, c) => s + c.value, 0)));
      setKpi('cliRecurring', nf0.format(Math.max(recurring, 0)), 'já compraram antes neste histórico');
      setKpi('cliTop5', net > 0 ? pct(top5 / net * 100) : '--', 'do faturamento líquido');
      setKpi('cliTopName', clients[0] ? clients[0].name : '--', clients[0] ? brlShort(clients[0].value) + ' · ' + pct(net > 0 ? clients[0].value / net * 100 : 0) : '');

      renderClientList(byId('clientList'), clients.slice(0, 12), net);
      renderClientList(byId('newClientList'), newcomers.slice(0, 8), newcomers.reduce((s, c) => s + c.value, 0) || 1);

      const palette = ['#38bdf8', '#34d399', '#fbbf24', '#a78bfa'];
      const names = (insights.channelNames && insights.channelNames.length)
        ? insights.channelNames
        : [...new Set(list.map(o => o.channel))];
      const channels = names.map(name => {
        const rows = list.filter(o => o.channel === name);
        const value = rows.reduce((s, o) => s + (o.value || 0), 0);
        return {
          name,
          value,
          orders: rows.length,
          returns: rows.reduce((s, o) => s + (o.returns || 0), 0),
          margin: rows.reduce((s, o) => s + (o.margin || 0), 0),
          ticket: rows.length ? value / rows.length : 0
        };
      });
      const maxChannel = Math.max(...channels.map(c => c.value), 1);
      const grid = byId('channelGrid');
      if (grid) {
        grid.innerHTML = channels.map(c => `
          <article class="kpi-card channel-card">
            <div class="kpi-label">${esc(c.name)}</div>
            <div class="kpi-value">${brl(c.value)}</div>
            <div class="channel-meta"><span>${net > 0 ? pct(c.value / net * 100) : '0%'} do líquido</span><span>${plural(c.orders, 'nota', 'notas')}</span></div>
            <div class="channel-meta"><span>Ticket ${brlShort(c.ticket)}</span><span>Margem ${c.value > 0 ? pct(c.margin / c.value * 100) : '0%'}</span></div>
          </article>`).join('');
      }
      const bars = byId('channelBars');
      if (bars) {
        bars.innerHTML = channels.map(c => `
          <div class="channel-row">
            <div class="channel-top"><b>${esc(c.name)}</b><span>${brl(c.value)} · ${net > 0 ? pct(c.value / net * 100) : '0%'}</span></div>
            <div class="channel-fill"><span style="width:${Math.max(0, c.value / maxChannel * 100)}%;background:${palette[channels.indexOf(c) % palette.length]}"></span></div>
            <div class="client-sub"><span>${plural(c.orders, 'nota', 'notas')} · devoluções ${brlShort(c.returns)}</span><span>margem ${brlShort(c.margin)}</span></div>
          </div>`).join('');
      }
    }

    function renderClientList(box, list, total) {
      if (!box) return;
      if (!list || !list.length) {
        box.innerHTML = '<div class="loading">Nenhum cliente neste recorte</div>';
        return;
      }
      const max = Math.max(...list.map(c => c.value), 1);
      box.innerHTML = list.map(c => `
        <div class="client-row">
          <div class="client-top">
            <span class="client-name" title="${esc(c.name)}">${esc(c.name)}</span>
            <span class="client-value">${brlShort(c.value)}</span>
          </div>
          <div class="client-track"><span style="width:${Math.max(0, c.value / max * 100)}%"></span></div>
          <div class="client-sub">
            <span>${plural(c.orders, 'nota', 'notas')} · ${esc(c.regional || '')}${c.uf ? ' · ' + esc(c.uf) : ''}</span>
            <span>${total > 0 ? pct(c.value / total * 100) : '0%'} · última ${esc(whenLabel(c.last).slice(0, 5))}</span>
          </div>
        </div>`).join('');
    }

    function renderRegionals(list) {
      const box = byId('regionalList');
      if (!list || !list.length) {
        box.innerHTML = '<div class="loading">Sem faturamento no recorte</div>';
        return;
      }
      box.innerHTML = list.map(r => {
        const hasGoal = r.meta1 > 0;
        const scale = Math.max(r.meta2 || 0, r.meta1 || 0, r.value, 1);
        const fill = Math.max(0, Math.min(100, r.value / scale * 100));
        const tone = toneFor(r.value, r.meta1, r.meta2);
        let status = plural(r.orders, 'nota', 'notas');
        if (hasGoal) {
          if (r.value < r.meta1) status = `faltam ${brlShort(r.meta1 - r.value)} p/ Meta 1`;
          else if (r.meta2 > 0 && r.value < r.meta2) status = `faltam ${brlShort(r.meta2 - r.value)} p/ Meta 2`;
          else status = 'Meta 2 batida! 🎉';
        }
        return `
          <div class="regional-row">
            <div class="regional-top">
              <span class="regional-name" title="${esc(r.name)}">${esc(r.name)}</span>
              <span class="regional-pct ${tone}">${hasGoal ? pct(r.value / r.meta1 * 100) : 'sem meta'}</span>
            </div>
            ${hasGoal ? `
            <div class="regional-bar">
              <div class="regional-fill ${tone}" style="width:${fill}%"></div>
              <div class="regional-marker" style="left:${r.meta1 / scale * 100}%" title="Meta 1: ${brl(r.meta1)}"></div>
            </div>` : '<div class="regional-bar empty"></div>'}
            <div class="regional-values">
              <span><b>${brl(r.value)}</b>${hasGoal ? ' de ' + brlShort(r.meta1) : ''}</span>
              <span>${status}</span>
            </div>
          </div>`;
      }).join('');
    }
  
    function renderRanking(box, list, label) {
      if (!list || !list.length) {
        box.innerHTML = '<div class="loading">Sem dados</div>';
        return;
      }
      const max = Math.max(...list.map(i => i.value), 1);
      box.innerHTML = list.map((item, i) => `
        <div class="ranking-row">
          <span class="ranking-pos pos-${i + 1}">${i + 1}</span>
          <div class="ranking-body">
            <div class="ranking-top">
              <span class="ranking-name" title="${esc(label(item.name))}">${esc(label(item.name))}</span>
              <span class="ranking-value">${brlShort(item.value)}</span>
            </div>
            <div class="ranking-bar"><div style="width:${Math.max(0, item.value / max * 100)}%"></div></div>
            <div class="ranking-sub">${plural(item.orders, 'nota', 'notas')}</div>
          </div>
        </div>`).join('');
    }
  
    // ===== Gráfico de evolução diária (canvas, sem bibliotecas) =====
    function drawDailyChart() {
      const wrap = byId('dailyChartWrap');
      const canvas = byId('dailyChart');
      if (!insights || currentView !== 'indicadores') return;
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w < 80 || h < 80) return;
  
      const dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
  
      const days = insights.daily;
      const todayDay = Number(insights.today.slice(8, 10));
      const meta1 = currentMeta1();
      const totalBusinessDays = insights.pace.businessDays || 1;
  
      let acc = 0;
      const cumulative = days.map(d => (d.day <= todayDay ? (acc += d.value) : null));
      let businessCount = 0;
      const pace = days.map(d => {
        if (d.businessDay) businessCount++;
        return meta1 > 0 ? meta1 * businessCount / totalBusinessDays : null;
      });
  
      const pad = { l: 62, r: 68, t: 18, b: 28 };
      const cw = w - pad.l - pad.r, ch = h - pad.t - pad.b;
      const maxBar = Math.max(...days.map(d => d.value), 1) * 1.15;
      const maxCum = Math.max(meta1, acc, 1) * 1.05;
      const slot = cw / days.length;
      const xAt = (i) => pad.l + slot * i + slot / 2;
      const yBar = (v) => pad.t + ch - (Math.max(v, 0) / maxBar) * ch;
      const yCum = (v) => pad.t + ch - (v / maxCum) * ch;
      const font = (size, weight) => `${weight || 400} ${size}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
  
      // Grade e eixos (esquerda: venda do dia, direita: acumulado)
      ctx.font = font(11);
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const y = pad.t + ch * i / 4;
        ctx.strokeStyle = 'rgba(148,163,184,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(w - pad.r, y); ctx.stroke();
        ctx.fillStyle = 'rgba(125,211,252,0.75)';
        ctx.textAlign = 'right';
        ctx.fillText(brlShort(maxBar * (1 - i / 4)).replace('R$ ', ''), pad.l - 10, y);
        ctx.fillStyle = 'rgba(110,231,183,0.75)';
        ctx.textAlign = 'left';
        ctx.fillText(brlShort(maxCum * (1 - i / 4)).replace('R$ ', ''), w - pad.r + 10, y);
      }
  
      // Barras (venda do dia)
      const barWidth = Math.max(2, slot * 0.58);
      days.forEach((d, i) => {
        if (d.value <= 0) return;
        const y = yBar(d.value);
        const x = xAt(i) - barWidth / 2;
        const height = pad.t + ch - y;
        const gradient = ctx.createLinearGradient(0, y, 0, pad.t + ch);
        if (d.day === todayDay) {
          gradient.addColorStop(0, '#fb923c');
          gradient.addColorStop(1, 'rgba(249,115,22,0.25)');
        } else if (d.businessDay) {
          gradient.addColorStop(0, 'rgba(56,189,248,0.75)');
          gradient.addColorStop(1, 'rgba(56,189,248,0.12)');
        } else {
          gradient.addColorStop(0, 'rgba(148,163,184,0.45)');
          gradient.addColorStop(1, 'rgba(148,163,184,0.08)');
        }
        ctx.fillStyle = gradient;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, barWidth, height, [Math.min(4, barWidth / 2), Math.min(4, barWidth / 2), 0, 0]);
        else ctx.rect(x, y, barWidth, height);
        ctx.fill();
      });
  
      // Ritmo linear da Meta 1 (por dia útil)
      if (meta1 > 0) {
        ctx.save();
        ctx.setLineDash([6, 6]);
        ctx.strokeStyle = 'rgba(167,139,250,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        pace.forEach((v, i) => (i === 0 ? ctx.moveTo(xAt(i), yCum(v)) : ctx.lineTo(xAt(i), yCum(v))));
        ctx.stroke();
        ctx.restore();
      }
  
      // Acumulado realizado (linha + área)
      const points = [];
      cumulative.forEach((v, i) => { if (v != null) points.push([xAt(i), yCum(v)]); });
      if (points.length) {
        const area = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
        area.addColorStop(0, 'rgba(52,211,153,0.28)');
        area.addColorStop(1, 'rgba(52,211,153,0)');
        ctx.fillStyle = area;
        ctx.beginPath();
        ctx.moveTo(points[0][0], pad.t + ch);
        points.forEach(([x, y]) => ctx.lineTo(x, y));
        ctx.lineTo(points[points.length - 1][0], pad.t + ch);
        ctx.closePath();
        ctx.fill();
  
        ctx.save();
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.shadowColor = 'rgba(52,211,153,0.6)';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.stroke();
        ctx.restore();
  
        const [lx, ly] = points[points.length - 1];
        ctx.fillStyle = '#0b1220';
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(lx, ly, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  
        const label = brlShort(acc);
        ctx.font = font(12, 600);
        const tw = ctx.measureText(label).width;
        const toLeft = lx > pad.l + cw * 0.7;
        const bx = toLeft ? lx - tw - 22 : lx + 10;
        const by = Math.max(pad.t, ly - 30);
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.strokeStyle = 'rgba(52,211,153,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, tw + 12, 22, 6); else ctx.rect(bx, by, tw + 12, 22);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ecfdf5';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 6, by + 11);
      }
  
      // Dias no eixo X (fins de semana esmaecidos)
      ctx.font = font(11);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const step = slot >= 20 ? 1 : slot >= 11 ? 2 : 5;
      days.forEach((d, i) => {
        if (d.day !== 1 && d.day % step !== 0 && d.day !== todayDay) return;
        ctx.fillStyle = d.day === todayDay ? '#fb923c' : (d.businessDay ? 'rgba(226,232,240,0.7)' : 'rgba(148,163,184,0.35)');
        ctx.fillText(String(d.day), xAt(i), pad.t + ch + 9);
      });
    }
  
    let resizeRaf = null;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(drawDailyChart);
    });
  
    // Desenha os anéis vazios enquanto os primeiros dados não chegam
    document.addEventListener('DOMContentLoaded', () => {
      if (typeof dashboard === 'undefined' || !dashboard) return;
      dashboard.drawChart();
      dashboard.drawTelevendasChart();
    });
  
    window.__lumiSync = syncFromMock;
    window.addEventListener('lumi-filters-changed', () => syncFromMock());
    if (typeof dashboard !== 'undefined' && dashboard && dashboard.prepare) dashboard.prepare();

    renderRotateButton();
    scheduleRotation();
    loadInsights();
  })();
  