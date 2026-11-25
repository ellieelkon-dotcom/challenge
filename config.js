// הגדרות האתגר. את הכתובת של הסקריפט (API_URL) מדביקים פעם אחת, אחרי שמפעילים את apps-script/Code.gs.
window.CHALLENGE_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbzWVg9cYzlb-TBZQ7R_6dWgCUnsyL6ynoMOwaGGmSxRQ0u7XDjqLcYbMVVvRXO1hykL/exec",
  START: "2026-11-29",
  DAYS: 14,
  PEOPLE: ["אלי", "רון", "ליאל", "נועה", "איתי", "ורד", "קובי"],
  RULES: [
    { big: "10K", label: "צעדים", sub: "10,000 ביום" },
    { big: "40-60", label: "אימון", sub: "דקות, כל יום" },
    { big: "0", label: "סוכר מעובד", sub: "בכלל" },
    { big: "3L", label: "מים", sub: "לפחות, כל יום" },
    { big: "10", label: "קריאה", sub: "דקות מספר, כל יום" }
  ]
};
