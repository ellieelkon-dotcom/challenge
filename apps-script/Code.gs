// Google Apps Script: שומר את הסימונים בלשונית "נתונים" של הגיליון.
// הרשימה חייבת להיות זהה ל-PEOPLE בקובץ config.js.
var PEOPLE = ["אלי", "רון", "ליאל", "נועה", "איתי", "ורד", "קובי"];
var SHEET_NAME = "נתונים";

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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function dateKey_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(v);
}

function doGet() {
  var rows = getSheet_().getDataRange().getValues().slice(1);
  var marks = [];
  rows.forEach(function (r) {
    if (r[0] && PEOPLE.indexOf(String(r[0])) >= 0) {
      marks.push({ p: String(r[0]), d: dateKey_(r[1]), m: Number(r[2]) || 0 });
    }
  });
  return json_({ ok: true, marks: marks });
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
    var row = -1;
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === p && dateKey_(values[i][1]) === d) { row = i + 1; break; }
    }
    if (row < 0) row = sh.getLastRow() + 1;
    sh.getRange(row, 1, 1, 2).setNumberFormat("@");
    sh.getRange(row, 1, 1, 4).setValues([[p, d, m, new Date()]]);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}
