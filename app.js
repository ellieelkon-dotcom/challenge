(function () {
  "use strict";
  var C = window.CHALLENGE_CONFIG;
  var API = (C.API_URL || "").trim();
  var N = C.DAYS;
  var FULL = (1 << C.RULES.length) - 1;
  var LS = "challenge14:";
  var SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  var LONG = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  function pad(n) { return String(n).padStart(2, "0"); }
  function keyOf(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function load(k, d) { try { var v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }
  function pop(m) { var c = 0; while (m) { c += m & 1; m >>= 1; } return c; }

  var sp = C.START.split("-");
  var days = [];
  for (var i = 0; i < N; i++) {
    var d = new Date(+sp[0], +sp[1] - 1, +sp[2] + i, 12);
    days.push({ d: d, k: keyOf(d), i: i });
  }

  function calcTi() {
    var tk = keyOf(new Date());
    for (var j = 0; j < N; j++) if (days[j].k === tk) return j;
    return tk < days[0].k ? -1 : N;
  }
  var ti = calcTi();

  var state = {
    me: load("me", null),
    marks: load("marks", {}),
    pending: load("pending", []),
    sel: ti < 0 ? 0 : (ti >= N ? N - 1 : ti),
    net: API ? "idle" : "demo",
    lastSync: null
  };
  if (C.PEOPLE.indexOf(state.me) < 0) state.me = null;

  function mask(p, k) {
    var m = state.marks[p];
    return m && typeof m[k] === "number" ? m[k] : 0;
  }
  function setMark(p, k, m) {
    if (!state.marks[p]) state.marks[p] = {};
    state.marks[p][k] = m;
    save("marks", state.marks);
  }

  function stats(p) {
    var total = 0, perfect = 0, streak = 0;
    var last = ti < 0 ? -1 : Math.min(ti, N - 1);
    for (var j = 0; j <= last; j++) {
      var m = mask(p, days[j].k);
      total += pop(m);
      if (m === FULL) perfect++;
    }
    var s = last;
    if (s >= 0 && s === ti && mask(p, days[s].k) !== FULL) s--;
    while (s >= 0 && mask(p, days[s].k) === FULL) { streak++; s--; }
    return { total: total, perfect: perfect, streak: streak };
  }

  function checkSvg() {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "3.2");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", "M4.5 12.5l5 5 10-11");
    s.appendChild(p);
    return s;
  }

  function fmt(d) { return d.getDate() + "." + (d.getMonth() + 1); }

  function renderHeader() {
    $("range").textContent = fmt(days[0].d) + " עד " + fmt(days[N - 1].d);
    var t = $("title");
    if (ti < 0) {
      var left = Math.round((days[0].d - new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), 12)) / 86400000);
      t.textContent = left === 1 ? "מתחילים מחר" : "מתחילים בעוד " + left + " ימים";
    } else if (ti >= N) {
      t.textContent = "האתגר נגמר";
    } else {
      t.textContent = "יום " + (ti + 1) + " מתוך " + N;
    }
    $("me").textContent = state.me || "";
    var chip = $("sync");
    chip.className = "chip";
    var txt;
    if (net() === "demo") { txt = "מצב ניסיון, נשמר רק בטלפון הזה"; chip.className = "chip warn"; }
    else if (state.pending.length) {
      if (state.net === "offline") { txt = "לא מחובר, יישלח בהמשך"; chip.className = "chip warn"; }
      else if (state.net === "error") { txt = "ממתין לשליחה, ננסה שוב"; chip.className = "chip warn"; }
      else { txt = "שומר"; }
    }
    else if (state.net === "error") { txt = "אין חיבור לגיליון"; chip.className = "chip warn"; }
    else if (state.lastSync) { txt = "מסונכרן " + pad(state.lastSync.getHours()) + ":" + pad(state.lastSync.getMinutes()); }
    else { txt = "טוען"; }
    chip.textContent = txt;
  }
  function net() { return API ? state.net : "demo"; }

  function renderStrip() {
    var box = $("strip");
    box.textContent = "";
    days.forEach(function (day) {
      var b = el("button", "d" + (day.i === ti ? " today" : ""));
      b.type = "button";
      b.disabled = day.i > ti;
      b.setAttribute("aria-current", day.i === state.sel ? "true" : "false");
      b.setAttribute("aria-label", "יום " + LONG[day.d.getDay()] + " " + fmt(day.d));
      b.appendChild(el("span", "wd", SHORT[day.d.getDay()]));
      b.appendChild(el("span", "dn", String(day.d.getDate())));
      var bar = el("span", "bar");
      var fill = document.createElement("i");
      fill.style.width = (state.me ? pop(mask(state.me, day.k)) / C.RULES.length * 100 : 0) + "%";
      bar.appendChild(fill);
      b.appendChild(bar);
      b.addEventListener("click", function () { state.sel = day.i; renderStrip(); renderToday(); renderBoard(); });
      box.appendChild(b);
    });
    var cur = box.querySelector('[aria-current="true"]');
    if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) {} }
  }

  function renderToday() {
    var box = $("today");
    box.textContent = "";
    if (!state.me) return;
    var day = days[state.sel];
    var future = day.i > ti;
    var m = mask(state.me, day.k);
    var head = el("div", "sec-head");
    head.appendChild(el("h2", "", "יום " + LONG[day.d.getDay()] + ", " + fmt(day.d)));
    var done = pop(m);
    var pr = el("span", done === C.RULES.length ? "prog perfect" : "prog", done === C.RULES.length ? "יום מושלם" : done + " מתוך " + C.RULES.length);
    head.appendChild(pr);
    box.appendChild(head);
    if (future) box.appendChild(el("p", "hint", "היום הזה עוד לא הגיע."));
    var list = el("div", "rules");
    C.RULES.forEach(function (r, idx) {
      var on = !!(m & (1 << idx));
      var b = el("button", "rule" + (on ? " on" : ""));
      b.type = "button";
      b.setAttribute("role", "switch");
      b.setAttribute("aria-checked", on ? "true" : "false");
      b.disabled = future;
      b.appendChild(el("span", "big", r.big));
      var t = el("span", "txt");
      t.appendChild(el("b", "", r.label));
      t.appendChild(el("span", "", r.sub));
      b.appendChild(t);
      var tick = el("span", "tick");
      tick.appendChild(checkSvg());
      b.appendChild(tick);
      b.addEventListener("click", function () { toggle(day.k, idx); });
      list.appendChild(b);
    });
    box.appendChild(list);
  }

  function renderBoard() {
    var box = $("board");
    box.textContent = "";
    var day = days[state.sel];
    $("groupHint").textContent = "נקודות: " + fmt(day.d);
    var rows = C.PEOPLE.map(function (p, idx) { var s = stats(p); s.p = p; s.idx = idx; return s; });
    rows.sort(function (a, b) { return b.total - a.total || b.perfect - a.perfect || a.idx - b.idx; });
    rows.forEach(function (s) {
      var row = el("div", "p" + (s.p === state.me ? " me" : ""));
      var nm = el("div", "nm", s.p);
      nm.appendChild(el("span", "sub", "ימים מושלמים " + s.perfect + " · רצף " + s.streak));
      row.appendChild(nm);
      var dots = el("div", "dots");
      var m = mask(s.p, day.k);
      dots.setAttribute("aria-label", pop(m) + " מתוך " + C.RULES.length + " ב" + fmt(day.d));
      for (var j = 0; j < C.RULES.length; j++) dots.appendChild(el("i", (m & (1 << j)) ? "on" : ""));
      row.appendChild(dots);
      var sc = el("div", "score", String(s.total));
      sc.appendChild(el("small", "", " /" + (N * C.RULES.length)));
      row.appendChild(sc);
      box.appendChild(row);
    });
  }

  var deferredPrompt = null;
  function renderInstall() {
    var box = $("install");
    var standalone = (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone;
    if (standalone || load("hideInstall", false)) { box.hidden = true; return; }
    box.textContent = "";
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    box.appendChild(el("b", "", "להתקנה כאפליקציה"));
    if (deferredPrompt) {
      var btn = el("button", "act", "התקנה");
      btn.type = "button";
      btn.addEventListener("click", function () { deferredPrompt.prompt(); deferredPrompt = null; renderInstall(); });
      box.appendChild(btn);
    } else if (ios) {
      box.appendChild(el("p", "", "בספארי: כפתור השיתוף, ואז הוספה למסך הבית."));
    } else {
      box.appendChild(el("p", "", "בכרום: תפריט שלוש הנקודות, ואז התקנת אפליקציה או הוספה למסך הבית."));
    }
    var hide = el("button", "linkbtn", "לא להציג שוב");
    hide.type = "button";
    hide.addEventListener("click", function () { save("hideInstall", true); box.hidden = true; });
    box.appendChild(hide);
    box.hidden = false;
  }
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferredPrompt = e; renderInstall(); });

  function renderPicker() {
    var pk = $("picker");
    var box = $("picks");
    box.textContent = "";
    C.PEOPLE.forEach(function (p) {
      var b = el("button", "pick", p);
      b.type = "button";
      b.addEventListener("click", function () {
        state.me = p;
        save("me", p);
        pk.hidden = true;
        renderAll();
        pull();
      });
      box.appendChild(b);
    });
    pk.hidden = !!state.me ? true : false;
  }

  function renderAll() {
    ti = calcTi();
    renderHeader();
    renderStrip();
    renderToday();
    renderBoard();
    renderInstall();
  }

  // ---- סימון ושמירה ----
  function toggle(k, idx) {
    if (!state.me) return;
    var day = days.filter(function (x) { return x.k === k; })[0];
    if (!day || day.i > ti) return;
    var m = mask(state.me, k) ^ (1 << idx);
    setMark(state.me, k, m);
    var found = false;
    state.pending.forEach(function (it) { if (it.p === state.me && it.d === k) { it.m = m; found = true; } });
    if (!found) state.pending.push({ p: state.me, d: k, m: m });
    save("pending", state.pending);
    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    renderAll();
    flush();
  }

  var flushing = false;
  async function flush() {
    if (!API || flushing) return;
    flushing = true;
    try {
      while (state.pending.length) {
        var item = state.pending[0];
        var snapshot = { p: item.p, d: item.d, m: item.m };
        var r = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(snapshot) });
        var j = await r.json();
        // הסרה מהתור גם כשהשרת דחה את הפריט: ניסיון חוזר לא יעזור, והתור לא ייתקע.
        for (var q = 0; q < state.pending.length; q++) {
          var it = state.pending[q];
          if (it.p === snapshot.p && it.d === snapshot.d && it.m === snapshot.m) { state.pending.splice(q, 1); break; }
        }
        save("pending", state.pending);
        if (!j.ok) throw new Error(j.error || "save failed");
      }
      state.net = "ok";
      state.lastSync = new Date();
    } catch (e) {
      state.net = navigator.onLine === false ? "offline" : "error";
    } finally {
      flushing = false;
      renderHeader();
    }
  }

  async function pull() {
    if (!API) return;
    try {
      var r = await fetch(API + (API.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now());
      var j = await r.json();
      if (!j.ok) throw new Error("bad response");
      var fresh = {};
      (j.marks || []).forEach(function (x) {
        if (C.PEOPLE.indexOf(x.p) < 0) return;
        if (!fresh[x.p]) fresh[x.p] = {};
        fresh[x.p][x.d] = x.m;
      });
      state.pending.forEach(function (it) {
        if (!fresh[it.p]) fresh[it.p] = {};
        fresh[it.p][it.d] = it.m;
      });
      state.marks = fresh;
      save("marks", fresh);
      state.net = "ok";
      state.lastSync = new Date();
    } catch (e) {
      state.net = navigator.onLine === false ? "offline" : "error";
    }
    renderAll();
  }

  function sync() { flush().then(pull); }

  $("change").addEventListener("click", function () { state.me = null; renderPicker(); $("picker").hidden = false; });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { renderAll(); sync(); } });
  window.addEventListener("online", sync);
  window.addEventListener("focus", sync);
  setInterval(function () { if (!document.hidden) sync(); }, 20000);

  renderPicker();
  renderAll();
  sync();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
