/* =========================================================
   UNA MÁS — Tableau de bord : couche de données
   ---------------------------------------------------------
   Aujourd'hui : stockage local (localStorage) + jeu de
   démonstration généré. Demain : remplacer les fonctions de
   `Store` par des appels Supabase, l'interface ne change pas.
   ========================================================= */
window.ADMIN_CONFIG = {
  restaurant: "Una Más",
  // Capacité par créneau et par zone (couverts pouvant être servis en même temps). À ajuster avec le gérant.
  capacity: { "Terrasse": 48, "Intérieur": 32 },
  slots: ["18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00","22:30","23:00","23:30"],
  durationMinutes: 120,
  // Supabase (laisser vide = mode démo local)
  supabase: { url: "", anonKey: "" }
};

window.STATUS = {
  pending:   { label: "En attente",  short: "Attente",  cls: "st-pending" },
  confirmed: { label: "Confirmée",   short: "Confirmée",cls: "st-confirmed" },
  seated:    { label: "Installée",   short: "Installée",cls: "st-seated" },
  noshow:    { label: "No-show",     short: "No-show",  cls: "st-noshow" },
  cancelled: { label: "Annulée",     short: "Annulée",  cls: "st-cancelled" }
};

window.SOURCES = { web: "Site web", phone: "Téléphone", whatsapp: "WhatsApp", walkin: "Sur place" };

