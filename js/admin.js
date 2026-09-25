/* =========================================================
   UNA MÁS — Tableau de bord gérant (interface)
   ========================================================= */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const todayISO = () => iso(new Date());
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
  const fmtLong = s => cap(parseISO(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
  const fmtShort = s => cap(parseISO(s).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, ""));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const initials = r => `${(r.firstName || "?")[0]}${(r.lastName || "")[0] || ""}`.toUpperCase();
  const fullName = r => `${r.firstName} ${r.lastName}`.trim();
  const CFG = window.ADMIN_CONFIG, STATUS = window.STATUS, SOURCES = window.SOURCES;
  const totalCap = Object.values(CFG.capacity).reduce((a, b) => a + b, 0);

  const ui = { view: "today", day: todayISO(), month: todayISO().slice(0, 7), agendaDay: todayISO(), period: "upcoming", status: "", search: "", clientSort: "visits", clientSearch: "", statsDays: 30 };

  function toast(msg, ms = 2400) { const el = $("#toast"); el.textContent = msg; el.classList.add("is-visible"); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("is-visible"), ms); }
  function confirmDialog(title, text, yesLabel = "Confirmer") {
    return new Promise(res => { const d = $("#confirmDialog"); $("#cdTitle").textContent = title; $("#cdText").textContent = text; $("#cdYes").textContent = yesLabel; d.returnValue = ""; d.onclose = () => res(d.returnValue === "yes"); d.showModal(); });
  }

  /* ================= Auth ================= */
  function initAuth() {
    const demo = !CFG.supabase.url;
    $("#loginDemo").hidden = !demo;
    if (demo) { $("#loginEmail").disabled = true; $("#loginPass").disabled = true; $("#loginBtn").disabled = true; }
    $("#demoBtn").addEventListener("click", () => { sessionStorage.setItem("unamas.admin.session", "demo"); enter(); });
    $("#loginForm").addEventListener("submit", e => { e.preventDefault(); if (demo) return; $("#loginErr").hidden = false; $("#loginErr").textContent = "Connexion Supabase à brancher (voir README)."; });
    $("#logoutBtn").addEventListener("click", () => { sessionStorage.removeItem("unamas.admin.session"); location.hash = ""; location.reload(); });
    if (sessionStorage.getItem("unamas.admin.session")) enter();
  }
  function enter() {
    window.Store.load();
    $("#login").hidden = true;
    $("#shell").hidden = false;
    $("#demoBanner").hidden = !window.Store.isDemo();
    const v = (location.hash || "#today").slice(1);
    showView(["today", "agenda", "reservations", "clients", "stats"].includes(v) ? v : "today");
  }

  /* ================= Navigation ================= */
  function showView(name) {
    ui.view = name;
    $$(".view").forEach(v => v.classList.toggle("is-active", v.dataset.view === name));
    $$("[data-view]").forEach(a => { if (a.tagName === "A") a.classList.toggle("is-active", a.dataset.view === name); });
    history.replaceState(null, "", "#" + name);
    window.scrollTo({ top: 0 });
    render[name]();
  }

  /* ================= Rendus partagés ================= */
  const srcPill = r => `<span class="pill pill--src">${SOURCES[r.source] || r.source}</span>`;
  const statusPill = r => `<span class="pill ${STATUS[r.status].cls}">${STATUS[r.status].label}</span>`;

  function resaCard(r, opts = {}) {
    const actions = [];
    if (opts.actions !== false) {
      if (r.status === "pending") actions.push(`<button type="button" class="qa qa--confirm" data-qa="confirmed" data-id="${r.id}">Confirmer</button>`);
      if (r.status === "pending" || r.status === "confirmed") { actions.push(`<button type="button" class="qa qa--seat" data-qa="seated" data-id="${r.id}">Installer</button>`); actions.push(`<button type="button" class="qa qa--noshow" data-qa="noshow" data-id="${r.id}">No-show</button>`); }
      if (r.status === "seated") actions.push(`<button type="button" class="qa" data-qa="confirmed" data-id="${r.id}">Annuler l'installation</button>`);
      if (r.status !== "cancelled" && r.status !== "seated") actions.push(`<button type="button" class="qa" data-qa="cancelled" data-id="${r.id}">Annuler</button>`);
    }
    return `<div class="resa" role="button" tabindex="0" data-open="${r.id}">
      <div class="resa__main">
        <div class="resa__name">${esc(fullName(r))} ${statusPill(r)}</div>
        <div class="resa__meta">
          ${opts.showDate ? `<span><svg viewBox="0 0 24 24"><use href="#i-cal"/></svg>${fmtShort(r.date)}</span>` : ""}
          <span><svg viewBox="0 0 24 24"><use href="#i-clock"/></svg>${r.time}</span>
          <span><svg viewBox="0 0 24 24"><use href="#i-table"/></svg>${esc(r.pref)}</span>
          <span><svg viewBox="0 0 24 24"><use href="#i-phone"/></svg>${esc(r.phone)}</span>
          ${srcPill(r)}
        </div>
        ${r.note ? `<div class="resa__note">${esc(r.note)}</div>` : ""}
      </div>
      <div class="resa__side"><div class="resa__guests">${r.guests}<small>pers.</small></div></div>
      ${actions.length ? `<div class="resa__actions">${actions.join("")}</div>` : ""}
    </div>`;
  }

  function groupedByTime(list) {
    if (!list.length) return `<div class="empty"><strong>Aucune réservation</strong>Le service est libre pour l'instant.</div>`;
    const groups = new Map();
    list.forEach(r => { if (!groups.has(r.time)) groups.set(r.time, []); groups.get(r.time).push(r); });
    return Array.from(groups.entries()).map(([t, rs]) => {
      const g = rs.filter(r => r.status !== "cancelled" && r.status !== "noshow").reduce((a, r) => a + r.guests, 0);
      return `<div class="tl-group"><div class="tl-group__time">${t}<small>${g} couv.</small></div><div class="tl-group__items">${rs.map(r => resaCard(r)).join("")}</div></div>`;
    }).join("");
  }

  function kpiTile(label, value, sub, cls = "") { return `<div class="kpi"><div class="kpi__label">${label}</div><div class="kpi__value">${value}</div>${sub ? `<div class="kpi__sub ${cls}">${sub}</div>` : ""}</div>`; }

  function occupancyBlock(date) {
    const cols = CFG.slots.map(s => {
      const inn = window.Store.occupancy(date, s, "Intérieur"), ter = window.Store.occupancy(date, s, "Terrasse");
      const tot = inn + ter, full = tot >= totalCap * .9;
      const h = v => Math.max(0, Math.round(v / totalCap * 100));
      return `<div class="occ__col${full ? " is-full" : ""}" tabindex="0" data-tip="${s} · ${tot}/${totalCap} couverts (terrasse ${ter}, intérieur ${inn})"><div class="occ__bar" style="height:${h(ter)}%"></div><div class="occ__bar occ__bar--in" style="height:${h(inn)}%"></div></div>`;
    }).join("");
    const peak = Math.max(...CFG.slots.map(s => window.Store.occupancy(date, s)));
    return `<div class="occ__head"><strong>Occupation par créneau</strong><span class="occ__legend"><span><i style="background:var(--sage-300,#B9CBB1)"></i>Terrasse</span><span><i style="background:var(--sage-600)"></i>Intérieur</span><span>Pic ${peak}/${totalCap}</span></span></div>
      <div class="occ__grid">${cols}</div><div class="occ__labels">${CFG.slots.map(s => `<span>${s.replace(":00", "h").replace(":30", "h30")}</span>`).join("")}</div>`;
  }

  /* ================= Vues ================= */
  const render = {
    today() {
      const d = ui.day, list = window.Store.byDate(d);
      $("#todayTitle").textContent = d === todayISO() ? "Aujourd'hui" : fmtLong(d);
      const active = list.filter(r => r.status !== "cancelled");
      const covers = active.filter(r => r.status !== "noshow").reduce((a, r) => a + r.guests, 0);
      const seated = list.filter(r => r.status === "seated").length, pending = list.filter(r => r.status === "pending").length, noshow = list.filter(r => r.status === "noshow").length;
      const y = window.Store.byDate(addDays(d, -7)).filter(r => r.status !== "cancelled" && r.status !== "noshow").reduce((a, r) => a + r.guests, 0);
      const diff = y ? Math.round((covers - y) / y * 100) : null;
      $("#todayKpis").innerHTML = kpiTile("Réservations", active.length, `${list.length - active.length} annulée${list.length - active.length > 1 ? "s" : ""}`)
        + kpiTile("Couverts", covers, diff == null ? "" : `${diff >= 0 ? "+" : ""}${diff} % vs même jour S-1`, diff >= 0 ? "is-up" : "is-down")
        + kpiTile("Installées", seated, `${active.length - seated - noshow} à venir`)
        + kpiTile("À confirmer", pending, noshow ? `${noshow} no-show` : "", noshow ? "is-down" : "");
      $("#todayOcc").innerHTML = occupancyBlock(d);
      $("#todayList").innerHTML = groupedByTime(list);
    },

    agenda() {
      const [y, m] = ui.month.split("-").map(Number);
      const first = new Date(y, m - 1, 1), start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
      $("#agendaTitle").textContent = cap(first.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }));
      let cells = "";
      for (let i = 0; i < 42; i++) {
        const d = new Date(start); d.setDate(start.getDate() + i); const s = iso(d);
        const rs = window.Store.byDate(s).filter(r => r.status !== "cancelled");
        const covers = rs.reduce((a, r) => a + r.guests, 0);
        const peak = Math.max(0, ...CFG.slots.map(sl => window.Store.occupancy(s, sl)));
        cells += `<button type="button" class="cal__day${d.getMonth() !== m - 1 ? " is-out" : ""}${s === todayISO() ? " is-today" : ""}${s === ui.agendaDay ? " is-selected" : ""}" data-date="${s}" aria-label="${fmtLong(s)}, ${rs.length} réservations">
          <span class="cal__num">${d.getDate()}</span><span class="cal__count">${rs.length ? rs.length + " · " + covers + "c" : "—"}</span><span class="cal__fill"><i style="width:${Math.min(100, Math.round(peak / totalCap * 100))}%"></i></span></button>`;
      }
      $("#cal").innerHTML = `<div class="cal__dow">${["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(x => `<span>${x}</span>`).join("")}</div><div class="cal__grid">${cells}</div>`;
      const list = window.Store.byDate(ui.agendaDay);
      $("#agendaDayTitle").textContent = fmtLong(ui.agendaDay);
      $("#agendaOcc").innerHTML = occupancyBlock(ui.agendaDay);
      $("#agendaList").innerHTML = groupedByTime(list);
    },

    reservations() {
      const q = ui.search.trim().toLowerCase(), qd = q.replace(/\D/g, ""), t = todayISO();
      let list = window.Store.all();
      if (ui.period === "upcoming") list = list.filter(r => r.date >= t); else if (ui.period === "past") list = list.filter(r => r.date < t);
      if (ui.status) list = list.filter(r => r.status === ui.status);
      if (q) list = list.filter(r => fullName(r).toLowerCase().includes(q) || (r.ref || "").toLowerCase().includes(q) || (qd.length >= 3 && r.phone.replace(/\D/g, "").includes(qd)));
      list.sort((a, b) => ui.period === "past" ? (b.date + b.time).localeCompare(a.date + a.time) : (a.date + a.time).localeCompare(b.date + b.time));
      const covers = list.filter(r => r.status !== "cancelled" && r.status !== "noshow").reduce((a, r) => a + r.guests, 0);
      $("#resaCount").textContent = `${list.length} réservation${list.length > 1 ? "s" : ""} · ${covers} couverts`;
      const shown = list.slice(0, 200);
      let html = "", last = "";
      shown.forEach(r => { if (r.date !== last) { html += `<div class="tl-date">${fmtLong(r.date)}${r.date === t ? " · aujourd'hui" : ""}</div>`; last = r.date; } html += resaCard(r); });
      if (!shown.length) html = `<div class="empty"><strong>Rien à afficher</strong>Modifiez la recherche ou les filtres.</div>`;
      if (list.length > shown.length) html += `<p class="muted" style="text-align:center;margin-top:12px">Affichage des 200 premières. Affinez la recherche.</p>`;
      $("#resaList").innerHTML = html;
    },

    clients() {
      const q = ui.clientSearch.trim().toLowerCase(), qd = q.replace(/\D/g, "");
      let list = window.Store.customers();
      if (q) list = list.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (qd.length >= 3 && c.phone.replace(/\D/g, "").includes(qd)));
      if (ui.clientSort === "visits") list.sort((a, b) => b.visits - a.visits || (b.last || "").localeCompare(a.last || ""));
      else if (ui.clientSort === "recent") list.sort((a, b) => (b.history[0].date + b.history[0].time).localeCompare(a.history[0].date + a.history[0].time));
      else list.sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"));
      $("#clientCount").textContent = `${list.length} client${list.length > 1 ? "s" : ""} · ${list.filter(c => c.visits >= 3).length} habitués`;
      $("#clientList").innerHTML = list.length ? list.slice(0, 300).map(clientCard).join("") : `<div class="empty"><strong>Aucun client</strong>Essayez un autre nom.</div>`;
    },

    stats() {
      const days = ui.statsDays, t = todayISO(), from = addDays(t, -(days - 1)), pfrom = addDays(from, -days), pto = addDays(from, -1);
      const cur = window.Store.range(from, t), prev = window.Store.range(pfrom, pto);
      const served = l => l.filter(r => r.status === "seated");
      const covers = l => served(l).reduce((a, r) => a + r.guests, 0);
      const pct = (a, b) => b ? Math.round((a - b) / b * 100) : null;
      const delta = (a, b, suffix = "") => { const p = pct(a, b); return p == null ? "" : `${p >= 0 ? "+" : ""}${p} %${suffix} vs période précédente`; };
      const cls = (a, b, inverse = false) => { const p = pct(a, b); if (p == null) return ""; return (p >= 0) !== inverse ? "is-up" : "is-down"; };
      const noshowRate = l => { const base = l.filter(r => ["seated", "noshow"].includes(r.status)).length; return base ? Math.round(l.filter(r => r.status === "noshow").length / base * 100) : 0; };
      const avg = l => served(l).length ? (covers(l) / served(l).length).toFixed(1).replace(".", ",") : "0";
      $("#statsKpis").innerHTML =
        kpiTile("Couverts servis", covers(cur), delta(covers(cur), covers(prev)), cls(covers(cur), covers(prev)))
        + kpiTile("Réservations", cur.filter(r => r.status !== "cancelled").length, delta(cur.filter(r => r.status !== "cancelled").length, prev.filter(r => r.status !== "cancelled").length), cls(cur.filter(r => r.status !== "cancelled").length, prev.filter(r => r.status !== "cancelled").length))
        + kpiTile("Taille moyenne", avg(cur), "personnes par table")
        + kpiTile("Taux de no-show", noshowRate(cur) + " %", `${noshowRate(prev)} % période précédente`, noshowRate(cur) <= noshowRate(prev) ? "is-up" : "is-down");

      // Couverts par jour (barres, une série)
      const byDay = []; for (let i = 0; i < days; i++) { const d = addDays(from, i); byDay.push({ d, v: covers(cur.filter(r => r.date === d)) }); }
      const W = 640, H = 180, P = { l: 28, r: 6, t: 14, b: 26 }, max = Math.max(10, ...byDay.map(x => x.v));
      const bw = (W - P.l - P.r) / byDay.length, gap = Math.min(3, bw * .25);
      const yTicks = [0, Math.round(max / 2), max];
      const barsSvg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Couverts servis par jour">
        ${yTicks.map(v => { const y = P.t + (H - P.t - P.b) * (1 - v / max); return `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text class="axis" x="${P.l - 6}" y="${y + 3}" text-anchor="end">${v}</text>`; }).join("")}
        ${byDay.map((x, i) => { const h = (H - P.t - P.b) * x.v / max, X = P.l + i * bw + gap / 2, Y = H - P.b - h; const dow = parseISO(x.d).getDay(); return `<g><rect class="bar${x.v ? "" : " bar--muted"}" x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="3"><title>${fmtLong(x.d)} · ${x.v} couverts</title></rect>${(days <= 7 || (days <= 30 && dow === 1) || (days > 30 && parseISO(x.d).getDate() === 1)) ? `<text class="axis" x="${(X + (bw - gap) / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${days <= 7 ? fmtShort(x.d).split(" ")[0] : parseISO(x.d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "")}</text>` : ""}</g>`; }).join("")}
      </svg>`;

      // Créneaux
      const slotCov = CFG.slots.map(s => ({ label: s, v: covers(cur.filter(r => r.time === s)) }));
      const hbars = (rows, colorClassFn) => { const m = Math.max(1, ...rows.map(r => r.v)); return `<div class="hbars">${rows.map((r, i) => `<div class="hbar ${colorClassFn ? colorClassFn(r, i) : ""}"><span class="hbar__label">${esc(r.label)}</span><span class="hbar__track"><span class="hbar__fill" style="width:${Math.round(r.v / m * 100)}%"></span></span><span class="hbar__val">${r.v}${r.suffix ? `<small>${r.suffix}</small>` : ""}</span></div>`).join("")}</div>`; };

      // Jours de la semaine
      const dows = ["Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi","Dimanche"];
      const dowCov = dows.map((label, i) => ({ label, v: covers(cur.filter(r => (parseISO(r.date).getDay() + 6) % 7 === i)) }));

      // Canal d'origine (catégoriel, ordre fixe, une couleur par entité)
      const srcOrder = ["web", "phone", "whatsapp", "walkin"];
      const srcRows = srcOrder.map(k => ({ key: k, label: SOURCES[k], v: cur.filter(r => r.status !== "cancelled" && r.source === k).length }));
      const srcTotal = srcRows.reduce((a, r) => a + r.v, 0) || 1;

      // Zone
      const zoneRows = ["Terrasse", "Intérieur", "Peu importe"].map(z => ({ label: z, v: cur.filter(r => r.status !== "cancelled" && r.pref === z).length }));

      // Top clients
      const top = window.Store.customers().map(c => ({ ...c, pv: c.history.filter(r => r.status === "seated" && r.date >= from && r.date <= t).length })).filter(c => c.pv > 0).sort((a, b) => b.pv - a.pv).slice(0, 5);

      $("#charts").innerHTML = `
        <div class="chart chart--wide"><div class="chart__head"><span class="chart__title">Couverts servis par jour</span><span class="chart__sub">${fmtShort(from)} → ${fmtShort(t)}</span></div>${barsSvg}</div>
        <div class="chart"><div class="chart__head"><span class="chart__title">Couverts par créneau</span><span class="chart__sub">heure d'arrivée</span></div>${hbars(slotCov)}</div>
        <div class="chart"><div class="chart__head"><span class="chart__title">Couverts par jour de la semaine</span></div>${hbars(dowCov)}</div>
        <div class="chart"><div class="chart__head"><span class="chart__title">Canal de réservation</span><span class="chart__sub">${srcTotal} réservations</span></div>${hbars(srcRows.map(r => ({ ...r, suffix: `${Math.round(r.v / srcTotal * 100)} %` })))}</div>
        <div class="chart"><div class="chart__head"><span class="chart__title">Placement demandé</span></div>${hbars(zoneRows)}</div>
        <div class="chart chart--wide"><div class="chart__head"><span class="chart__title">Clients les plus fidèles sur la période</span><span class="chart__sub">visites installées</span></div>
          ${top.length ? `<div class="toplist">${top.map(c => `<div class="client" role="button" tabindex="0" data-client="${c.key}"><span class="avatar">${initials(c)}</span><div><div class="client__name">${esc(fullName(c))}</div><div class="client__meta">${esc(c.phone)} · ${c.visits} visite${c.visits > 1 ? "s" : ""} au total</div></div><div class="client__visits"><strong>${c.pv}</strong><span>sur la période</span></div></div>`).join("")}</div>` : `<div class="empty">Pas encore de visite sur la période.</div>`}
        </div>`;
    }
  };

  function clientCard(c) {
    const tags = [...c.autoTags, ...c.tags];
    return `<div class="client" role="button" tabindex="0" data-client="${c.key}">
      <span class="avatar">${initials(c)}</span>
      <div><div class="client__name">${esc(fullName(c))}${tags.map(t => `<span class="pill pill--tag">${esc(t)}</span>`).join("")}</div>
      <div class="client__meta">${esc(c.phone)}${c.last ? ` · dernière visite ${fmtShort(c.last)}` : c.upcoming ? " · première visite à venir" : ""}${c.noshows ? ` · ${c.noshows} no-show` : ""}</div></div>
      <div class="client__visits"><strong>${c.visits}</strong><span>visite${c.visits > 1 ? "s" : ""}</span></div>
    </div>`;
  }

  /* ================= Fiche réservation ================= */
  function openResa(id) {
    const r = id ? window.Store.get(id) : null;
    const dlg = $("#resaSheet");
    $("#rsId").value = r ? r.id : "";
    $("#rsRef").textContent = r ? `${r.ref} · ${SOURCES[r.source] || ""}` : "Nouvelle réservation";
    $("#rsName").textContent = r ? fullName(r) : "Saisie manuelle";
    $("#rsTime").innerHTML = CFG.slots.map(s => `<option>${s}</option>`).join("");
    $("#rsDate").value = r ? r.date : (ui.view === "agenda" ? ui.agendaDay : ui.day);
    $("#rsTime").value = r ? r.time : "20:00";
    $("#rsGuests").value = r ? r.guests : 2;
    $("#rsPref").value = r ? r.pref : "Terrasse";
    $("#rsFirst").value = r ? r.firstName : ""; $("#rsLast").value = r ? r.lastName : "";
    $("#rsPhone").value = r ? r.phone : ""; $("#rsEmail").value = r ? r.email || "" : "";
    $("#rsSource").value = r ? r.source : "phone"; $("#rsNote").value = r ? r.note || "" : "";
    $("#rsMeta").textContent = r ? `Créée le ${new Date(r.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}` : "";
    $("#rsDelete").hidden = !r; $("#rsClient").hidden = !r;
    const status = r ? r.status : "confirmed";
    $("#rsStatusRow").innerHTML = Object.entries(STATUS).map(([k, v]) => `<button type="button" class="chip ${v.cls}${k === status ? " is-active" : ""}" data-status="${k}">${v.label}</button>`).join("");
    $$("#rsStatusRow .chip").forEach(b => b.addEventListener("click", () => { $$("#rsStatusRow .chip").forEach(x => x.classList.toggle("is-active", x === b)); }));
    if (!dlg.open) dlg.showModal();
    setTimeout(() => { if (!r) $("#rsFirst").focus(); }, 200);
  }

  function saveResa(e) {
    e.preventDefault();
    const f = $("#rsForm");
    if (!f.reportValidity()) return;
    const data = { id: $("#rsId").value || undefined, date: $("#rsDate").value, time: $("#rsTime").value, guests: Number($("#rsGuests").value), pref: $("#rsPref").value,
      firstName: $("#rsFirst").value.trim(), lastName: $("#rsLast").value.trim(), phone: $("#rsPhone").value.trim(), email: $("#rsEmail").value.trim(), source: $("#rsSource").value, note: $("#rsNote").value.trim(),
      status: $("#rsStatusRow .chip.is-active")?.dataset.status || "confirmed" };
    const saved = window.Store.upsert(data);
    $("#resaSheet").close();
    toast(data.id ? "Réservation mise à jour." : `Réservation ${saved.ref} créée.`);
    render[ui.view]();
  }

  /* ================= Fiche client ================= */
  const TAGS = ["VIP", "Allergie", "Anniversaire", "Groupe", "À surveiller"];
  let currentClient = null;
  function openClient(key) {
    const c = window.Store.customer(key); if (!c) return;
    currentClient = c;
    $("#csAvatar").textContent = initials(c);
    $("#csName").textContent = fullName(c);
    $("#csContact").innerHTML = [c.phone, c.email].filter(Boolean).map(esc).join("<br>");
    $("#csCall").href = `tel:${c.phone.replace(/\s/g, "")}`;
    $("#csKpis").innerHTML = kpiTile("Visites", c.visits) + kpiTile("Couverts", c.guestsTotal) + kpiTile("No-show", c.noshows) + kpiTile("À venir", c.upcoming);
    $("#csTags").innerHTML = [...c.autoTags.map(t => `<span class="pill pill--tag">${t}</span>`), ...TAGS.map(t => `<button type="button" class="tag-toggle${c.tags.includes(t) ? " is-on" : ""}" data-tag="${t}">${t}</button>`)].join("");
    $$("#csTags .tag-toggle").forEach(b => b.addEventListener("click", () => b.classList.toggle("is-on")));
    $("#csNotes").value = c.notes || "";
    $("#csHistory").innerHTML = c.history.slice(0, 30).map(r => `<button type="button" class="hist" data-open="${r.id}"><span><strong>${fmtShort(r.date)}</strong> · ${r.time} · ${r.guests} pers. <small>· ${esc(r.pref)}</small></span>${statusPill(r)}<small>${SOURCES[r.source] || ""}</small></button>`).join("");
    const dlg = $("#clientSheet"); if (!dlg.open) dlg.showModal();
  }
  function saveClient() {
    if (!currentClient) return;
    window.Store.saveCustomer(currentClient.key, { notes: $("#csNotes").value.trim(), tags: $$("#csTags .tag-toggle.is-on").map(b => b.dataset.tag) });
    $("#clientSheet").close(); toast("Fiche client enregistrée."); render[ui.view]();
  }

  /* ================= Événements ================= */
  function bind() {
    $$("[data-view]").forEach(a => { if (a.tagName === "A") a.addEventListener("click", e => { e.preventDefault(); showView(a.dataset.view); }); });
    $$("[data-new-resa]").forEach(b => b.addEventListener("click", () => openResa(null)));
    $$("[data-day]").forEach(b => b.addEventListener("click", () => { const n = Number(b.dataset.day); ui.day = n === 0 ? todayISO() : addDays(ui.day, n); render.today(); }));
    $$("[data-month]").forEach(b => b.addEventListener("click", () => { const n = Number(b.dataset.month); if (n === 0) { ui.month = todayISO().slice(0, 7); ui.agendaDay = todayISO(); } else { const [y, m] = ui.month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); ui.month = iso(d).slice(0, 7); } render.agenda(); }));
    $("#cal").addEventListener("click", e => { const b = e.target.closest(".cal__day"); if (!b) return; ui.agendaDay = b.dataset.date; if (b.dataset.date.slice(0, 7) !== ui.month) ui.month = b.dataset.date.slice(0, 7); render.agenda(); });

    $("#resaSearch").addEventListener("input", e => { ui.search = e.target.value; render.reservations(); });
    $("#resaPeriod").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; ui.period = b.dataset.period; $$("#resaPeriod .chip").forEach(x => x.classList.toggle("is-active", x === b)); render.reservations(); });
    $("#resaStatus").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; ui.status = b.dataset.status; $$("#resaStatus .chip").forEach(x => x.classList.toggle("is-active", x === b)); render.reservations(); });
    $("#clientSearch").addEventListener("input", e => { ui.clientSearch = e.target.value; render.clients(); });
    $("#clientSort").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; ui.clientSort = b.dataset.sort; $$("#clientSort .chip").forEach(x => x.classList.toggle("is-active", x === b)); render.clients(); });
    $("#statsPeriod").addEventListener("click", e => { const b = e.target.closest(".chip"); if (!b) return; ui.statsDays = Number(b.dataset.days); $$("#statsPeriod .chip").forEach(x => x.classList.toggle("is-active", x === b)); render.stats(); });

    // Délégation : actions rapides, ouverture des fiches
    document.addEventListener("click", async e => {
      const qa = e.target.closest("[data-qa]");
      if (qa) {
        e.stopPropagation();
        const status = qa.dataset.qa, id = qa.dataset.id;
        if (status === "cancelled" && !(await confirmDialog("Annuler cette réservation ?", "Le client ne sera pas prévenu automatiquement.", "Oui, annuler"))) return;
        window.Store.setStatus(id, status); toast(`Statut : ${STATUS[status].label}.`); render[ui.view](); return;
      }
      const open = e.target.closest("[data-open]");
      if (open) { if ($("#clientSheet").open) $("#clientSheet").close(); openResa(open.dataset.open); return; }
      const cl = e.target.closest("[data-client]");
      if (cl) { openClient(cl.dataset.client); }
    });
    document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-open], [data-client]")) e.target.click(); });

    $("#rsForm").addEventListener("submit", saveResa);
    $("#rsClient").addEventListener("click", () => { const r = window.Store.get($("#rsId").value); if (!r) return; $("#resaSheet").close(); openClient(window.Store.customerKey(r)); });
    $("#rsDelete").addEventListener("click", async () => { const id = $("#rsId").value; if (!id) return; if (!(await confirmDialog("Supprimer définitivement ?", "Préférez « Annulée » pour garder l'historique du client.", "Supprimer"))) return; window.Store.remove(id); $("#resaSheet").close(); toast("Réservation supprimée."); render[ui.view](); });
    $("#csSave").addEventListener("click", saveClient);
    $$("[data-close]").forEach(b => b.addEventListener("click", () => b.closest("dialog").close()));
    $$("dialog.sheet").forEach(d => d.addEventListener("click", e => { if (e.target === d) d.close(); }));
    $("#resetDemo").addEventListener("click", async () => { if (!(await confirmDialog("Réinitialiser la démo ?", "Toutes les modifications locales seront perdues.", "Réinitialiser"))) return; window.Store.resetDemo(); toast("Données de démonstration régénérées."); render[ui.view](); });
    window.addEventListener("hashchange", () => { const v = location.hash.slice(1); if (render[v] && v !== ui.view) showView(v); });
  }

  document.addEventListener("DOMContentLoaded", () => { bind(); initAuth(); });
})();
