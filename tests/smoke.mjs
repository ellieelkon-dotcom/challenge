// בדיקת עשן: מריצה את האפליקציה ב-jsdom עם שעון מדומה ושרת מדומה.
// הרצה:  npm install jsdom  &&  node tests/smoke.mjs
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";

const APP = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FAKE_NOW = "2026-12-03T10:00:00"; // יום 5 מתוך 14
const API = "https://script.test/exec";

let fails = 0;
function ok(cond, msg) {
  console.log((cond ? "PASS  " : "FAIL  ") + msg);
  if (!cond) fails++;
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const read = (f) => fs.readFileSync(path.join(APP, f), "utf8");

async function boot({ apiUrl, fetchImpl }) {
  const html = read("index.html")
    .replace(/<link rel="stylesheet"[^>]*>/g, "")
    .replace(/<script src="config.js"><\/script>/, "")
    .replace(/<script src="app.js"><\/script>/, "");
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://example.test/challenge/",
    pretendToBeVisual: true,
  });
  const w = dom.window;
  w.eval(`(function(){
    const RealDate = Date;
    const FIXED = RealDate.parse(${JSON.stringify(FAKE_NOW)});
    class FakeDate extends RealDate {
      constructor(...a){ if (a.length === 0) super(FIXED); else super(...a); }
      static now(){ return FIXED; }
    }
    window.Date = FakeDate;
  })();`);
  w.fetch = fetchImpl;
  w.navigator.vibrate = () => true;
  w.eval(read("config.js").replace(/API_URL:\s*"[^"]*"/, "API_URL: " + JSON.stringify(apiUrl)));
  w.eval(read("app.js"));
  await tick(60);
  return dom;
}