(function () {
  "use strict";
  const KEY = "unamas.admin.db.v2";
  const CLIENT_KEY = "unamas.reservation";
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  /* ---------- PRNG déterministe (même démo à chaque chargement) ---------- */
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rnd = mulberry32(20260921);
  const pick = arr => arr[Math.floor(rnd() * arr.length)];
  const weighted = pairs => { const t = pairs.reduce((a, p) => a + p[1], 0); let r = rnd() * t; for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; } return pairs[pairs.length - 1][0]; };

  /* ---------- Clients de démonstration (fictifs) ---------- */
  const FIRST = ["Camille","Léa","Hugo","Manon","Lucas","Chloé","Nathan","Inès","Louis","Emma","Théo","Jade","Adam","Sarah","Maxime","Lina","Raphaël","Zoé","Gabriel","Anna","Sofia","Mathis","Louise","Enzo","Clara","Tom","Eva","Noah","Alice","Jules","Romane","Axel","Nina","Paul","Margaux","Yanis","Élise","Sacha","Océane","Karim","Julie","Antoine","Laura","Mehdi","Charlotte"];
  const LAST = ["Martin","Bernard","Durand","Petit","Robert","Richard","Moreau","Simon","Laurent","Lefebvre","Michel","Garcia","David","Bertrand","Roux","Vincent","Fournier","Morel","Girard","André","Lopez","Bonnet","Dupont","Lambert","Fontaine","Rousseau","Blanc","Guérin","Muller","Henry","Perez","Marchand","Dumont","Rey","Benali","Nguyen","Costa","Ferreira"];
  const NOTES = [null,null,null,null,null,"Anniversaire","Table près de la musique si possible","Allergie fruits à coque","Poussette","Groupe afterwork","Demande une table calme","Fauteuil roulant, accès terrasse","Végétarien","Vient pour le concert"];

  function makeCustomers(n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push({
        firstName: pick(FIRST), lastName: pick(LAST),
        phone: `06 ${pad(Math.floor(rnd() * 100))} ${pad(Math.floor(rnd() * 100))} ${pad(Math.floor(rnd() * 100))} ${pad(Math.floor(rnd() * 100))}`,
        email: rnd() < .6 ? `demo${i}@exemple.fr` : "",
        weight: rnd() < .08 ? 9 : rnd() < .3 ? 3 : 1   // quelques vrais habitués, beaucoup d'occasionnels
      });
    }
    return out;
  }

  function seed() {
    const cfg = window.ADMIN_CONFIG;
    const customers = makeCustomers(320);
    const pool = customers.flatMap(c => Array(c.weight).fill(c));
    const res = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let seq = 1000;
    for (let off = -75; off <= 28; off++) {
      const d = new Date(today); d.setDate(today.getDate() + off);
      const dow = d.getDay();
      const summer = d.getMonth() >= 5 && d.getMonth() <= 8;
      let base = dow === 5 || dow === 6 ? 16 : dow === 0 || dow === 4 ? 11 : 7;
      if (summer) base += 4;
      if (off > 7) base = Math.round(base * .45);   // le futur lointain se remplit encore
      if (off > 0 && off <= 7) base = Math.round(base * .8);
      const n = Math.max(2, Math.round(base + (rnd() - .5) * 6));
      for (let i = 0; i < n; i++) {
        const c = pick(pool);
        const time = weighted([["18:00",1],["18:30",1],["19:00",3],["19:30",4],["20:00",7],["20:30",7],["21:00",6],["21:30",4],["22:00",2],["22:30",1],["23:00",.5]]);
        const guests = weighted([[2,10],[3,4],[4,6],[5,2],[6,2],[8,1],[10,.4]]);
        const pref = weighted([["Terrasse",6],["Intérieur",3],["Peu importe",2]]);
        const source = weighted([["web",6],["phone",3],["whatsapp",1],["walkin",.6]]);
        let status;
        if (off < 0) status = weighted([["seated",84],["noshow",6],["cancelled",10]]);
        else if (off === 0) status = weighted([["confirmed",70],["seated",10],["pending",15],["cancelled",5]]);
        else status = weighted([["confirmed",85],["pending",15]]);
        const created = new Date(d); created.setDate(created.getDate() - Math.floor(rnd() * 9)); created.setHours(10 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
        res.push({
          id: `r${seq++}`, ref: `UM-${(seq * 7919).toString(36).toUpperCase().slice(-6)}`,
          date: iso(d), time, guests, pref, status, source,
          firstName: c.firstName, lastName: c.lastName, phone: c.phone, email: c.email,
          note: pick(NOTES) || "", createdAt: created.toISOString(), updatedAt: created.toISOString()
        });
      }
    }
    return { reservations: res, customers: {}, seededAt: new Date().toISOString(), demo: true };
  }

  /* ---------- Store ---------- */
  let db = null;

  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { db = null; }
    if (!db || !Array.isArray(db.reservations)) { db = seed(); save(); }
    mergeClientReservation();
    return db;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* stockage indisponible */ } }

  // La réservation faite sur la page client (même navigateur) remonte dans le tableau de bord.
  function mergeClientReservation() {
    let r = null;
    try { r = JSON.parse(localStorage.getItem(CLIENT_KEY) || "null"); } catch (e) { r = null; }
    if (!r || !r.ref || db.reservations.some(x => x.ref === r.ref)) return;
    db.reservations.push({
      id: `c${Date.now()}`, ref: r.ref, date: r.date, time: r.time, guests: r.guests, pref: r.pref,
      status: "confirmed", source: "web", firstName: r.firstName, lastName: r.lastName, phone: r.phone, email: r.email || "",
      note: r.note || "", createdAt: r.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString()
    });
    save();
  }

  const normPhone = p => (p || "").replace(/\D/g, "");

  const Store = {
    load,
    isDemo: () => !!(db && db.demo),
    all: () => db.reservations.slice(),
    get: id => db.reservations.find(r => r.id === id) || null,
    byDate: date => db.reservations.filter(r => r.date === date).sort((a, b) => a.time.localeCompare(b.time)),
    range: (from, to) => db.reservations.filter(r => r.date >= from && r.date <= to),
    upsert(r) {
      const now = new Date().toISOString();
      if (r.id) {
        const i = db.reservations.findIndex(x => x.id === r.id);
        if (i >= 0) { db.reservations[i] = { ...db.reservations[i], ...r, updatedAt: now }; save(); return db.reservations[i]; }
      }
      const created = { id: `m${Date.now().toString(36)}`, ref: `UM-${Date.now().toString(36).toUpperCase().slice(-5)}${Math.random().toString(36).toUpperCase().slice(2, 4)}`, status: "confirmed", source: "phone", note: "", email: "", createdAt: now, updatedAt: now, ...r };
      db.reservations.push(created); save(); return created;
    },
    setStatus(id, status) { const r = Store.get(id); if (!r) return null; r.status = status; r.updatedAt = new Date().toISOString(); save(); return r; },
    remove(id) { db.reservations = db.reservations.filter(r => r.id !== id); save(); },

    /* Fiches clients : agrégées par téléphone, enrichies des notes/tags du gérant */
    customers() {
      const map = new Map();
      db.reservations.forEach(r => {
        const k = normPhone(r.phone) || `${r.firstName} ${r.lastName}`.toLowerCase();
        if (!map.has(k)) map.set(k, { key: k, firstName: r.firstName, lastName: r.lastName, phone: r.phone, email: r.email, visits: 0, noshows: 0, cancels: 0, guestsTotal: 0, upcoming: 0, first: r.date, last: null, history: [] });
        const c = map.get(k);
        c.history.push(r);
        if (r.email && !c.email) c.email = r.email;
        if (r.status === "seated") { c.visits++; c.guestsTotal += r.guests; if (!c.last || r.date > c.last) c.last = r.date; }
        if (r.status === "noshow") c.noshows++;
        if (r.status === "cancelled") c.cancels++;
        if ((r.status === "confirmed" || r.status === "pending") && r.date >= iso(new Date())) c.upcoming++;
        if (r.date < c.first) c.first = r.date;
      });
      map.forEach(c => {
        const extra = db.customers[c.key] || {};
        c.notes = extra.notes || ""; c.tags = extra.tags || [];
        if (c.visits >= 3 && !c.tags.includes("Habitué")) c.autoTags = ["Habitué"]; else c.autoTags = [];
        c.history.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      });
      return Array.from(map.values());
    },
    customer(key) { return Store.customers().find(c => c.key === key) || null; },
    customerKey(r) { return normPhone(r.phone) || `${r.firstName} ${r.lastName}`.toLowerCase(); },
    saveCustomer(key, data) { db.customers[key] = { ...(db.customers[key] || {}), ...data }; save(); },

    /* Occupation d'un créneau : couverts présents (réservations chevauchant le créneau) */
    occupancy(date, slot, zone) {
      const cfg = window.ADMIN_CONFIG;
      const toMin = t => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
      const s = toMin(slot);
      return Store.byDate(date).filter(r => r.status !== "cancelled" && r.status !== "noshow")
        .filter(r => !zone || r.pref === zone || (r.pref === "Peu importe" && zone === "Intérieur"))
        .filter(r => { const t = toMin(r.time); return t <= s && s < t + cfg.durationMinutes; })
        .reduce((a, r) => a + r.guests, 0);
    },
    resetDemo() { localStorage.removeItem(KEY); db = seed(); save(); return db; }
  };

  window.Store = Store;
})();
