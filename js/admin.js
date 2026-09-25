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

  const savedRange = Number(localStorage.getItem("unamas.admin.range")) || (window.matchMedia("(max-width: 760px)").matches ? 1 : 7);
  const ui = { view: "planning", anchor: todayISO(), range: savedRange, period: "upcoming", status: "", search: "", clientSort: "visits", clientSearch: "", statsDays: 30 };

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
    showView(["planning", "reservations", "clients", "stats"].includes(v) ? v : "planning");
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

  function kpiTile(label, value, sub, cls = "") { return `<div class="kpi"><div class="kpi__label">${label}</div><div class="kpi__value">${value}</div>${sub ? `<div class="kpi__sub ${cls}">${sub}</div>` : ""}</div>`; }

  /* ================= Vues ================= */
  const render = {
    planning() {
      const n = ui.range;
      let start = ui.anchor;
      if (n === 7) { const d = parseISO(start); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); start = iso(d); }
      const days = Array.from({ length: n }, (_, i) => addDays(start, i));
      const end = days[n - 1], t = todayISO();
      const dStart = parseISO(start), dEnd = parseISO(end);
      $("#planTitle").textContent = n === 1 ? fmtLong(start) : `${dStart.getDate()}${dStart.getMonth() !== dEnd.getMonth() ? " " + dStart.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "") : ""} – ${dEnd.getDate()} ${cap(dEnd.toLocaleDateString("fr-FR", { month: "long" }))}`;
      const all = days.map(d => window.Store.byDate(d).filter(r => r.status !== "cancelled"));
      const totalRes = all.reduce((a, l) => a + l.length, 0), totalCov = all.reduce((a, l) => a + l.filter(r => r.status !== "noshow").reduce((x, r) => x + r.guests, 0), 0);
      $("#planEyebrow").textContent = n === 1 ? (start === t ? "Aujourd'hui" : start < t ? "Service passé" : "Service à venir") : `${totalRes} réservation${totalRes > 1 ? "s" : ""} · ${totalCov} couverts`;
      $$("#planRange .chip").forEach(c => c.classList.toggle("is-active", Number(c.dataset.range) === n));

      const head = `<th class="plan__corner" scope="col"></th>` + days.map((d, i) => {
        const l = all[i], cov = l.filter(r => r.status !== "noshow").reduce((a, r) => a + r.guests, 0);
        const peak = Math.max(0, ...CFG.slots.map(sl => window.Store.occupancy(d, sl)));
        const dd = parseISO(d);
        return `<th scope="col" class="plan__day${d === t ? " is-today" : ""}${d < t ? " is-past" : ""}">
          <span class="plan__dow">${dd.toLocaleDateString("fr-FR", { weekday: n === 1 ? "long" : "short" }).replace(".", "")}</span>
          <span class="plan__num">${dd.getDate()}</span>
          <span class="plan__sum">${l.length ? `${l.length} résa${l.length > 1 ? "s" : ""} · ${cov} couv.` : "libre"}</span>
          <span class="plan__fill" title="Pic d'occupation ${peak}/${totalCap} couverts"><i style="width:${Math.min(100, Math.round(peak / totalCap * 100))}%"></i></span>
        </th>`;
      }).join("");

      const rows = CFG.slots.map(slot => {
        const cells = days.map((d, i) => {
          const rs = all[i].filter(r => r.time === slot).sort((a, b) => b.guests - a.guests);
          const chips = rs.map(r => `<button type="button" class="plan__chip ${STATUS[r.status].cls}" data-open="${r.id}" title="${esc(fullName(r))} · ${r.guests} pers. · ${esc(r.pref)} · ${STATUS[r.status].label}${r.note ? " · " + esc(r.note) : ""}">
              <span class="plan__chip-name">${esc(fullName(r))}</span><span class="plan__chip-g">${r.guests}</span>${r.note ? `<span class="plan__chip-note" aria-label="Note"></span>` : ""}
            </button>`).join("");
          return `<td class="plan__cell${d === t ? " is-today" : ""}${d < t ? " is-past" : ""}" data-date="${d}" data-time="${slot}">${chips}</td>`;
        }).join("");
        const rowCov = all.reduce((a, l) => a + l.filter(r => r.time === slot && r.status !== "noshow").reduce((x, r) => x + r.guests, 0), 0);
        return `<tr><th scope="row" class="plan__time">${slot}${n > 1 && rowCov ? `<small>${rowCov}</small>` : ""}</th>${cells}</tr>`;
      }).join("");

      $("#plan").innerHTML = `<table class="plan__table" style="--cols:${n}"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table>`;
      $("#plan").classList.toggle("plan--day", n === 1);
      const plan = $("#plan"); plan.scrollLeft = 0;
      if (n > 1 && days.includes(t)) { const col = $(".plan__day.is-today"), corner = $(".plan__corner"); if (col && plan.scrollWidth > plan.clientWidth) plan.scrollLeft = Math.max(0, col.offsetLeft - corner.offsetWidth); }
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
      const delta = (a, b) => { const p = pct(a, b); return p == null ? "" : `${p >= 0 ? "+" : ""}${p} % vs ${days} jours précédents`; };
      const cls = (a, b, inverse = false) => { const p = pct(a, b); if (p == null) return ""; return (p >= 0) !== inverse ? "is-up" : "is-down"; };
      const noshowRate = l => { const base = l.filter(r => ["seated", "noshow"].includes(r.status)).length; return base ? Math.round(l.filter(r => r.status === "noshow").length / base * 100) : 0; };
      const nCur = cur.filter(r => r.status !== "cancelled").length, nPrev = prev.filter(r => r.status !== "cancelled").length;
      $("#statsKpis").innerHTML =
        kpiTile("Couverts servis", covers(cur), delta(covers(cur), covers(prev)), cls(covers(cur), covers(prev)))
        + kpiTile("Réservations", nCur, delta(nCur, nPrev), cls(nCur, nPrev))
        + kpiTile("No-show", noshowRate(cur) + " %", `${noshowRate(prev)} % avant`, noshowRate(cur) <= noshowRate(prev) ? "is-up" : "is-down");

      const byDay = []; for (let i = 0; i < days; i++) { const d = addDays(from, i); byDay.push({ d, v: covers(cur.filter(r => r.date === d)) }); }
      const W = 640, H = 180, P = { l: 28, r: 6, t: 14, b: 26 }, max = Math.max(10, ...byDay.map(x => x.v));
      const bw = (W - P.l - P.r) / byDay.length, gap = Math.min(3, bw * .25);
      const yTicks = [0, Math.round(max / 2), max];
      const barsSvg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Couverts servis par jour">
        ${yTicks.map(v => { const y = P.t + (H - P.t - P.b) * (1 - v / max); return `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text class="axis" x="${P.l - 6}" y="${y + 3}" text-anchor="end">${v}</text>`; }).join("")}
        ${byDay.map((x, i) => { const h = (H - P.t - P.b) * x.v / max, X = P.l + i * bw + gap / 2, Y = H - P.b - h; const dow = parseISO(x.d).getDay(); return `<g><rect class="bar${x.v ? "" : " bar--muted"}" x="${X.toFixed(1)}" y="${Y.toFixed(1)}" width="${(bw - gap).toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="3"><title>${fmtLong(x.d)} · ${x.v} couverts</title></rect>${(days <= 7 || dow === 1) ? `<text class="axis" x="${(X + (bw - gap) / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${days <= 7 ? fmtShort(x.d).split(" ")[0] : parseISO(x.d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }).replace(".", "")}</text>` : ""}</g>`; }).join("")}
      </svg>`;
      $("#charts").innerHTML = `<div class="chart chart--wide"><div class="chart__head"><span class="chart__title">Couverts servis par jour</span><span class="chart__sub">${fmtShort(from)} → ${fmtShort(t)}</span></div>${barsSvg}</div>`;
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
  function openResa(id, prefill = {}) {
    const r = id ? window.Store.get(id) : null;
    const dlg = $("#resaSheet");
    $("#rsId").value = r ? r.id : "";
    $("#rsRef").textContent = r ? `${r.ref} · ${SOURCES[r.source] || ""}` : "Nouvelle réservation";
    $("#rsName").textContent = r ? fullName(r) : "Saisie manuelle";
    $("#rsTime").innerHTML = CFG.slots.map(s => `<option>${s}</option>`).join("");
    $("#rsDate").value = r ? r.date : (prefill.date || (ui.view === "planning" ? ui.anchor : todayISO()));
    $("#rsTime").value = r ? r.time : (prefill.time || "20:00");
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
    $$("#planRange .chip").forEach(b => b.addEventListener("click", () => { ui.range = Number(b.dataset.range); localStorage.setItem("unamas.admin.range", ui.range); render.planning(); }));
    $$("[data-nav]").forEach(b => b.addEventListener("click", () => { const n = Number(b.dataset.nav); ui.anchor = n === 0 ? todayISO() : addDays(ui.anchor, n * ui.range); render.planning(); }));
    $("#plan").addEventListener("click", e => { if (e.target.closest("[data-open]")) return; const cell = e.target.closest(".plan__cell"); if (cell) openResa(null, { date: cell.dataset.date, time: cell.dataset.time }); });

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