// ---------- שרת מדומה: upsert + יומן, כמו Code.gs ----------
function makeServer() {
  const rows = []; // {p,d,m}
  const log = [];  // {t,p,d,r,v} מהחדש לישן
  const calls = [];
  let failNext = false;
  let getDelay = 0;
  const fetchImpl = (url, opts) => {
    const isPost = !!(opts && opts.method === "POST");
    calls.push({
      url: String(url),
      method: isPost ? "POST" : "GET",
      ct: isPost ? opts.headers["Content-Type"] : null,
      body: isPost ? opts.body : null,
    });
    if (failNext) return Promise.reject(new Error("network down"));
    if (isPost) {
      const b = JSON.parse(opts.body);
      const i = rows.findIndex((r) => r.p === b.p && r.d === b.d);
      const before = i >= 0 ? rows[i].m : 0;
      if (i >= 0) rows[i] = b; else rows.push(b);
      const diff = before ^ b.m;
      for (let bit = 0; bit < 5; bit++) {
        if (diff & (1 << bit)) log.unshift({ t: new Date(FAKE_NOW).toISOString(), p: b.p, d: b.d, r: bit, v: b.m & (1 << bit) ? 1 : 0 });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    }
    const snapshot = { ok: true, marks: rows.map((r) => ({ ...r })), log: log.slice(0, 40) };
    if (getDelay) return new Promise((res) => setTimeout(() => res({ ok: true, json: () => Promise.resolve(snapshot) }), getDelay));
    return Promise.resolve({ ok: true, json: () => Promise.resolve(snapshot) });
  };
  return { rows, log, calls, fetchImpl, setFail: (v) => { failNext = v; }, setGetDelay: (v) => { getDelay = v; } };
}

// =================== מבחן 1: זרימה מלאה מול API מדומה ===================
{
  const srv = makeServer();
  const dom = await boot({ apiUrl: API, fetchImpl: srv.fetchImpl });
  const w = dom.window, doc = w.document;

  ok(!doc.getElementById("picker").hidden, "מסך פתיחה נפתח כשאין שם שמור");
  const picks = [...doc.querySelectorAll("#picks .pick")];
  ok(picks.length === 7, "7 שמות במסך הבחירה (נמצאו " + picks.length + ")");
  ok(picks.map((b) => b.textContent).join(",") === "אלי,רון,ליאל,נועה,איתי,ורד,קובי", "השמות נכונים ובסדר");

  picks.find((b) => b.textContent === "רון").click();
  await tick(80);
  ok(doc.getElementById("picker").hidden, "מסך הפתיחה נסגר אחרי בחירה");
  ok(doc.getElementById("me").textContent === "רון", "השם הנבחר מוצג בכותרת");
  ok(JSON.parse(w.localStorage.getItem("challenge14:me")) === "רון", "השם נשמר ב-localStorage");

  const dayBtns = [...doc.querySelectorAll("#strip .d")];
  ok(dayBtns.length === 14, "14 ימים בפס הימים");
  const enabled = dayBtns.filter((b) => !b.disabled).length;
  ok(enabled === 5, "ימים שעברו + היום פתוחים לסימון (5), והשאר נעולים (נמצאו " + enabled + ")");
  ok(dayBtns[4].classList.contains("today"), "היום הנוכחי מסומן כ'היום' (אינדקס 4 = 03.12)");
  ok(dayBtns[13].disabled === true, "יום עתידי נעול");
  ok(doc.getElementById("title").textContent === "יום 5 מתוך 14", "כותרת: יום 5 מתוך 14");
  ok(dayBtns[0].querySelectorAll(".pips i").length === 5, "לכל יום 5 מחווני כללים");

  const rules = [...doc.querySelectorAll("#today .rule")];
  ok(rules.length === 5, "5 כפתורי מתג ליום הנבחר");
  ok(rules.every((b) => b.getAttribute("role") === "switch" && b.getAttribute("aria-checked") === "false"), "נגישות: role=switch ו-aria-checked");
  ok(rules.every((b, i) => b.classList.contains("c" + (i + 1))), "לכל כלל צבע משלו");

  ok(doc.querySelector("#feed .empty") !== null, "פיד ריק מציג הזמנה לפעולה");

  rules[0].click();
  await tick(120);
  ok(doc.querySelectorAll("#today .rule.on").length === 1, "סימון כלל אחד נדלק מיד");
  const firstPost = srv.calls.filter((c) => c.method === "POST").pop();
  ok(!!firstPost, "נשלח POST ל-API");
  ok(firstPost.ct === "text/plain;charset=utf-8", "Content-Type הוא text/plain (בלי preflight)");
  ok(JSON.stringify(JSON.parse(firstPost.body)) === JSON.stringify({ p: "רון", d: "2026-12-03", m: 1 }), "גוף הבקשה {p,d,m} נכון: " + firstPost.body);

  const ev = doc.querySelector("#feed .ev");
  ok(!!ev, "הפיד מציג רשומה אחרי סימון");
  ok(ev.querySelector(".rl").textContent.indexOf("צעדים") >= 0, "הפיד מציג את שם הכלל: " + (ev && ev.querySelector(".rl").textContent));
  ok(ev.querySelector("b").textContent === "רון", "הפיד מציג את מי שסימן: " + ev.querySelector("b").textContent);
  ok(ev.querySelector("time").textContent === "עכשיו", "הפיד מציג זמן יחסי: " + ev.querySelector("time").textContent);
  ok(ev.classList.contains("c1"), "לרשומת הפיד צבע הכלל");

  for (let i = 1; i < 5; i++) { doc.querySelectorAll("#today .rule")[i].click(); await tick(50); }
  await tick(120);
  ok(srv.rows.length === 1 && srv.rows[0].m === 31, "השרת המדומה מחזיק מסכה 31 (יום מושלם)");
  ok(JSON.parse(w.localStorage.getItem("challenge14:pending")).length === 0, "התור התרוקן אחרי שליחה");
  ok(doc.querySelector("#today .prog").textContent === "יום מושלם", "מוצג 'יום מושלם'");
  ok(srv.log.length === 5, "היומן בשרת קיבל 5 רשומות (" + srv.log.length + ")");
  ok(doc.querySelectorAll("#feed .ev").length === 5, "הפיד מציג 5 רשומות");
  ok(doc.querySelector("#feed .ev .rl").textContent.indexOf("קריאה") >= 0, "הפיד מסודר מהחדש לישן: " + doc.querySelector("#feed .ev .rl").textContent);

  // ביטול סימון
  doc.querySelectorAll("#today .rule")[4].click();
  await tick(140);
  const offEv = doc.querySelector("#feed .ev");
  ok(offEv.classList.contains("off"), "ביטול סימון מסומן אחרת בפיד");
  ok(offEv.textContent.indexOf("בוטל") >= 0, "הפיד אומר שהסימון בוטל");
  doc.querySelectorAll("#today .rule")[4].click();
  await tick(140);

  const rows = [...doc.querySelectorAll("#board .p")];
  ok(rows.length === 7, "לוח קבוצה עם 7 משתתפים");
  const mine = rows.find((r) => r.classList.contains("me"));
  ok(!!mine && mine.querySelector(".nm").textContent.indexOf("רון") === 0, "השורה שלי מודגשת");
  ok(mine.querySelector(".score").textContent === "5 /70", "ניקוד: 5 מתוך 70 (" + mine.querySelector(".score").textContent + ")");
  ok(mine.querySelector(".nm em").textContent === "1 יום מושלם, רצף 1", "ימים מושלמים ורצף: " + mine.querySelector(".nm em").textContent);
  ok(rows[0] === mine, "המוביל ראשון בלוח");
  ok(rows[0].querySelector(".rank").textContent === "1", "דירוג מוצג");
  ok(rows[0].classList.contains("lead"), "המוביל מסומן");
  ok(mine.querySelectorAll(".dots i.on").length === 5, "5 נקודות דולקות ביום הנבחר");
  ok(doc.getElementById("sync").textContent.indexOf("מסונכרן") === 0, "אינדיקטור סנכרון: " + doc.getElementById("sync").textContent);
  ok(doc.getElementById("tally").textContent.indexOf("5 סימונים מתוך 70") === 0, "סיכום בכותרת: " + doc.getElementById("tally").textContent);

  // יום שעבר: סימון חלקי, בדיקת רצף
  dayBtns[3].click(); await tick(40);
  doc.querySelectorAll("#today .rule")[0].click(); await tick(140);
  const mine2 = [...doc.querySelectorAll("#board .p")].find((r) => r.classList.contains("me"));
  ok(mine2.querySelector(".score").textContent === "6 /70", "אחרי סימון ביום שעבר: 6 מתוך 70");
  ok(mine2.querySelector(".nm em").textContent === "1 יום מושלם, רצף 1", "רצף לא נשבר בגלל יום חלקי לפני: " + mine2.querySelector(".nm em").textContent);
  ok(doc.querySelector("#feed .ev .day").textContent.indexOf("2.12") >= 0, "הפיד מציין יום שאינו היום: " + doc.querySelector("#feed .ev .day").textContent);

  // =================== מבחן 2: מצב לא מחובר ותור ===================
  srv.setFail(true);
  dayBtns[2].click(); await tick(40);
  doc.querySelectorAll("#today .rule")[1].click();
  await tick(160);
  const pend = JSON.parse(w.localStorage.getItem("challenge14:pending"));
  ok(pend.length === 1 && pend[0].d === "2026-12-01" && pend[0].m === 2, "בלי חיבור: הסימון נשמר בתור " + JSON.stringify(pend));
  ok(JSON.parse(w.localStorage.getItem("challenge14:marks")).רון["2026-12-01"] === 2, "הסימון נשמר מקומית מיד גם בלי חיבור");
  ok(doc.getElementById("sync").textContent === "ממתין לשליחה", "אינדיקטור מציג המתנה: " + doc.getElementById("sync").textContent);
  ok(doc.querySelector("#feed .ev .rl").textContent.indexOf("אימון") >= 0, "בלי חיבור הפיד מתעדכן מקומית");

  srv.setFail(false);
  w.dispatchEvent(new w.Event("online"));
  await tick(250);
  ok(JSON.parse(w.localStorage.getItem("challenge14:pending")).length === 0, "כשחזר חיבור התור נשלח והתרוקן");
  const saved = srv.rows.find((r) => r.d === "2026-12-01");
  ok(!!saved && saved.m === 2, "הפריט מהתור הגיע לשרת: " + JSON.stringify(saved));

  // משיכה בפוקוס
  const before = srv.calls.filter((c) => c.method === "GET").length;
  w.dispatchEvent(new w.Event("focus"));
  await tick(150);
  ok(srv.calls.filter((c) => c.method === "GET").length > before, "פוקוס מפעיל משיכת נתונים");

  // נתוני משתתף אחר מהשרת
  srv.rows.push({ p: "נועה", d: "2026-12-02", m: 31 });
  srv.log.unshift({ t: new Date(FAKE_NOW).toISOString(), p: "נועה", d: "2026-12-02", r: 3, v: 1 });
  w.dispatchEvent(new w.Event("focus"));
  await tick(180);
  const noa = [...doc.querySelectorAll("#board .p")].find((r) => r.querySelector(".nm").textContent.indexOf("נועה") === 0);
  ok(noa.querySelector(".score").textContent === "5 /70", "נתונים של משתתף אחר נמשכו ומוצגים: " + noa.querySelector(".score").textContent);
  ok(doc.querySelector("#feed .ev").textContent.indexOf("נועה") >= 0, "הפיד מציג פעילות של אחרים: " + doc.querySelector("#feed .ev").textContent.trim());

  // מרוץ: משיכה איטית שיצאה לפני הסימון לא דורסת אותו
  srv.setGetDelay(400);
  dayBtns[4].click();
  await tick(60);
  w.dispatchEvent(new w.Event("focus"));   // מתחילה משיכה איטית
  await tick(80);
  doc.querySelectorAll("#today .rule")[2].click(); // סימון באמצע המשיכה
  await tick(1400);
  srv.setGetDelay(0);
  ok(JSON.parse(w.localStorage.getItem("challenge14:marks")).רון["2026-12-03"] === 27, "מרוץ: הסימון שנעשה באמצע משיכה לא נדרס (" + JSON.parse(w.localStorage.getItem("challenge14:marks")).רון["2026-12-03"] + ")");
  ok(doc.querySelectorAll("#today .rule.on").length === 4, "מרוץ: המסך מציג את המצב הנכון");
  ok(doc.querySelector("#feed .ev .rl").textContent.indexOf("סוכר מעובד") >= 0, "מרוץ: הפיד שומר על הרשומה החדשה: " + doc.querySelector("#feed .ev .rl").textContent);

  // החלפת שם
  doc.getElementById("change").click();
  await tick(40);
  ok(!doc.getElementById("picker").hidden, "כפתור החלפת שם פותח שוב את מסך הבחירה");

  dom.window.close();
}

// =================== מבחן 3: מצב ניסיון (API_URL ריק) ===================
{
  let called = 0;
  const dom = await boot({ apiUrl: "", fetchImpl: () => { called++; return Promise.reject(new Error("should not be called")); } });
  const w = dom.window, doc = w.document;
  [...doc.querySelectorAll("#picks .pick")].find((b) => b.textContent === "אלי").click();
  await tick(60);
  doc.querySelectorAll("#today .rule")[0].click();
  await tick(100);
  ok(called === 0, "מצב ניסיון: לא נשלחת אף בקשה לרשת");
  ok(doc.getElementById("sync").textContent === "מצב ניסיון", "אינדיקטור מצב ניסיון: " + doc.getElementById("sync").textContent);
  ok(JSON.parse(w.localStorage.getItem("challenge14:marks")).אלי["2026-12-03"] === 1, "מצב ניסיון: הסימון נשמר מקומית");
  ok(doc.querySelectorAll("#feed .ev").length === 1, "מצב ניסיון: הפיד עובד מקומית");
  dom.window.close();
}

console.log(fails ? "\n" + fails + " בדיקות נכשלו" : "\nכל הבדיקות עברו");
process.exit(fails ? 1 : 0);
