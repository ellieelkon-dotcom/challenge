import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "/tmp/claude-0/-home-user-challenge/23b6bb80-f2f6-5292-ace8-42ed16c9108e/scratchpad/test/node_modules/jsdom/lib/api.js";

const APP = "/home/user/challenge";
const FAKE_NOW = "2026-12-03T10:00:00"; // יום 5 מתוך 14
const API = "https://script.test/exec";

let fails = 0;
function ok(cond, msg) {
  console.log((cond ? "PASS  " : "FAIL  ") + msg);
  if (!cond) fails++;
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));

function read(f) { return fs.readFileSync(path.join(APP, f), "utf8"); }

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
  w.eval(read("config.js").replace('API_URL: ""', 'API_URL: ' + JSON.stringify(apiUrl)));
  w.eval(read("app.js"));
  await tick(60);
  return dom;
}

// ---------- שרת מדומה ----------
function makeServer() {
  const rows = []; // {p,d,m}
  const calls = [];
  let failNext = false;
  const fetchImpl = (url, opts) => {
    const isPost = !!(opts && opts.method === "POST");
    calls.push({ url: String(url), method: isPost ? "POST" : "GET", ct: isPost ? opts.headers["Content-Type"] : null, body: isPost ? opts.body : null });
    if (failNext) return Promise.reject(new Error("network down"));
    if (isPost) {
      const b = JSON.parse(opts.body);
      const i = rows.findIndex((r) => r.p === b.p && r.d === b.d);
      if (i >= 0) rows[i] = b; else rows.push(b);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, marks: rows.map((r) => ({ ...r })) }) });
  };
  return { rows, calls, fetchImpl, setFail: (v) => { failNext = v; } };
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

  const ron = picks.find((b) => b.textContent === "רון");
  ron.click();
  await tick(60);
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

  const rules = [...doc.querySelectorAll("#today .rule")];
  ok(rules.length === 5, "5 כפתורי מתג ליום הנבחר");
  ok(rules.every((b) => b.getAttribute("role") === "switch" && b.getAttribute("aria-checked") === "false"), "נגישות: role=switch ו-aria-checked");

  rules[0].click();
  await tick(60);
  ok(doc.querySelectorAll("#today .rule.on").length === 1, "סימון כלל אחד נדלק מיד");
  const firstPost = srv.calls.filter((c) => c.method === "POST").pop();
  ok(!!firstPost, "נשלח POST ל-API");
  ok(firstPost.ct === "text/plain;charset=utf-8", "Content-Type הוא text/plain (בלי preflight)");
  ok(JSON.stringify(JSON.parse(firstPost.body)) === JSON.stringify({ p: "רון", d: "2026-12-03", m: 1 }), "גוף הבקשה {p,d,m} נכון: " + firstPost.body);

  for (let i = 1; i < 5; i++) { doc.querySelectorAll("#today .rule")[i].click(); await tick(40); }
  await tick(80);
  ok(srv.rows.length === 1 && srv.rows[0].m === 31, "השרת המדומה מחזיק מסכה 31 (יום מושלם)");
  ok(JSON.parse(w.localStorage.getItem("challenge14:pending")).length === 0, "התור התרוקן אחרי שליחה");
  ok(doc.querySelector("#today .prog").textContent === "יום מושלם", "מוצג 'יום מושלם'");

  const rows = [...doc.querySelectorAll("#board .p")];
  ok(rows.length === 7, "לוח קבוצה עם 7 משתתפים");
  const mine = rows.find((r) => r.classList.contains("me"));
  ok(!!mine && mine.querySelector(".nm").textContent.indexOf("רון") === 0, "השורה שלי מודגשת");
  ok(mine.querySelector(".score").textContent === "5 /70", "ניקוד: 5 מתוך 70 (" + mine.querySelector(".score").textContent + ")");
  ok(mine.querySelector(".sub").textContent === "ימים מושלמים 1 · רצף 1", "ימים מושלמים ורצף: " + mine.querySelector(".sub").textContent);
  ok(rows[0] === mine, "המוביל ראשון בלוח");
  ok(mine.querySelectorAll(".dots i.on").length === 5, "5 נקודות דולקות ביום הנבחר");
  ok(doc.getElementById("sync").textContent.indexOf("מסונכרן") === 0, "אינדיקטור סנכרון: " + doc.getElementById("sync").textContent);

  // יום שעבר: סימון חלקי, בדיקת רצף
  dayBtns[3].click(); await tick(40);
  doc.querySelectorAll("#today .rule")[0].click(); await tick(80);
  const mine2 = [...doc.querySelectorAll("#board .p")].find((r) => r.classList.contains("me"));
  ok(mine2.querySelector(".score").textContent === "6 /70", "אחרי סימון ביום שעבר: 6 מתוך 70");
  ok(mine2.querySelector(".sub").textContent === "ימים מושלמים 1 · רצף 1", "רצף לא נשבר בגלל יום חלקי לפני: " + mine2.querySelector(".sub").textContent);

  // =================== מבחן 2: מצב לא מחובר ותור ===================
  srv.setFail(true);
  dayBtns[2].click(); await tick(40);
  doc.querySelectorAll("#today .rule")[1].click();
  await tick(120);
  const pend = JSON.parse(w.localStorage.getItem("challenge14:pending"));
  ok(pend.length === 1 && pend[0].d === "2026-12-01" && pend[0].m === 2, "בלי חיבור: הסימון נשמר בתור " + JSON.stringify(pend));
  ok(JSON.parse(w.localStorage.getItem("challenge14:marks")).רון["2026-12-01"] === 2, "הסימון נשמר מקומית מיד גם בלי חיבור");
  ok(doc.getElementById("sync").textContent === "ממתין לשליחה, ננסה שוב", "אינדיקטור מציג מצב המתנה: " + doc.getElementById("sync").textContent);

  srv.setFail(false);
  w.dispatchEvent(new w.Event("online"));
  await tick(200);
  ok(JSON.parse(w.localStorage.getItem("challenge14:pending")).length === 0, "כשחזר חיבור התור נשלח והתרוקן");
  const saved = srv.rows.find((r) => r.d === "2026-12-01");
  ok(!!saved && saved.m === 2, "הפריט מהתור הגיע לשרת: " + JSON.stringify(saved));

  // משיכה בפוקוס
  const before = srv.calls.filter((c) => c.method === "GET").length;
  w.dispatchEvent(new w.Event("focus"));
  await tick(120);
  ok(srv.calls.filter((c) => c.method === "GET").length > before, "פוקוס מפעיל משיכת נתונים");

  // נתוני משתתף אחר מהשרת
  srv.rows.push({ p: "נועה", d: "2026-12-02", m: 31 });
  w.dispatchEvent(new w.Event("focus"));
  await tick(150);
  const noa = [...doc.querySelectorAll("#board .p")].find((r) => r.querySelector(".nm").textContent.indexOf("נועה") === 0);
  ok(noa.querySelector(".score").textContent === "5 /70", "נתונים של משתתף אחר נמשכו ומוצגים: " + noa.querySelector(".score").textContent);

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
  await tick(80);
  ok(called === 0, "מצב ניסיון: לא נשלחת אף בקשה לרשת");
  ok(doc.getElementById("sync").textContent === "מצב ניסיון, נשמר רק בטלפון הזה", "אינדיקטור מצב ניסיון: " + doc.getElementById("sync").textContent);
  ok(JSON.parse(w.localStorage.getItem("challenge14:marks")).אלי["2026-12-03"] === 1, "מצב ניסיון: הסימון נשמר מקומית");
  dom.window.close();
}

console.log(fails ? "\n" + fails + " בדיקות נכשלו" : "\nכל הבדיקות עברו");
process.exit(fails ? 1 : 0);
