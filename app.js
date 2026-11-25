(function () {
  "use strict";
  var C = window.CHALLENGE_CONFIG;
  var API = (C.API_URL || "").trim();
  var N = C.DAYS;
  var R = C.RULES.length;
  var FULL = (1 << R) - 1;
  var LS = "challenge14:";
  var FEED_SHOWN = 12;
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
  var byKey = {};
  days.forEach(function (x) { byKey[x.k] = x; });

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
    log: load("log", []),
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

  var SVG = "http://www.w3.org/2000/svg";
  function icon(d, w) {
    var s = document.createElementNS(SVG, "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", w || "3.2");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    s.appendChild(p);
    return s;
  }
  function checkSvg() { return icon("M4.5 12.5l5 5 10-11"); }
  function undoSvg() { return icon("M6 6l12 12M18 6L6 18", "3"); }

  function fmt(d) { return d.getDate() + "." + (d.getMonth() + 1); }
  function plural(n, one, many) { return n === 1 ? one : n + " " + many; }

  function ago(iso) {
    var t = Date.parse(iso);
    if (!t) return "";
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 0) s = 0;
    if (s < 50) return "עכשיו";
    var m = Math.round(s / 60);
    if (m < 60) return "לפני " + plural(m, "דקה", "דקות");
    var h = Math.round(m / 60);
    if (h < 24) return "לפני " + plural(h, "שעה", "שעות");
    var dd = Math.round(h / 24);
    if (dd === 1) return "אתמול";
    if (dd < 7) return "לפני " + dd + " ימים";
    return fmt(new Date(t));
  }

  function net() { return API ? state.net : "demo"; }

  function renderHero() {
    $("range").textContent = fmt(days[0].d) + " עד " + fmt(days[N - 1].d);
    var t = $("title");
    if (ti < 0) {
      var now = new Date();
      var left = Math.round((days[0].d - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)) / 86400000);
      t.textContent = left === 1 ? "מתחילים מחר" : "מתחילים בעוד " + left + " ימים";
    } else if (ti >= N) {
      t.textContent = "האתגר נגמר";
    } else {
      t.textContent = "יום " + (ti + 1) + " מתוך " + N;
    }

    var tally = $("tally");
    tally.textContent = "";
    if (state.me && ti >= 0) {
      var s = stats(state.me);
      tally.appendChild(el("b", "", String(s.total)));
      tally.appendChild(document.createTextNode(" סימונים מתוך " + N * R + ", "));
      tally.appendChild(el("b", "", String(s.perfect)));
      tally.appendChild(document.createTextNode(" " + (s.perfect === 1 ? "יום מושלם" : "ימים מושלמים") + ", רצף של "));
      tally.appendChild(el("b", "", String(s.streak)));
    } else if (state.me) {
      tally.textContent = "5 כללים בכל יום. יום שבו סימנת את כולם הוא יום מושלם.";
    }

    $("me").textContent = state.me || "";
    var chip = $("sync");
    chip.className = "chip";
    var txt;
    if (net() === "demo") { txt = "מצב ניסיון"; chip.className = "chip warn"; }
    else if (state.pending.length) {
      if (state.net === "offline") { txt = "אין חיבור, יישלח בהמשך"; chip.className = "chip warn"; }
      else if (state.net === "error") { txt = "ממתין לשליחה"; chip.className = "chip warn"; }
      else { txt = "שומר"; }
    }
    else if (state.net === "error") { txt = "אין חיבור לגיליון"; chip.className = "chip warn"; }
    else if (state.lastSync) { txt = "מסונכרן " + pad(state.lastSync.getHours()) + ":" + pad(state.lastSync.getMinutes()); }
    else { txt = "טוען"; }
    chip.textContent = txt;
  }

  function pips(m, cls) {
    var box = el("span", cls || "pips");
    for (var j = 0; j < R; j++) {
      box.appendChild(el("i", "c" + (j + 1) + ((m & (1 << j)) ? " on" : "")));
    }
    return box;
  }

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
      b.appendChild(pips(state.me ? mask(state.me, day.k) : 0));
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

    var head = el("div", "day-title");
    head.appendChild(el("h2", "", "יום " + LONG[day.d.getDay()] + ", " + fmt(day.d)));
    var done = pop(m);
    head.appendChild(el("span", done === R ? "prog perfect" : "prog", done === R ? "יום מושלם" : done + " מתוך " + R));
    box.appendChild(head);
    if (future) box.appendChild(el("p", "locked", "היום הזה עוד לא הגיע. אפשר לסמן מהיום הראשון של האתגר."));

    var list = el("div", "rules");
    C.RULES.forEach(function (r, idx) {
      var on = !!(m & (1 << idx));
      var b = el("button", "rule c" + (idx + 1) + (on ? " on" : ""));
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
    $("groupHint").textContent = "הנקודות של " + fmt(day.d);
    var rows = C.PEOPLE.map(function (p, idx) { var s = stats(p); s.p = p; s.idx = idx; return s; });
    rows.sort(function (a, b) { return b.total - a.total || b.perfect - a.perfect || a.idx - b.idx; });
    var top = rows[0] ? rows[0].total : 0;
    rows.forEach(function (s, place) {
      var row = el("div", "p" + (s.p === state.me ? " me" : "") + (top > 0 && s.total === top ? " lead" : ""));
      row.appendChild(el("span", "rank", String(place + 1)));
      var nm = el("div", "nm", s.p + " ");
      nm.appendChild(el("em", "", s.perfect + (s.perfect === 1 ? " יום מושלם" : " מושלמים") + ", רצף " + s.streak));
      row.appendChild(nm);
      var meter = el("div", "meter");
      var bar = el("span", "bar");
      var fill = document.createElement("i");
      fill.style.width = (s.total / (N * R) * 100) + "%";
      bar.appendChild(fill);
      meter.appendChild(bar);
      var m = mask(s.p, day.k);
      var dots = pips(m, "dots");
      dots.setAttribute("aria-label", pop(m) + " מתוך " + R + " ב" + fmt(day.d));
      meter.appendChild(dots);
      row.appendChild(meter);
      var sc = el("div", "score", String(s.total));
      sc.appendChild(el("small", "", " /" + N * R));
      row.appendChild(sc);
      box.appendChild(row);
    });
  }

  function renderFeed() {
    var box = $("feed");
    box.textContent = "";
    var items = state.log.filter(function (e) {
      return e && C.PEOPLE.indexOf(e.p) >= 0 && e.r >= 0 && e.r < R;
    }).slice(0, FEED_SHOWN);
    $("feedHint").textContent = items.length ? "העדכונים האחרונים" : "";
    if (!items.length) {
      box.appendChild(el("p", "empty", "עוד אין פעילות. הסימון הראשון שלכם יופיע כאן."));
      return;
    }
    var todayKey = keyOf(new Date());
    items.forEach(function (e) {
      var row = el("div", "ev c" + (e.r + 1) + (e.v ? "" : " off"));
      var mk = el("span", "mk");
      mk.appendChild(e.v ? checkSvg() : undoSvg());
      row.appendChild(mk);
      var what = el("div", "what");
      what.appendChild(el("b", "", e.p));
      what.appendChild(el("span", "rl", ": " + C.RULES[e.r].label));
      if (e.d && e.d !== todayKey && byKey[e.d]) what.appendChild(el("span", "day", ", " + fmt(byKey[e.d].d)));
      if (!e.v) what.appendChild(el("span", "", " בוטל"));
      row.appendChild(what);
      var tm = el("time", "", ago(e.t));
      if (e.t) tm.setAttribute("datetime", e.t);
      row.appendChild(tm);
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
    box.appendChild(el("b", "", "להוסיף למסך הבית"));
    if (deferredPrompt) {
      var btn = el("button", "act", "התקנה");
      btn.type = "button";
      btn.addEventListener("click", function () { deferredPrompt.prompt(); deferredPrompt = null; renderInstall(); });
      box.appendChild(btn);
    } else if (ios) {
      box.appendChild(el("p", "", "בספארי: כפתור השיתוף, ואז הוספה למסך הבית."));
    } else {
      box.appendChild(el("p", "", "בכרום: תפריט שלוש הנקודות, ואז התקנת אפליקציה."));
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
    C.PEOPLE.forEach(function (p, idx) {
      var b = el("button", "pick c" + (idx % 7 + 1), p);
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
    pk.hidden = !!state.me;
  }

  function renderAll() {
    ti = calcTi();
    renderHero();
    renderStrip();
    renderToday();
    renderBoard();
    renderFeed();
    renderInstall();
  }

  // ---- סימון ושמירה ----
  function toggle(k, idx) {
    if (!state.me) return;
    var day = byKey[k];
    if (!day || day.i > ti) return;
    var m = mask(state.me, k) ^ (1 << idx);
    setMark(state.me, k, m);

    var found = false;
    state.pending.forEach(function (it) { if (it.p === state.me && it.d === k) { it.m = m; found = true; } });
    if (!found) state.pending.push({ p: state.me, d: k, m: m });
    save("pending", state.pending);

    // רשומה מקומית מיידית לפיד, כדי שלא צריך לחכות לסבב מול הגיליון.
    state.log.unshift({ t: new Date().toISOString(), p: state.me, d: k, r: idx, v: (m & (1 << idx)) ? 1 : 0 });
    state.log = state.log.slice(0, 40);
    save("log", state.log);
    writeSeq++;

    if (navigator.vibrate) { try { navigator.vibrate(15); } catch (e) {} }
    renderAll();
    sync();
  }

  // writeSeq עולה בכל כתיבה. משיכה שהתחילה לפני כתיבה ומגיעה אחריה נזרקת,
  // אחרת תשובה ישנה מהגיליון דורסת סימון טרי.
  var writeSeq = 0;
  var flushing = false;
  var pulling = false;
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
        writeSeq++;
        if (!j.ok) throw new Error(j.error || "save failed");
      }
      state.net = "ok";
      state.lastSync = new Date();
    } catch (e) {
      state.net = navigator.onLine === false ? "offline" : "error";
    } finally {
      flushing = false;
      renderHero();
    }
  }

  async function pull() {
    if (!API || pulling) return true;
    pulling = true;
    var seq = writeSeq;
    var applied = false;
    try {
      var r = await fetch(API + (API.indexOf("?") >= 0 ? "&" : "?") + "t=" + Date.now());
      var j = await r.json();
      if (!j.ok) throw new Error("bad response");
      if (seq !== writeSeq) return false;
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
      if (j.log) {
        state.log = j.log.slice(0, 40);
        save("log", state.log);
      }
      state.net = "ok";
      state.lastSync = new Date();
      applied = true;
    } catch (e) {
      state.net = navigator.onLine === false ? "offline" : "error";
      applied = true;
    } finally {
      pulling = false;
      renderAll();
    }
    return applied;
  }

  // אם המשיכה נזרקה כי סימנו באמצע, מושכים שוב פעם אחת.
  function sync() {
    return flush().then(pull).then(function (applied) { return applied === false ? pull() : applied; });
  }

  $("change").addEventListener("click", function () { state.me = null; renderPicker(); $("picker").hidden = false; });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) { renderAll(); sync(); } });
  window.addEventListener("online", sync);
  window.addEventListener("focus", sync);
  setInterval(function () { if (!document.hidden) sync(); }, 20000);
  setInterval(function () { if (!document.hidden) renderFeed(); }, 60000);

  renderPicker();
  renderAll();
  sync();

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
