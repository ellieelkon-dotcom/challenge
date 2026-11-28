// Google Apps Script: שומר את הסימונים בלשונית "נתונים" ואת ההיסטוריה בלשונית "יומן".
// הרשימה חייבת להיות זהה ל-PEOPLE בקובץ config.js.
var PEOPLE = ["אלי", "רון", "ליאל", "נועה", "איתי", "ורד", "קובי", "רוני"];
var SHEET_NAME = "נתונים";
var LOG_NAME = "יומן";
var LOG_LIMIT = 40; // כמה שינויים אחרונים doGet מחזיר לפיד הפעילות
var RULE_COUNT = 5;
// אזור זמן קבוע, כדי שחותמות הזמן ביומן יהיו שעון ישראל בלי תלות
// בהגדרת אזור הזמן של הפרויקט ב-Apps Script.
var TZ = "Asia/Jerusalem";

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(["שם", "תאריך", "מסכה", "עודכן"]);
    sh.getRange("A:B").setNumberFormat("@");
    sh.setFrozenRows(1);
  }
  return sh;
}

function getLog_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LOG_NAME);
  if (!sh) {
    sh = ss.insertSheet(LOG_NAME);
    sh.appendRow(["זמן", "שם", "תאריך", "כלל", "מצב"]);
    sh.getRange("A:E").setNumberFormat("@");
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function dateKey_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
  }
  return String(v);
}

function stamp_() {
  return Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function doGet() {
  var rows = getSheet_().getDataRange().getValues().slice(1);
  var marks = [];
  rows.forEach(function (r) {
    if (r[0] && PEOPLE.indexOf(String(r[0])) >= 0) {
      marks.push({ p: String(r[0]), d: dateKey_(r[1]), m: Number(r[2]) || 0 });
    }
  });

  var lg = getLog_();
  var last = lg.getLastRow();
  var log = [];
  if (last > 1) {
    var n = Math.min(LOG_LIMIT, last - 1);
    var vals = lg.getRange(last - n + 1, 1, n, 5).getValues();
    for (var i = vals.length - 1; i >= 0; i--) {
      var e = vals[i];
      if (!e[1] || PEOPLE.indexOf(String(e[1])) < 0) continue;
      log.push({ t: String(e[0]), p: String(e[1]), d: dateKey_(e[2]), r: Number(e[3]) || 0, v: Number(e[4]) ? 1 : 0 });
    }
  }
  return json_({ ok: true, marks: marks, log: log });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var body = JSON.parse(e.postData.contents);
    var p = String(body.p), d = String(body.d), m = Number(body.m);
    if (PEOPLE.indexOf(p) < 0) return json_({ ok: false, error: "unknown person" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return json_({ ok: false, error: "bad date" });
    if (!(m >= 0 && m <= 31) || Math.floor(m) !== m) return json_({ ok: false, error: "bad mask" });

    var sh = getSheet_();
    var values = sh.getDataRange().getValues();
    var row = -1, before = 0;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === p && dateKey_(values[i][1]) === d) {
        row = i + 1;
        before = Number(values[i][2]) || 0;
        break;
      }
    }
    if (row < 0) row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 2).setNumberFormat("@");
    sh.getRange(row, 1, 1, 4).setValues([[p, d, m, new Date()]]);

    // יומן: שורה לכל כלל שהשתנה, כדי שפיד הפעילות יראה מי סימן מה ומתי.
    var diff = before ^ m;
    if (diff) {
      var t = stamp_();
      var entries = [];
      for (var b = 0; b < RULE_COUNT; b++) {
        if (diff & (1 << b)) entries.push([t, p, d, String(b), (m & (1 << b)) ? "1" : "0"]);
      }
      if (entries.length) {
        var lg = getLog_();
        var at = lg.getLastRow() + 1;
        var rng = lg.getRange(at, 1, entries.length, 5);
        rng.setNumberFormat("@");
        rng.setValues(entries);
      }
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
