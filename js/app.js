/* =========================================================
   UNA MÁS — Réservation
   Vanilla JS, aucun build. Configuration en haut de fichier.
   ========================================================= */
(function () {
  "use strict";

  /* ---------- CONFIG (à adapter par le restaurant) ---------- */
  const CONFIG = {
    name: "Una Más",
    phone: "04 67 54 36 49",
    phoneIntl: "+33467543649",
    address: "Place Saint Marc, 34130 Mauguio",
    place: "Port de Carnon",
    instagram: "https://www.instagram.com/unamas_cocktailbar",
    cocktailsMenuUrl: "",          // URL PDF ou page de la carte des cocktails
    tapasMenuUrl: "",              // URL PDF ou page des tapas
    // Envoi de la réservation : URL qui reçoit un POST JSON (Formspree, Make, n8n, Supabase Edge Function…)
    // Laisser vide = enregistrement local uniquement (mode démo).
    endpoint: "",
    daysAhead: 30,                 // nombre de jours ouverts à la réservation
    closedWeekdays: [],            // 0 = dimanche … 6 = samedi, ex : [1] pour fermé le lundi
    slots: ["18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00","22:30","23:00","23:30"],
    blockedSlots: {},              // ex : { "2026-12-31": ["22:00","22:30"] }
    minGuests: 1,
    maxGuests: 12,
    defaultGuests: 2,
    defaultSlot: "20:00",
    leadMinutes: 30,               // délai minimal avant le créneau (aujourd'hui)
    durationMinutes: 120,          // durée mise dans l'événement agenda
    prefTexts: {
      "Terrasse":    { title: "Terrasse",   text: "Profitez de l'ambiance du port et de nos canapés en extérieur." },
      "Intérieur":   { title: "Intérieur",  text: "Au frais, près du bar, avec la musique live les soirs de concert." },
      "Peu importe": { title: "Selon disponibilité", text: "On vous installe à la meilleure table disponible à votre arrivée." }
    }
  };

  /* ---------- State ---------- */
  const state = {
    step: 1,
    date: null,        // "YYYY-MM-DD"
    time: null,        // "HH:MM"
    guests: CONFIG.defaultGuests,
    pref: "Terrasse",
    firstName: "", lastName: "", phone: "", email: "", note: "",
    ref: null,
    createdAt: null
  };

  const STORAGE_KEY = "unamas.reservation";

  /* ---------- Helpers ---------- */
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  const pad = n => String(n).padStart(2, "0");
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  const fmtLong = s => cap(parseISO(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
  const fmtShort = s => cap(parseISO(s).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" }).replace(".", ""));
  const guestsLabel = n => `${n} personne${n > 1 ? "s" : ""}`;

  function toast(msg, ms = 2600) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("is-visible"), ms);
  }

  function smoothTo(target) {
    const el = typeof target === "string" ? $(target) : target;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  /* ---------- Date strip ---------- */
  function buildDates() {
    const strip = $("#dateStrip");
    strip.innerHTML = "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let firstOpen = null;
    for (let i = 0; i < CONFIG.daysAhead; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const iso = isoDate(d);
      const closed = CONFIG.closedWeekdays.includes(d.getDay());
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "datebtn" + (i === 0 ? " is-today" : "");
      btn.setAttribute("role", "radio");
      btn.setAttribute("aria-checked", "false");
      btn.dataset.date = iso;
      btn.disabled = closed;
      btn.innerHTML = `
        <span class="datebtn__dow">${d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</span>
        <span class="datebtn__day">${d.getDate()}</span>
        <span class="datebtn__mon">${d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")}</span>`;
      btn.addEventListener("click", () => selectDate(iso));
      strip.appendChild(btn);
      if (!closed && !firstOpen) firstOpen = iso;
    }
    selectDate(state.date && $(`.datebtn[data-date="${state.date}"]:not([disabled])`) ? state.date : firstOpen, false);
  }

  function selectDate(iso, scroll = true) {
    state.date = iso;
    $$(".datebtn").forEach(b => b.setAttribute("aria-checked", String(b.dataset.date === iso)));
    $("#dateLabel").textContent = fmtShort(iso);
    const btn = $(`.datebtn[data-date="${iso}"]`);
    if (btn && scroll) btn.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    // Reset time if no longer available
    if (state.time && !slotAvailable(iso, state.time)) state.time = null;
  }

  /* ---------- Guests ---------- */
  function setGuests(n) {
    state.guests = Math.min(CONFIG.maxGuests, Math.max(CONFIG.minGuests, n));
    $("#guestsOut").textContent = guestsLabel(state.guests);
    $("#guestsMinus").disabled = state.guests <= CONFIG.minGuests;
    $("#guestsPlus").disabled = state.guests >= CONFIG.maxGuests;
    $("#guestsHint").hidden = state.guests < CONFIG.maxGuests;
    $("#guestsMax").textContent = CONFIG.maxGuests;
  }

  /* ---------- Slots ---------- */
  function slotAvailable(iso, time) {
    const blocked = CONFIG.blockedSlots[iso] || [];
    if (blocked.includes(time)) return false;
    const now = new Date();
    const [h, m] = time.split(":").map(Number);
    const dt = parseISO(iso); dt.setHours(h, m, 0, 0);
    return dt.getTime() - now.getTime() >= CONFIG.leadMinutes * 60000;
  }

  function buildSlots() {
    const wrap = $("#slots");
    wrap.innerHTML = "";
    let any = false;
    CONFIG.slots.forEach(t => {
      const ok = slotAvailable(state.date, t);
      any = any || ok;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.textContent = t;
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(state.time === t));
      b.disabled = !ok;
      b.addEventListener("click", () => {
        state.time = t;
        $$(".slot").forEach(s => s.setAttribute("aria-checked", String(s.textContent === t)));
        $("#slotsErr").hidden = true;
      });
      wrap.appendChild(b);
    });
    if (!any) {
      const p = document.createElement("p");
      p.className = "slots__empty";
      p.textContent = "Plus de créneau disponible ce jour-là. Choisissez une autre date ou appelez-nous.";
      wrap.appendChild(p);
    }
    if (!state.time && any) {
      state.time = slotAvailable(state.date, CONFIG.defaultSlot) ? CONFIG.defaultSlot : CONFIG.slots.find(t => slotAvailable(state.date, t));
      $$(".slot").forEach(s => s.setAttribute("aria-checked", String(s.textContent === state.time)));
    }
  }

  function updatePrefCard() {
    const p = CONFIG.prefTexts[state.pref] || CONFIG.prefTexts["Peu importe"];
    $("#prefCardTitle").textContent = p.title;
    $("#prefCardText").textContent = p.text;
  }

  /* ---------- Steps ---------- */
  function goTo(step, back = false) {
    state.step = step;
    $$(".panel").forEach(p => {
      const n = Number(p.dataset.panel);
      p.classList.toggle("is-active", n === step);
      p.classList.toggle("is-back", n === step && back);
    });
    $$(".steps__item").forEach(li => {
      const n = Number(li.dataset.step);
      li.classList.toggle("is-current", n === step);
      li.classList.toggle("is-done", n < step);
    });
    $("#stepsBar").hidden = step === 4;
    $(".booking").classList.toggle("is-confirmed", step === 4);
    if (step === 2) {
      buildSlots();
      updatePrefCard();
      $("#recap2").textContent = `${fmtLong(state.date)} • ${guestsLabel(state.guests)}`;
    }
    if (step === 3) {
      $("#recap3").textContent = `${fmtLong(state.date)} • ${state.time} • ${guestsLabel(state.guests)}`;
      setTimeout(() => $("#firstName").focus({ preventScroll: true }), 350);
    }
    smoothTo("#reservation");
  }

  function validateStep1() {
    if (!state.date) { toast("Choisissez une date."); return false; }
    return true;
  }
  function validateStep2() {
    if (!state.time) { $("#slotsErr").hidden = false; return false; }
    return true;
  }
  function validateStep3() {
    let ok = true;
    const req = ["firstName", "lastName", "phone"];
    req.forEach(id => {
      const input = $("#" + id);
      const bad = !input.value.trim();
      input.closest(".input").classList.toggle("is-invalid", bad);
      if (bad) ok = false;
    });
    const email = $("#email");
    const badEmail = email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    email.closest(".input").classList.toggle("is-invalid", !!badEmail);
    if (badEmail) ok = false;
    $("#contactErr").hidden = ok;
    return ok;
  }

  /* ---------- Submit ---------- */
  function makeRef() {
    const t = Date.now().toString(36).toUpperCase().slice(-5);
    const r = Math.random().toString(36).toUpperCase().slice(2, 4);
    return `UM-${t}${r}`;
  }

  async function submit() {
    if (!validateStep3()) return;
    state.firstName = $("#firstName").value.trim();
    state.lastName = $("#lastName").value.trim();
    state.phone = $("#phone").value.trim();
    state.email = $("#email").value.trim();
    state.note = $("#note").value.trim();
    state.ref = state.ref || makeRef();
    state.createdAt = new Date().toISOString();

    const btn = $("#submitBtn");
    btn.classList.add("is-loading");

    const payload = {
      ref: state.ref, date: state.date, time: state.time, guests: state.guests, pref: state.pref,
      firstName: state.firstName, lastName: state.lastName, phone: state.phone, email: state.email, note: state.note,
      createdAt: state.createdAt, restaurant: CONFIG.name
    };

    let sent = true;
    if (CONFIG.endpoint) {
      try {
        const res = await fetch(CONFIG.endpoint, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error(res.statusText);
      } catch (e) {
        sent = false;
      }
    }
    btn.classList.remove("is-loading");

    if (!sent) {
      toast(`Impossible d'envoyer la demande. Appelez-nous au ${CONFIG.phone}.`, 4000);
      return;
    }

    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (e) { /* stockage indisponible */ }
    renderConfirmation();
    goTo(4);
  }

  function renderConfirmation() {
    $("#confirmName").textContent = state.firstName;
    $("#confirmRef").textContent = state.ref;
    $("#rcDate").textContent = fmtLong(state.date);
    $("#rcTime").textContent = state.time;
    $("#rcGuests").textContent = guestsLabel(state.guests);
    $("#rcPref").textContent = state.pref;
    $("#rcNoteRow").hidden = !state.note;
    $("#rcNote").textContent = state.note;
  }

  /* ---------- ICS ---------- */
  function downloadICS() {
    const [h, m] = state.time.split(":").map(Number);
    const start = parseISO(state.date); start.setHours(h, m, 0, 0);
    const end = new Date(start.getTime() + CONFIG.durationMinutes * 60000);
    const fmt = d => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const esc = s => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Una Mas//Reservation//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${state.ref}@unamas`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${esc(`Una Más — table pour ${state.guests}`)}`,
      `LOCATION:${esc(`Una Más, ${CONFIG.place}, ${CONFIG.address}`)}`,
      `DESCRIPTION:${esc(`Réservation ${state.ref} • ${state.pref}${state.note ? " • " + state.note : ""}\nTél. ${CONFIG.phone}`)}`,
      "END:VEVENT", "END:VCALENDAR"
    ];
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `una-mas-${state.date}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Événement ajouté à votre agenda.");
  }

  /* ---------- Cancel / Edit ---------- */
  function resetAll() {
    state.time = null; state.ref = null; state.note = "";
    ["firstName", "lastName", "phone", "email", "note"].forEach(id => { $("#" + id).value = ""; });
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    setGuests(CONFIG.defaultGuests);
    $$('input[name="pref"]').forEach(r => { r.checked = r.value === "Terrasse"; });
    state.pref = "Terrasse";
    buildDates();
    goTo(1, true);
  }

  /* ---------- Restore ---------- */
  function restore() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (e) { saved = null; }
    if (!saved || !saved.date || !saved.time) return false;
    const [h, m] = saved.time.split(":").map(Number);
    const dt = parseISO(saved.date); dt.setHours(h, m, 0, 0);
    if (dt.getTime() < Date.now() - CONFIG.durationMinutes * 60000) { try { localStorage.removeItem(STORAGE_KEY); } catch (e) {} return false; }
    Object.assign(state, saved);
    ["firstName", "lastName", "phone", "email", "note"].forEach(id => { $("#" + id).value = saved[id] || ""; });
    $$('input[name="pref"]').forEach(r => { r.checked = r.value === saved.pref; });
    setGuests(saved.guests);
    $$(".datebtn").forEach(b => b.setAttribute("aria-checked", String(b.dataset.date === saved.date)));
    if ($(`.datebtn[data-date="${saved.date}"]`)) $("#dateLabel").textContent = fmtShort(saved.date);
    renderConfirmation();
    goTo(4);
    window.scrollTo(0, 0);
    return true;
  }

  /* ---------- Drawer ---------- */
  function setDrawer(open) {
    const d = $("#drawer");
    d.classList.toggle("is-open", open);
    d.setAttribute("aria-hidden", String(!open));
    $("#menuOpen").setAttribute("aria-expanded", String(open));
    document.body.style.overflow = open ? "hidden" : "";
    if (open) $(".drawer__nav a").focus();
  }

  /* ---------- Init ---------- */
  function init() {
    $("#year").textContent = new Date().getFullYear();
    buildDates();
    setGuests(state.guests);
    updatePrefCard();

    // Optional links
    if (CONFIG.instagram) {
      ["#instaLink", "#navInsta"].forEach(s => { const el = $(s); el.hidden = false; (el.tagName === "A" ? el : el.querySelector("a")).href = CONFIG.instagram; });
    }
    if (CONFIG.cocktailsMenuUrl) { const li = $("#navCocktails"); li.hidden = false; li.querySelector("a").href = CONFIG.cocktailsMenuUrl; }
    if (CONFIG.tapasMenuUrl) { const li = $("#navTapas"); li.hidden = false; li.querySelector("a").href = CONFIG.tapasMenuUrl; }
    $$("a[href^='tel:']").forEach(a => { a.href = `tel:${CONFIG.phoneIntl}`; });

    $("#guestsMinus").addEventListener("click", () => setGuests(state.guests - 1));
    $("#guestsPlus").addEventListener("click", () => setGuests(state.guests + 1));
    $$('input[name="pref"]').forEach(r => r.addEventListener("change", () => { state.pref = r.value; updatePrefCard(); }));

    $$("[data-next]").forEach(b => b.addEventListener("click", () => {
      const n = Number(b.dataset.next);
      if (n === 2 && !validateStep1()) return;
      if (n === 3 && !validateStep2()) return;
      goTo(n);
    }));
    $$("[data-prev]").forEach(b => b.addEventListener("click", () => goTo(Number(b.dataset.prev), true)));

    $("#bookingForm").addEventListener("submit", e => { e.preventDefault(); if (state.step === 3) submit(); });
    ["firstName", "lastName", "phone", "email"].forEach(id => $("#" + id).addEventListener("input", e => e.target.closest(".input").classList.remove("is-invalid")));

    $("#icsBtn").addEventListener("click", downloadICS);
    $("#editBtn").addEventListener("click", () => goTo(1, true));
    const dlg = $("#cancelDialog");
    $("#cancelBtn").addEventListener("click", () => dlg.showModal());
    dlg.addEventListener("close", () => { if (dlg.returnValue === "cancel") { resetAll(); toast("Réservation annulée. À bientôt chez Una Más."); } });

    // Smooth anchors + special requests
    $$("[data-scroll]").forEach(a => a.addEventListener("click", e => {
      e.preventDefault();
      setDrawer(false);
      const special = a.dataset.special;
      if (special !== undefined) {
        if (state.step === 4) goTo(1, true);
        const note = $("#note");
        if (special && !note.value.trim()) note.value = special;
        if (special && note.value.trim() && !note.value.includes(special)) note.value = `${special} — ${note.value}`;
        toast(special ? `${special} noté. Choisissez votre table.` : "Précisez votre demande à l'étape 3.");
      }
      smoothTo(a.getAttribute("href"));
    }));

    $("#menuOpen").addEventListener("click", () => setDrawer(true));
    $$("[data-close]").forEach(b => b.addEventListener("click", () => setDrawer(false)));
    document.addEventListener("keydown", e => { if (e.key === "Escape") setDrawer(false); });


    restore();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
