/* ============================================================
   מנוע הטיולים — הנתונים לא נמצאים כאן
   כל טיול הוא קובץ נתונים ב-trips/<מזהה>/trip.json, והרשימה של כולם
   ב-trips/index.json. הקובץ הזה רק מרנדר את מה שנטען, כך שטיול חדש הוא
   קובץ חדש ולא שינוי בקוד.

   קריאות הרשת: קובץ הטיול עצמו, ותחזית מזג האוויר (Open-Meteo, בלי מפתח
   API). חוץ מזה אין קריאות אחרי הטעינה הראשונה — קישורי מפות/וויז נפתחים
   בחוץ, וה-Service Worker מגיש הכול מהמטמון כשאין קליטה.
   ============================================================ */

// הטיול הפעיל. מתמלא ב-loadTrip() לפני הרינדור הראשון, כך שכל פונקציות
// הרינדור שלמטה ממשיכות לקרוא את אותם שמות שהיו כאן כשהנתונים היו בקוד.
let TRIP = null;        // { start, end, base, flightIn, flightOut }
let DAYS = [];          // היומן עצמו
let CHECKLIST = [];     // רשימת לפני-הטיול
let GENERAL_TIPS = [];  // "כדאי לדעת"
let PODCASTS = {};      // פרקים לפי אזור
let TRIP_INDEX = [];    // רשימת כל הטיולים, מ-trips/index.json
let TRIP_ID = null;     // מזהה הטיול הפעיל — גם שם התיקייה וגם מרחב השמות באחסון

/* ============================================================
   אייקונים (SVG קווי, יורשים צבע מהטקסט הסובב)
   ============================================================ */
const ICON = {
  clock: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>`,
  calendar: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>`,
  info: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><path d="M12 7.5h.01"/></svg>`,
  pin: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.5 7-11.5A7 7 0 0 0 5 9.5C5 14.5 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>`,
  link: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14 20 4"/><path d="M20 4h-5"/><path d="M20 4v5"/><path d="M20 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5"/></svg>`,
  camera: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1-2h7l1 2h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="13" r="3.3"/></svg>`,
  route: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a4 4 0 0 0 4-4v-1a4 4 0 0 0-4-4H9a4 4 0 0 1-4-4v-.5"/></svg>`,
  car: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16V11.5l1.7-4A2 2 0 0 1 7.6 6h8.8a2 2 0 0 1 1.9 1.5l1.7 4V16"/><path d="M4 16h16"/><path d="M4 16v2.2c0 .44.36.8.8.8H6a1 1 0 0 0 1-1V16"/><path d="M17 16v2.2c0 .44.36.8.8.8H19a1 1 0 0 0 1-1V16"/><circle cx="7.5" cy="13" r="1"/><circle cx="16.5" cy="13" r="1"/></svg>`,
  hotel: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v15"/><path d="M14 21v-9a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v9"/><path d="M4 21h16"/><path d="M7 8h1M7 11h1M7 14h1"/></svg>`,
  bulb: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45.9 1.15.9 1.9V16h5.2v-.2c0-.75.3-1.45.9-1.9A6 6 0 0 0 12 3Z"/></svg>`,
  warn: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 4.4 2.6 18a1.6 1.6 0 0 0 1.4 2.4h16a1.6 1.6 0 0 0 1.4-2.4L13.7 4.4a1.6 1.6 0 0 0-2.8 0Z"/></svg>`,
  tree: `<svg class="icon icon-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 7 10h2.5L6 16h4.5v5h3v-5H18l-3.5-6H17L12 3Z"/></svg>`,
  chevron: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>`,
  ticket: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1.3a1.7 1.7 0 0 0 0 3.4V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1.3a1.7 1.7 0 0 0 0-3.4Z"/><path d="M9 7.5v9" stroke-dasharray="2.2 2.2"/></svg>`,
  target: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`,
  cloud: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .5-7.97A5.5 5.5 0 0 0 7.1 9.5 4 4 0 0 0 7 18Z"/></svg>`,
  refresh: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.6"/><path d="M4 4v4.6h4.6"/><path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.4"/><path d="M20 20v-4.6h-4.6"/></svg>`,
  drop: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/></svg>`,
  waze: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 4 10 7-10 7 2.5-7L9 4Z" stroke-linejoin="round"/></svg>`,
  plus: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>`,
  trash: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M9.5 7V5.5a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9L17.5 7"/></svg>`,
  upload: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V9"/><path d="m8 13 4-4 4 4"/><path d="M5 4h14"/></svg>`,
  download: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M5 20h14"/></svg>`,
  pencil: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/></svg>`,
  swap: `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h13"/><path d="m14 5 3 3-3 3"/><path d="M20 16H7"/><path d="m10 13-3 3 3 3"/></svg>`,
  lock: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10" width="15" height="10" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/></svg>`,
  headphones: `<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h2.5a1 1 0 0 1 1 1v3.5a1 1 0 0 1-1 1H5.5A1.5 1.5 0 0 1 4 18Z"/><path d="M20 14h-2.5a1 1 0 0 0-1 1v3.5a1 1 0 0 0 1 1h1a1.5 1.5 0 0 0 1.5-1.5Z"/></svg>`
};

function mapLink(address) {
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
}

function wazeLink(address) {
  return "https://waze.com/ul?q=" + encodeURIComponent(address) + "&navigate=yes";
}

// תחזית Google לאותו יישוב — כרטיס מזג האוויר של גוגל, לצד התחזית שבאפליקציה.
function googleWeatherLink(place) {
  return "https://www.google.com/search?q=" + encodeURIComponent("weather " + place);
}

function commonsFileUrl(filename) {
  return "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(filename);
}

// מרחק קו-אווירי בק"מ בין שתי נקודות {lat,lng} (נוסחת Haversine) — לא זמן נסיעה.
function haversineKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function formatDistance(km) {
  if (km == null) return "";
  return (km < 10 ? km.toFixed(1) : Math.round(km)) + ' ק"מ';
}

const HEB_WEEKDAYS = ["יום ראשון", "יום שני", "יום שלישי", "יום רביעי", "יום חמישי", "יום שישי", "שבת"];

/* ============================================================
   פודקאסטים לילדים — פרק לכל אזור פעילות, להאזנה בדרך לשם.
   הטבלה עצמה יושבת ב-trip.json של הטיול תחת podcasts, וקבצי ה-m4a
   בתיקיית audio/ של אותו טיול.
   minutes = אורך הפרק בדקות — המספר הזה מוצג למשתמש על שם המקום.
   בלוק מקבל פרק דרך השדה area, וכמה בלוקים באותו אזור חולקים פרק אחד
   (מגלשת Hasenhorn, המפלים והגשר התלוי הם כולם "טודנאו").

   rev: חשוב — אם מחליפים קובץ פרק שכבר הועלה פעם, צריך להעלות את המספר
   הזה ב-1. הפרקים נשמרים במטמון לפי כתובת, אז בלי זה מכשיר שכבר הוריד את
   הפרק ימשיך לנגן את הגרסה הישנה לנצח (בדיוק כמו CACHE ב-sw.js).

   ready: האם קובץ ה-m4a באמת נמצא. פרק בלי ready לא מקבל אוזניות על שם
   המקום ולא נגן — עדיף שלא יהיה כפתור מאשר כפתור שמוביל להודעה שהפרק עוד
   לא הועלה.
   ============================================================ */

/* ============================================================
   טעינת טיולים ואחסון מקומי
   כל מה שנשמר במכשיר יושב תחת מרחב שמות של הטיול ("tp:<מזהה>:..."),
   כדי שסימוני צ'ק-ליסט ומיקומי האזנה של טיול אחד לא ידרסו את של השני.
   מצב שמשותף לכל הטיולים (הלשונית האחרונה, מהירות ההשמעה) יושב תחת "tp:".
   ============================================================ */

const STORE_PREFIX = "tp:";

// חותמת גרסה, מוצגת בלשונית "מידע". מעלים אותה בכל דחיפה — כשמישהו אומר
// "אצלי זה לא עובד", זו הדרך לדעת אם הוא בכלל מריץ את הקוד הנוכחי.
const APP_BUILD = "2026-09-12.9";

// ה-Service Worker מגיש את המעטפת מהמטמון ומעדכן ברקע; כשהוא מגלה שהקוד
// השתנה, הדף הזה כבר רץ עם הישן — אז הוא שולח הודעה ומציעים רענון.
// המאזין נרשם כאן, לפני כל await: ברשת מהירה העדכון ברקע מסתיים לפני
// ש-init() בכלל מגיע לרישום מאוחר יותר, וההודעה הייתה הולכת לאיבוד.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", e => {
    if (e.data && e.data.type === "shell-updated") showUpdateToast();
  });
}

function globalKey(name) { return STORE_PREFIX + name; }
function tripKey(name) { return `${STORE_PREFIX}${TRIP_ID}:${name}`; }

// localStorage זורק כשהמכסה מלאה או כשהאחסון חסום — אף אחת מהקריאות כאן
// לא קריטית מספיק כדי להפיל את האפליקציה בגללה.
function storeGet(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
}

function storeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* מכסת אחסון */ }
}

// נכסי הטיול (תמונות, פרקים) יושבים בתיקייה שלו, והנתיבים בקובץ הטיול
// יחסיים אליה — כך שאותו קובץ עובד לכל טיול בלי נתיבים מוחלטים.
function tripAsset(path) {
  return `trips/${TRIP_ID}/${path}`;
}

/* מעבר חד-פעמי מהמפתחות של הגרסה שבה היה טיול אחד מוטמע בקוד ("bf2026-*").
   בלי זה, מי שכבר סימן צ'ק-ליסט או האזין לחצי פרק היה מאבד את זה בשדרוג. */
function migrateLegacyStorage() {
  if (storeGet(globalKey("migrated-bf2026"))) return;
  const move = (from, to) => {
    try {
      const raw = localStorage.getItem(from);
      if (raw != null && localStorage.getItem(to) == null) localStorage.setItem(to, raw);
      localStorage.removeItem(from);
    } catch { /* התעלמות */ }
  };
  move("bf2026-checklist", `${STORE_PREFIX}black-forest-2026:checklist`);
  move("bf2026-pod-pos", `${STORE_PREFIX}black-forest-2026:pod-pos`);
  move("bf2026-pod-rate", globalKey("pod-rate"));
  move("bf2026-lasttab", globalKey("lasttab"));
  // הכרטיס האדום ירד מהאפליקציה — המפתחות שלו כבר לא נקראים בשום מקום.
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith("bf2026-"))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* התעלמות */ }
  storeSet(globalKey("migrated-bf2026"), true);
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

/* איזה טיול לפתוח: מה שנבחר בפעם הקודמת, אחרת הטיול שהיום נמצא בתוכו,
   אחרת הטיול הקרוב שעוד לא התחיל, ואם הכול מאחורינו — האחרון שהיה. */
function pickDefaultTrip(index) {
  const saved = storeGet(globalKey("active-trip"));
  if (saved && index.some(t => t.id === saved)) return saved;

  const today = localDateStr(new Date());
  const current = index.find(t => t.start <= today && today <= t.end);
  if (current) return current.id;

  const upcoming = index.filter(t => t.start > today).sort((a, b) => a.start.localeCompare(b.start));
  if (upcoming.length) return upcoming[0].id;

  const past = index.filter(t => t.end < today).sort((a, b) => b.end.localeCompare(a.end));
  return past.length ? past[0].id : (index[0] && index[0].id) || null;
}

// טעינת קובץ טיול והצבתו במשתנים שכל פונקציות הרינדור קוראות.
async function loadTrip(id) {
  // טיוטה מקומית גוברת על מה שפורסם: מה שנערך נראה מיד באפליקציה עצמה,
  // עוד לפני שנפתח עליו Pull Request. טיול שנוצר כאן קיים רק כטיוטה.
  const draft = edReadDraft(id);
  const trip = draft ? draft.trip : await fetchJSON(`trips/${id}/trip.json`);
  TRIP_ID = id;
  TRIP = {
    title: trip.title,
    subtitle: trip.subtitle || "",
    start: trip.start,
    end: trip.end,
    base: trip.base,
    flightIn: trip.flightIn || null,
    flightOut: trip.flightOut || null
  };
  DAYS = trip.days || [];
  CHECKLIST = trip.checklist || [];
  GENERAL_TIPS = trip.tips || [];
  PODCASTS = trip.podcasts || {};
  markPodcastLeads();

  WX.cacheKey = tripKey("weather");
  WX.store = null;
  WX.status = "idle";

  storeSet(globalKey("active-trip"), id);
  setTripChrome(trip);
  return trip;
}

// כותרת הסרגל העליון וכותרת הדף — לפי הטיול שנטען, לא לפי index.html.
function setTripChrome(trip) {
  $("#topbarTitle").textContent = trip.title;
  $("#topbarSub").textContent = trip.subtitle || "";
  $("#topbarIcon").innerHTML = ICON[trip.icon] || ICON.tree;
  document.title = trip.subtitle ? `${trip.title} · ${trip.subtitle}` : trip.title;
}

/* ============================================================
   פונקציות עזר לרינדור
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function hebWeekday(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return HEB_WEEKDAYS[d.getDay()];
}

const HEB_MONTHS = ["בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני",
                    "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"];

function dayMonth(dateStr) {
  const day = Number(dateStr.slice(8, 10));
  return `${day} ${HEB_MONTHS[Number(dateStr.slice(5, 7)) - 1]}`;
}

function localDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function timeLabel(block) {
  if (block.start && block.end) return `${block.approx ? "~" : ""}${block.start}–${block.end}`;
  if (block.start) return `${block.approx ? "~" : ""}${block.start}`;
  return "";
}

function chipsHTML(block) {
  const chips = [];
  if (block.price) chips.push(`<span class="chip">${escapeHTML(block.price)}</span>`);
  if (block.hours) chips.push(`<span class="chip">${ICON.clock} ${escapeHTML(block.hours)}</span>`);
  if (block.address) chips.push(`<a class="chip map" href="${mapLink(block.address)}" target="_blank" rel="noopener">${ICON.pin} מפה</a>`);
  if (block.address) chips.push(`<a class="chip waze" href="${wazeLink(block.address)}" target="_blank" rel="noopener">${ICON.waze} Waze</a>`);
  if (block.infoUrl) chips.push(`<a class="chip info" href="${escapeHTML(block.infoUrl)}" target="_blank" rel="noopener">${ICON.link} מידע נוסף</a>`);
  if (!chips.length) return "";
  return `<div class="chips">${chips.join("")}</div>`;
}

/* ============================================================
   נגן הפודקאסטים לילדים
   שם המקום עצמו הוא הקישור — לחיצה עליו פותחת נגן מתחתיו.
   יש אלמנט <audio> אחד לכל האפליקציה, שנודד לפאנל הפתוח. זה מה שמאפשר
   ל-renderNow() לרוץ כל דקה בלי לקטוע פרק באמצע: הוצאת האלמנט מה-DOM
   לא עוצרת השמעה, כל עוד מחזיקים בהפניה אליו.
   ============================================================ */

const POD = { key: null, id: null, audio: null, pendingUrls: {} };
// איפה עצרנו בכל פרק — לכל טיול בנפרד. מהירות ההשמעה משותפת לכולם.
const POD_RATES = [1, 1.25, 1.5, 1.75];

// פרק שהקובץ שלו עוד לא נמצא ב-audio/ לא קיים מבחינת הממשק — ראו ready למעלה.
function podReady(area) {
  const pod = PODCASTS[area];
  return pod && pod.ready ? pod : null;
}

/* הפרק נתלה רק על התחנה הראשונה של האזור באותו יום. יום טודנאו, למשל, הוא
   שלוש תחנות שחולקות פרק אחד — הקישור מופיע על מגלשת Hasenhorn בלבד, ולא
   שוב על המפלים ועל הגשר התלוי. הסימון נעשה פעם אחת בטעינה, לפי סדר
   הבלוקים ביום, כך שאגם טיטיזי שמופיע בשני ימים מקבל קישור בכל אחד מהם.
   נקראת מ-loadTrip() אחרי שהיומן נטען — לא בזמן טעינת הקובץ, כי אז DAYS
   עוד ריק. */
function markPodcastLeads() {
  for (const day of DAYS) {
    const seen = new Set();
    for (const b of day.blocks) {
      if (!b.area || !podReady(b.area) || seen.has(b.area)) continue;
      seen.add(b.area);
      b.podLead = true;
      // מפתח ייחודי למופע הזה של הפרק. אגם טיטיזי מופיע פעמיים (20.8 ו-23.8),
      // ובלשונית "מסלול" כל הימים מרונדרים יחד — בלי התאריך במפתח, לחיצה על
      // הכרטיס של 23.8 פתחה את הנגן בתוך הכרטיס של 20.8, כי החיפוש מחזיר את
      // ההתאמה הראשונה, והכרטיס שנלחץ נשאר ריק ומוסתר.
      b.podKey = `${day.date}:${b.area}`;
    }
  }
}

// המפתח הוא "תאריך:אזור", והאזור הוא מה שמופיע בטבלת PODCASTS.
function podAreaOf(key) {
  return key ? key.slice(key.indexOf(":") + 1) : null;
}

function podcastFor(block) {
  return block && block.podLead ? podReady(block.area) : null;
}

// הכתובת שממנה מנגנים ושלפיה נשמר המטמון — כולל מספר הגרסה של הפרק.
function podUrl(pod) {
  return `${tripAsset(pod.file)}?v=${pod.rev || 1}`;
}

function podLoadPos() {
  try { return JSON.parse(localStorage.getItem(tripKey("pod-pos"))) || {}; } catch { return {}; }
}

function podSavePos(id, seconds) {
  const all = podLoadPos();
  all[id] = Math.floor(seconds);
  try { localStorage.setItem(tripKey("pod-pos"), JSON.stringify(all)); } catch { /* התעלמות */ }
}

function podLoadRate() {
  const r = parseFloat(localStorage.getItem(globalKey("pod-rate")));
  return POD_RATES.includes(r) ? r : 1;
}

function podSaveRate(rate) {
  try { localStorage.setItem(globalKey("pod-rate"), String(rate)); } catch { /* התעלמות */ }
}

/* חשוב ששני השדות ייקבעו יחד: לפי התקן, טעינת מקור חדש מאפסת את
   playbackRate לערך של defaultPlaybackRate. קביעת playbackRate לבדה הייתה
   חוזרת ל-1× בכל מעבר בין פרקים. */
function podApplyRate(rate) {
  const el = POD.audio;
  if (!el) return;
  el.defaultPlaybackRate = rate;
  el.playbackRate = rate;
}

/* כפתורי המהירות הם של האפליקציה ולא של הדפדפן, בכוונה. הפקדים המובנים של
   <audio> מקצצים כפתורים כשהנגן צר, ומהירות ההשמעה יושבת אצלם בתפריט
   שלוש הנקודות — זה שנעלם ראשון. ברשימת "המשך היום" הנגן צר ב-76 פיקסלים
   מכרטיס מלא (עמודת השעה), כך שאותו פרק קיבל תפריט מהירות בכרטיס הנוכחי
   ולא קיבל אותו ברשימה. בספארי של האייפון אין תפריט כזה בכלל. */
function podRatesHTML() {
  const cur = podLoadRate();
  const btns = POD_RATES.map(r => {
    const on = r === cur;
    return `<button type="button" class="pod-rate${on ? " on" : ""}" data-pod-rate="${r}"`
      + ` aria-pressed="${on}" aria-label="מהירות ${r}">${r}×</button>`;
  }).join("");
  return `<div class="pod-rates" role="group" aria-label="מהירות השמעה">`
    + `<span class="pod-rates-label">מהירות</span>${btns}</div>`;
}

// כותרת המקום כקישור לפרק. extraHTML נשאר בתוך הכותרת (למשל התחזית המוטבעת).
function podTitleHTML(block, extraHTML = "") {
  const pod = podcastFor(block);
  const title = escapeHTML(block.title);
  if (!pod) return title + extraHTML;
  const label = escapeHTML(`האזנה לפרק הפודקאסט על ${pod.title}, ${pod.minutes} דקות`);
  return `<button type="button" class="pod-title" data-pod="${block.podKey}" aria-expanded="false" aria-label="${label}">`
    + `<span class="pod-title-text">${title}</span>`
    + `<span class="pod-cue">${ICON.headphones}${pod.minutes} דק׳</span>`
    + `</button>${extraHTML}`;
}

function podPanelHTML(block) {
  if (!podcastFor(block)) return "";
  return `<div class="pod-panel" data-pod-panel="${block.podKey}" hidden></div>`;
}

function podEnsureAudio() {
  if (POD.audio) return POD.audio;
  const el = document.createElement("audio");
  el.className = "pod-audio";
  el.controls = true;
  el.preload = "metadata";
  el.addEventListener("timeupdate", () => {
    if (POD.id && el.currentTime > 0) podSavePos(POD.id, el.currentTime);
  });
  el.addEventListener("ended", () => { if (POD.id) podSavePos(POD.id, 0); });
  el.addEventListener("error", podShowMissing);
  // רשת ביטחון: יש דפדפנים שמאפסים את המהירות בטעינת מקור חדש גם כש-
  // defaultPlaybackRate נקבע מראש.
  el.addEventListener("loadedmetadata", () => podApplyRate(podLoadRate()));
  POD.audio = el;
  podApplyRate(podLoadRate());
  return el;
}

function podSetMediaSession(pod) {
  if (!("mediaSession" in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: pod.title,
      artist: "פודקאסט לילדים",
      album: TRIP.title,
      artwork: [{ src: "icons/icon-512.png", sizes: "512x512", type: "image/png" }]
    });
  } catch { /* התעלמות — אין תמיכה */ }
}

// מעביר את הנגן לפאנל הפתוח ומסנכרן את כל הכותרות. נקרא אחרי כל רינדור.
function podMount() {
  const audio = POD.key ? podEnsureAudio() : POD.audio;
  if (audio && audio.parentNode) audio.parentNode.removeChild(audio);
  $$(".pod-panel").forEach(p => { p.innerHTML = ""; p.hidden = true; });
  $$(".pod-title").forEach(b => b.setAttribute("aria-expanded", String(!!POD.key && b.dataset.pod === POD.key)));
  if (!POD.key) return;

  const pod = PODCASTS[POD.id];
  // אותו בלוק מרונדר גם ב"עכשיו" וגם ב"מסלול" — מעדיפים את התצוגה הפעילה.
  const target = $(`.view.active .pod-panel[data-pod-panel="${POD.key}"]`)
    || $(`.pod-panel[data-pod-panel="${POD.key}"]`);
  if (!target) return;

  target.innerHTML = `<div class="pod-head">${ICON.headphones}<strong>${escapeHTML(pod.title)}</strong>`
    + `<span class="pod-note">פרק לילדים · ${pod.minutes} דק׳</span></div>`;
  target.appendChild(audio);
  target.insertAdjacentHTML("beforeend", podRatesHTML());
  target.hidden = false;
}

function podShowMissing() {
  const target = $(`.pod-panel[data-pod-panel="${POD.key}"]:not([hidden])`);
  if (!target || target.querySelector(".pod-missing")) return;
  const note = document.createElement("div");
  note.className = "pod-missing";
  note.innerHTML = `${ICON.warn}<span>הפרק הזה עוד לא הועלה לאפליקציה — ההוראות ליצירה שלו ב-NotebookLM נמצאות בתיקייה podcast-scripts.</span>`;
  target.appendChild(note);
}

/* פרק שנבחר בעורך ועוד לא פורסם קיים רק כקובץ במכשיר, ולכן הכתובת
   בתיקיית הטיול עוד לא קיימת — מנגנים אותו ישירות מהמחסן המקומי, כדי
   שאפשר יהיה לשמוע אותו במקום לפני שפותחים עליו Pull Request. */
async function podPendingUrl(pod) {
  if (!pod.pending) return null;
  if (POD.pendingUrls[pod.file]) return POD.pendingUrls[pod.file];
  const blob = await edAssetGet(TRIP_ID, pod.file);
  if (!blob) return null;
  POD.pendingUrls[pod.file] = URL.createObjectURL(blob);
  return POD.pendingUrls[pod.file];
}

async function podOpen(key) {
  const id = podAreaOf(key);
  const pod = podReady(id);
  if (!pod) return;
  const el = podEnsureAudio();
  const pendingUrl = await podPendingUrl(pod);
  // מעבר בין שני המופעים של אותו פרק (טיטיזי ב-20.8 וב-23.8) רק מזיז את
  // הנגן לכרטיס השני — אותו קובץ, אותו מיקום, בלי לטעון מחדש.
  if (POD.id !== id) {
    el.pause();
    POD.id = id;
    el.src = pendingUrl || podUrl(pod);
    const pos = podLoadPos()[id] || 0;
    if (pos > 0) {
      el.addEventListener("loadedmetadata", function seek() {
        el.removeEventListener("loadedmetadata", seek);
        // לא ממשיכים מ-5 השניות האחרונות — עדיף להתחיל מחדש
        if (isFinite(el.duration) && pos < el.duration - 5) el.currentTime = pos;
      });
    }
    podSetMediaSession(pod);
  }
  POD.key = key;
  podApplyRate(podLoadRate());
  podMount();
  el.play().catch(() => { /* אם הדפדפן חסם — יש כפתור ניגון בנגן עצמו */ });
}

function podClose() {
  if (POD.audio) POD.audio.pause();
  POD.key = null;
  POD.id = null;
  podMount();
}

function podToggle(key) {
  if (POD.key === key) podClose(); else podOpen(key);
}

function tipsHTML(block) {
  if (!block.tips || !block.tips.length) return "";
  return block.tips.map(t => `<div class="tip ${t.warn ? "warn" : ""}">${t.warn ? ICON.warn : ICON.bulb}<span>${escapeHTML(t.text)}</span></div>`).join("");
}

function legHTML(drive) {
  if (!drive) return "";
  const dist = drive.dist ? ` · ${escapeHTML(drive.dist)}` : "";
  return `<div class="leg">${ICON.car}<span>${escapeHTML(drive.time)}${dist} ${escapeHTML(drive.from)}</span></div>`;
}

function imageHTML(image) {
  if (!image) return "";
  const credit = image.credit
    ? `<a class="stop-credit" href="${commonsFileUrl(image.commonsFile)}" target="_blank" rel="noopener">${ICON.camera} ${escapeHTML(image.credit)} · ${escapeHTML(image.license)}, ויקישיתוף</a>`
    : "";
  // תמונה שנבחרה בעורך ועוד לא פורסמה מוצגת ישירות מוויקישיתוף; אחרי
  // הפרסום היא כבר קובץ בתיקיית הטיול ונטענת מקומית, גם בלי קליטה.
  const src = image.pending && image.thumb ? image.thumb : tripAsset(image.file);
  return `<img class="stop-img" src="${src}" alt="" loading="lazy" onerror="this.style.display='none'">${credit}`;
}

// בלוק "תחנה" מלא — עם תמונה, כתובת, זמן נסיעה, תחזית וכל השאר.
function stopCardHTML(day, block) {
  return `
    <div class="stop">
      ${imageHTML(block.image)}
      <div class="stop-body">
        ${timeLabel(block) ? `<div class="stop-time">${timeLabel(block)}</div>` : ""}
        <h3>${podTitleHTML(block)}</h3>
        ${podPanelHTML(block)}
        ${weatherHTML(day, block)}
        <p>${escapeHTML(block.desc)}</p>
        ${chipsHTML(block)}
        ${tipsHTML(block)}
      </div>
    </div>
  `;
}

// בלוק מידע נלווה (בלי כתובת/מפה/תמונה משלו).
// גם בלוק כזה יכול לשאת פרק: יום בפארק כולו בלוקים בלי כתובת, ופרק
// הפתיחה על האזור נתלה על "סיבוב היכרות בפארק".
function infoItemHTML(day, block) {
  return `
    <div class="timeline-item">
      <div class="time">${timeLabel(block)}</div>
      <div class="body">
        <h3>${podTitleHTML(block)}</h3>
        ${podPanelHTML(block)}
        <p>${escapeHTML(block.desc)}</p>
        ${chipsHTML(block)}
        ${tipsHTML(block)}
      </div>
    </div>
  `;
}

function dayStopsHTML(day) {
  let html = "";
  for (const b of day.blocks) {
    if (b.address) {
      html += legHTML(b.drive);
      html += stopCardHTML(day, b);
    } else {
      html += infoItemHTML(day, b);
    }
  }
  if (day.returnLeg) {
    html += legHTML(day.returnLeg);
    html += `<div class="leg-end">${ICON.hotel} ${escapeHTML(day.returnLeg.label)}</div>`;
  }
  return html;
}

function dayRouteLink(day) {
  // תחנה שהיא הבסיס עצמו (Aqua Mundo בתוך הפארק, ערב הגעה) לא מצדיקה
  // מסלול — בלעדיה היה נוצר כפתור שמנווט מהפארק אל הפארק.
  const stops = day.blocks.filter(b => b.address && b.address !== TRIP.base.address).map(b => b.address);
  if (!stops.length) return null;
  const full = day.returnLeg
    ? [TRIP.base.address, ...stops, TRIP.base.address]
    : [TRIP.base.address, ...stops];
  const origin = full[0];
  const destination = full[full.length - 1];
  const waypoints = full.slice(1, -1);
  let url = "https://www.google.com/maps/dir/?api=1&travelmode=driving"
    + "&origin=" + encodeURIComponent(origin)
    + "&destination=" + encodeURIComponent(destination);
  if (waypoints.length) url += "&waypoints=" + waypoints.map(encodeURIComponent).join("|");
  return url;
}

function routeButtonHTML(day) {
  const link = dayRouteLink(day);
  if (!link) return "";
  return `<a class="route-btn" href="${link}" target="_blank" rel="noopener">${ICON.route} מסלול הנסיעה של היום ב-Maps</a>`;
}

/* ============================================================
   תצוגת המסלול המלא
   ============================================================ */

// אילו ימים פתוחים כרגע — נשמר כדי שרענון התחזית לא יסגור את מה שהמשתמש פתח.
// null = המשתמש עוד לא נגע, וברירת המחדל (היום פתוח) בתוקף.
let openDays = null;

function renderItinerary() {
  const todayStr = localDateStr(new Date());
  const html = DAYS.map((day, i) => {
    const isToday = day.date === todayStr;
    const isOpen = openDays ? openDays.has(day.date) : isToday;

    return `
      <details class="day" data-date="${day.date}" ${isOpen ? "open" : ""}>
        <summary>
          <span class="day-summary-left">
            <span class="day-date">${hebWeekday(day.date)}, ${dayMonth(day.date)}${isToday ? '<span class="day-today-dot"></span>' : ""}</span>
            <span class="day-title">${escapeHTML(day.title)}</span>
          </span>
          <span class="day-summary-right">
            ${dayWeatherHTML(day)}
            <span class="day-chevron">${ICON.chevron}</span>
          </span>
        </summary>
        <div class="day-body">
          <div class="day-meta">${escapeHTML(day.place)} · ${escapeHTML(day.driveNote)}</div>
          ${routeButtonHTML(day)}
          ${day.dayNote ? `<div class="tip">${ICON.bulb}<span>${escapeHTML(day.dayNote)}</span></div>` : ""}
          ${dayStopsHTML(day)}
        </div>
      </details>
    `;
  }).join("");

  $("#view-itinerary").innerHTML = `
    <div class="view-head">
      <h2 class="mini-list-title" style="margin:0">המסלול המלא</h2>
      <button class="edit-btn" data-edit-current>${ICON.pencil} עריכה</button>
    </div>
    ${html}`;

  // שמירת מצב פתוח/סגור, כדי לשחזר אותו אחרי רינדור מחדש (למשל כשהתחזית מתעדכנת).
  $$("details.day").forEach(el => {
    el.addEventListener("toggle", () => {
      openDays = new Set($$("details.day").filter(d => d.open).map(d => d.dataset.date));
    });
  });

  podMount();
}

/* ============================================================
   תצוגת "עכשיו"
   ============================================================ */

function renderNow() {
  const now = new Date();
  const todayStr = localDateStr(now);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const view = $("#view-now");

  if (todayStr < TRIP.start) {
    const daysToGo = Math.ceil((new Date(TRIP.start + "T00:00:00") - new Date(todayStr + "T00:00:00")) / 86400000);
    const daysLabel = daysToGo === 1 ? "יום אחד" : daysToGo === 2 ? "יומיים" : `${daysToGo} ימים`;
    view.innerHTML = `
      <div class="countdown">
        <div class="num">${daysToGo}</div>
        <div class="label">${daysLabel} עד ${escapeHTML(TRIP.title)}</div>
      </div>
      <div class="card">
        <strong>${escapeHTML(TRIP.base.name)}</strong><br>
        <span style="color:var(--text-muted);font-size:14px">${escapeHTML(TRIP.base.address)}</span>
        <div class="chips">
          <a class="chip map" href="${mapLink(TRIP.base.address)}" target="_blank" rel="noopener">${ICON.pin} מפה</a>
          <a class="chip waze" href="${wazeLink(TRIP.base.address)}" target="_blank" rel="noopener">${ICON.waze} Waze</a>
        </div>
      </div>
      <h2 class="mini-list-title">לפני שנוסעים</h2>
      ${renderChecklistHTML()}
      <button class="route-btn" data-edit-current style="margin-top:16px">${ICON.pencil} עריכת התוכנית</button>
    `;
    bindChecklist();
    return;
  }

  if (todayStr > TRIP.end) {
    const others = TRIP_INDEX.filter(t => t.id !== TRIP_ID).length;
    view.innerHTML = `
      <div class="countdown">
        <div class="num">${ICON.tree}</div>
        <div class="label">הטיול נגמר — מקווים שהיה כיף!</div>
      </div>
      <div class="empty-note">המסלול המלא עדיין כאן, תחת "מסלול", אם בא לכם להיזכר.</div>
      ${others ? `<button class="route-btn" data-open-trips>${ICON.swap} מעבר לטיול אחר</button>` : ""}
    `;
    return;
  }

  const dayIndex = DAYS.findIndex(d => d.date === todayStr);
  const day = DAYS[dayIndex];
  if (!day) {
    view.innerHTML = `<div class="empty-note">לא נמצאה תוכנית להיום — בדקו בלשונית "מסלול".</div>`;
    return;
  }

  // סיווג הבלוקים ל: הסתיים / קורה עכשיו / בקרוב
  const timed = day.blocks.map((b, i) => {
    const s = toMinutes(b.start);
    let e = toMinutes(b.end);
    if (e == null) {
      const next = day.blocks.slice(i + 1).find(nb => toMinutes(nb.start) != null);
      e = next ? toMinutes(next.start) : 23 * 60 + 59;
    }
    return { b, s, e };
  });

  let currentIdx = -1;
  for (let i = 0; i < timed.length; i++) {
    const { s, e } = timed[i];
    if (s == null) continue;
    if (nowMinutes >= s && nowMinutes < e) { currentIdx = i; break; }
  }
  if (currentIdx === -1) {
    const upcoming = timed.findIndex(t => t.s != null && t.s > nowMinutes);
    currentIdx = upcoming;
  }

  const dayNum = dayIndex + 1;
  const heroWx = dayWeatherHTML(day);
  const heroRain = dayRainWindowLabel(day);
  let heroHTML = `
    <div class="hero">
      <p class="hero-eyebrow">יום ${dayNum} מתוך ${DAYS.length} · ${hebWeekday(day.date)}, ${dayMonth(day.date)}</p>
      <h1 class="hero-title">${escapeHTML(day.title)}</h1>
      <p class="hero-sub">${escapeHTML(day.place)} · ${escapeHTML(day.driveNote)}</p>
      ${heroWx ? `<p class="hero-wx">${heroWx}</p>` : ""}
      ${heroRain ? `<div class="wx-day-rain">${ICON.drop} גשם צפוי בשעות הפעילות בין ${heroRain}</div>` : ""}
    </div>
    ${routeButtonHTML(day)}
  `;

  let currentHTML = "";
  if (currentIdx !== -1 && currentIdx < timed.length) {
    const { b, s } = timed[currentIdx];
    const isNow = s != null && nowMinutes >= s;
    currentHTML = `
      <div class="now-current">
        <div class="kicker"><span class="pulse"></span>${isNow ? "עכשיו" : "בקרוב"}${timeLabel(b) ? " · " + timeLabel(b) : ""}</div>
        ${imageHTML(b.image)}
        <h2>${podTitleHTML(b)}</h2>
        ${podPanelHTML(b)}
        ${weatherHTML(day, b)}
        ${!isNow ? legHTML(b.drive) : ""}
        <p>${escapeHTML(b.desc)}</p>
        ${chipsHTML(b)}
        ${tipsHTML(b)}
      </div>
    `;
  } else {
    currentHTML = `
      <div class="now-current">
        <div class="kicker"><span class="pulse"></span>זמן פנוי</div>
        <h2>אין כרגע שום דבר מתוכנן</h2>
        <p>אפשר לבדוק את "המשך היום" למטה, או פשוט ליהנות מהזמן הפנוי.</p>
      </div>
    `;
  }

  const restHTML = timed
    .filter((_, i) => i !== currentIdx)
    .map(({ b, s }) => {
      const isPast = s != null && s < nowMinutes && currentIdx !== -1 && s < timed[currentIdx].s;
      const bw = isPast ? null : blockWeather(day, b);
      const bwHTML = bw
        ? `<span class="wx-inline ${popLevel(bw.pop)}">${weatherEmoji(bw.code)} ${bw.tMin === bw.tMax ? `${bw.tMax}°` : `${bw.tMin}°–${bw.tMax}°`} · ${ICON.drop}${bw.pop}%</span>`
        : "";
      return `
        <div class="timeline-item ${isPast ? "done" : ""}">
          <div class="time">${timeLabel(b)}</div>
          <div class="body">
            ${b.drive && !isPast ? `<div class="leg-hint">${ICON.car} ${escapeHTML(b.drive.time)} ${escapeHTML(b.drive.from)}</div>` : ""}
            <h3>${podTitleHTML(b, bwHTML ? ` ${bwHTML}` : "")}</h3>
            ${podPanelHTML(b)}
            <p>${escapeHTML(b.desc)}</p>
          </div>
        </div>
      `;
    }).join("");

  const returnHTML = (currentIdx === -1 && day.returnLeg)
    ? `${legHTML(day.returnLeg)}<div class="leg-end">${ICON.hotel} ${escapeHTML(day.returnLeg.label)}</div>`
    : "";

  view.innerHTML = `
    ${heroHTML}
    ${currentHTML}
    ${restHTML ? `<h2 class="mini-list-title">המשך היום</h2><div class="card">${restHTML}</div>` : ""}
    ${returnHTML}
    <div class="chips" style="margin-top:16px">
      <a class="chip map" href="${mapLink(TRIP.base.address)}" target="_blank" rel="noopener">${ICON.pin} ${escapeHTML(TRIP.base.name)}</a>
      <a class="chip waze" href="${wazeLink(TRIP.base.address)}" target="_blank" rel="noopener">${ICON.waze} Waze</a>
    </div>
  `;

  podMount();               // מחזיר את הנגן לפאנל שהיה פתוח, בלי לקטוע השמעה
}

/* ============================================================
   תצוגת מידע
   ============================================================ */

function renderChecklistHTML() {
  const done = JSON.parse(localStorage.getItem(tripKey("checklist")) || "{}");
  return `
    <div class="card">
      ${CHECKLIST.map((item, i) => `
        <label class="check-item ${done[i] ? "checked" : ""}" data-idx="${i}">
          <input type="checkbox" ${done[i] ? "checked" : ""}>
          <span>${escapeHTML(item)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function bindChecklist() {
  $$(".check-item").forEach(el => {
    el.addEventListener("change", () => {
      const idx = el.dataset.idx;
      const done = JSON.parse(localStorage.getItem(tripKey("checklist")) || "{}");
      const checked = $("input", el).checked;
      done[idx] = checked;
      localStorage.setItem(tripKey("checklist"), JSON.stringify(done));
      el.classList.toggle("checked", checked);
    });
  });
}

// כותרת מקום הלינה לפי סוגו — לא כל טיול יושב במלון.
const BASE_LABELS = { hotel: "המלון", apartment: "הדירה", house: "הבית", camp: "המחנה" };

// טיסות מוצגות רק אם הן קיימות בקובץ הטיול: לטיול בארץ אין נחיתה והמראה,
// והקוד הישן קרס על TRIP.flightIn.date כשהשדה חסר.
function flightsSectionHTML() {
  const { flightIn, flightOut } = TRIP;
  if (!flightIn && !flightOut) return "";
  const row = (f, label) => f
    ? `<div class="info-row"><span class="k">${label} — ${hebWeekday(f.date)}, ${dayMonth(f.date)}</span><span class="v">${escapeHTML(f.city)}, ${escapeHTML(f.time)}</span></div>`
    : "";
  const note = (flightOut && flightOut.note) || (flightIn && flightIn.note);
  return `
    <div class="info-section">
      <h2>טיסות</h2>
      <div class="card">
        ${row(flightIn, "נחיתה")}
        ${row(flightOut, "טיסת חזרה")}
        ${note ? `<div class="tip">${ICON.bulb}<span>${escapeHTML(note)}</span></div>` : ""}
      </div>
    </div>
  `;
}

function renderInfo() {
  const view = $("#view-info");
  view.innerHTML = `
    <div class="info-section">
      <h2>${BASE_LABELS[TRIP.base.kind] || "מקום הלינה"}</h2>
      <div class="card">
        <div class="info-row"><span class="k">שם</span><span class="v">${escapeHTML(TRIP.base.name)}</span></div>
        <div class="info-row"><span class="k">כתובת</span><span class="v">${escapeHTML(TRIP.base.address)}</span></div>
        <div class="chips">
          <a class="chip map" href="${mapLink(TRIP.base.address)}" target="_blank" rel="noopener">${ICON.pin} פתיחה במפות</a>
          <a class="chip waze" href="${wazeLink(TRIP.base.address)}" target="_blank" rel="noopener">${ICON.waze} Waze</a>
        </div>
      </div>
    </div>

    ${flightsSectionHTML()}

    ${CHECKLIST.length ? `<div class="info-section">
      <h2>לפני שנוסעים</h2>
      ${renderChecklistHTML()}
    </div>` : ""}

    <div class="info-section">
      <h2>על התחזית</h2>
      <div class="card">
        <div class="info-row"><span class="k">מקור</span><span class="v"><a class="plain" href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a></span></div>
        <div class="info-row"><span class="k">רזולוציה</span><span class="v">שעתית, לפי מיקום כל תחנה</span></div>
        <div class="info-row"><span class="k">אופק</span><span class="v">כ-${WX.horizonDays} ימים קדימה</span></div>
        <div class="tip">${ICON.bulb}<span>לכל פעילות מוצגת התחזית לשעות שלה בלבד, לפי הקואורדינטות של אותה תחנה — לכן פלדברג (1,200 מ׳) ורוסט (160 מ׳) מקבלים מספרים שונים לגמרי באותו יום.</span></div>
        <div class="tip">${ICON.bulb}<span>התחזית נמשכת מחדש בפתיחת האפליקציה, בחזרה אליה, בחזרה לרשת, ואוטומטית כשהיא בת יותר מחצי שעה. אפשר גם ללחוץ "רענון". התחזית האחרונה נשמרת במכשיר ומוצגת גם בלי קליטה.</span></div>
        <div class="tip">${ICON.bulb}<span>תחזית ליום 7–8 קדימה היא כיוון כללי, לא הבטחה — ככל שמתקרבים היא מתייצבת. שווה להסתכל שוב בכל בוקר.</span></div>
      </div>
    </div>

    <p class="build-stamp">גרסה ${APP_BUILD} · טיול ${escapeHTML(TRIP_ID)}</p>

    ${GENERAL_TIPS.length ? `<div class="info-section">
      <h2>כדאי לדעת</h2>
      <div class="card">
        ${GENERAL_TIPS.map(t => `<div class="tip">${ICON.bulb}<span>${escapeHTML(t)}</span></div>`).join("")}
      </div>
    </div>` : ""}
  `;
  bindChecklist();
}

/* ============================================================
   תחזית מזג אוויר — לפי השעות והמיקום של כל פעילות
   מקור: Open-Meteo (חינמי, בלי מפתח API). קריאה אחת מביאה תחזית שעתית
   לכל תחנות הטיול ולכל ימי הטיול, ומכאן כל פעילות שולפת רק את השעות שלה
   ורק את הנקודה שלה — לכן פלדברג (1,230 מ׳) ורוסט (160 מ׳) מקבלים מספרים
   שונים לגמרי באותו יום. התחזית נשמרת ב-localStorage כדי שתהיה זמינה גם
   בלי קליטה, ומתרעננת אוטומטית כשהיא מתיישנת (WX.maxAgeMs).
   ============================================================ */

const WX = {
  api: "https://api.open-meteo.com/v1/forecast",
  cacheKey: null,             // נקבע ב-loadTrip() לפי הטיול הפעיל
  maxAgeMs: 30 * 60 * 1000,   // אחרי חצי שעה התחזית נחשבת מיושנת ונמשכת מחדש
  horizonDays: 15,            // Open-Meteo נותן תחזית עד ~16 יום קדימה
  store: null,                // { fetchedAt, range, byPoint }
  status: "idle",             // idle | loading | ok | error | out-of-range
  listeners: []
};

const WEATHER_EMOJI = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌦️",
  56: "🌧️", 57: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  66: "🌧️", 67: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️", 77: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "⛈️",
  85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️"
};
const WEATHER_LABEL_HE = {
  0: "בהיר", 1: "בהיר בעיקר", 2: "מעונן חלקית", 3: "מעונן",
  45: "ערפילי", 48: "ערפילי (כפור)",
  51: "טפטוף קל", 53: "טפטוף", 55: "טפטוף חזק",
  56: "טפטוף קופא", 57: "טפטוף קופא חזק",
  61: "גשם קל", 63: "גשם", 65: "גשם חזק",
  66: "גשם קופא", 67: "גשם קופא חזק",
  71: "שלג קל", 73: "שלג", 75: "שלג כבד", 77: "גרגירי שלג",
  80: "ממטרים קלים", 81: "ממטרים", 82: "ממטרים חזקים",
  85: "ממטרי שלג", 86: "ממטרי שלג כבדים",
  95: "סופת רעמים", 96: "סופת רעמים עם ברד", 99: "סופת רעמים עם ברד כבד"
};

// דירוג חומרה — כשפעילות פרושה על כמה שעות, מציגים את המצב הגרוע ביותר
// שבהן ולא את הראשון. הסדר לא זהה לסדר המספרי של הקודים (ערפל למשל
// פחות חמור מטפטוף, למרות שהקוד שלו גבוה יותר).
const WEATHER_RANK = {
  0: 0, 1: 1, 2: 2, 3: 3,
  45: 4, 48: 4,
  51: 5, 53: 6, 55: 7, 56: 6, 57: 7,
  61: 8, 63: 9, 65: 10, 66: 9, 67: 10,
  71: 8, 73: 9, 75: 10, 77: 8,
  80: 8, 81: 9, 82: 11,
  85: 9, 86: 10,
  95: 12, 96: 13, 99: 13
};

function weatherEmoji(code) { return WEATHER_EMOJI[code] || "🌡️"; }
function weatherLabelHe(code) { return WEATHER_LABEL_HE[code] || ""; }
function weatherRank(code) { return WEATHER_RANK[code] != null ? WEATHER_RANK[code] : 0; }

function minutesAgoLabel(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "עודכן לפני רגע";
  if (mins === 1) return "עודכן לפני דקה";
  if (mins < 60) return `עודכן לפני ${mins} דקות`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "עודכן לפני שעה" : `עודכן לפני ${hours} שעות`;
}

function wxPointKey(c) {
  return `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
}

// כל הנקודות שצריך להן תחזית — תחנות הטיול (בלי כפילויות).
function wxPoints() {
  const map = new Map();
  for (const day of DAYS) {
    for (const b of day.blocks) {
      if (!b.coords) continue;
      const key = wxPointKey(b.coords);
      if (!map.has(key)) map.set(key, { key, ...b.coords });
    }
  }
  return Array.from(map.values());
}

// טווח התאריכים שאפשר לבקש עכשיו: החיתוך בין ימי הטיול לבין אופק התחזית.
function wxRange() {
  const now = new Date();
  const today = localDateStr(now);
  const horizon = localDateStr(new Date(now.getTime() + WX.horizonDays * 86400000));
  const start = today > TRIP.start ? today : TRIP.start;
  const end = TRIP.end < horizon ? TRIP.end : horizon;
  if (start > end) return null;   // הטיול נגמר, או שעדיין רחוק מדי לתחזית
  return { start, end };
}

function wxDaysUntilForecast() {
  const today = new Date(localDateStr(new Date()) + "T00:00:00");
  const first = new Date(TRIP.start + "T00:00:00");
  return Math.max(0, Math.ceil((first - today) / 86400000) - WX.horizonDays);
}

function wxLoadCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WX.cacheKey) || "null");
    if (!parsed || !parsed.byPoint || !parsed.fetchedAt) return null;
    return parsed;
  } catch { return null; }
}

function wxSaveCache(store) {
  try { localStorage.setItem(WX.cacheKey, JSON.stringify(store)); } catch { /* מכסת אחסון — לא קריטי */ }
}

function wxIsStale() {
  if (!WX.store) return true;
  const range = wxRange();
  if (!range) return false;
  if (WX.store.range.start !== range.start || WX.store.range.end !== range.end) return true;
  return Date.now() - WX.store.fetchedAt > WX.maxAgeMs;
}

async function wxFetch({ force = false } = {}) {
  const range = wxRange();
  if (!range) { WX.status = "out-of-range"; wxNotify(); return; }
  if (WX.status === "loading") return;
  if (!force && !wxIsStale()) return;
  if (!navigator.onLine) {
    // אין רשת — נשארים עם מה שיש בקאש, בלי להציג שגיאה מיותרת.
    if (!WX.store) { WX.status = "error"; wxNotify(); }
    return;
  }

  const points = wxPoints();
  const params = new URLSearchParams({
    latitude: points.map(p => p.lat).join(","),
    longitude: points.map(p => p.lng).join(","),
    elevation: points.map(p => p.elev).join(","),
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m",
    timezone: "Europe/Berlin",
    start_date: range.start,
    end_date: range.end
  });

  WX.status = "loading";
  wxNotify();

  try {
    const res = await fetch(`${WX.api}?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    const results = Array.isArray(json) ? json : [json];
    if (results.length !== points.length) throw new Error("unexpected response shape");

    const byPoint = {};
    results.forEach((r, i) => { if (r && r.hourly) byPoint[points[i].key] = r.hourly; });

    WX.store = { fetchedAt: Date.now(), range, byPoint };
    WX.status = "ok";
    WX.error = null;
    wxSaveCache(WX.store);
  } catch (err) {
    // נכשל — אם יש תחזית ישנה בקאש ממשיכים להציג אותה.
    WX.status = WX.store ? "ok" : "error";
    WX.error = String(err);
  }
  wxNotify();
}

function wxNotify() {
  WX.listeners.forEach(fn => { try { fn(); } catch { /* התעלמות */ } });
}

/* התחזית של פעילות בודדת: קיצונים על השעות שהיא מתוכננת להן, בנקודה שלה.
   מחזיר null אם אין קואורדינטות, אין שעה, או שהתאריך עוד לא בתוך אופק התחזית. */
function blockWeather(day, block) {
  if (!block || !block.coords || !WX.store) return null;
  const series = WX.store.byPoint[wxPointKey(block.coords)];
  if (!series || !series.time) return null;

  const startMin = toMinutes(block.start);
  if (startMin == null) return null;
  let endMin = toMinutes(block.end);
  if (endMin == null || endMin <= startMin) endMin = startMin + 60;

  const firstHour = Math.floor(startMin / 60);
  const lastHour = Math.min(23, Math.ceil(endMin / 60) - 1);

  const idx = [];
  for (let h = firstHour; h <= lastHour; h++) {
    const i = series.time.indexOf(`${day.date}T${String(h).padStart(2, "0")}:00`);
    if (i !== -1) idx.push(i);
  }
  if (!idx.length) return null;

  const pick = (arr, i) => (arr && arr[i] != null ? arr[i] : null);
  let tMin = Infinity, tMax = -Infinity, feelsMax = -Infinity;
  let pop = 0, mm = 0, wind = 0, worst = null;

  for (const i of idx) {
    const t = pick(series.temperature_2m, i);
    if (t != null) { tMin = Math.min(tMin, t); tMax = Math.max(tMax, t); }
    const f = pick(series.apparent_temperature, i);
    if (f != null) feelsMax = Math.max(feelsMax, f);
    const p = pick(series.precipitation_probability, i);
    if (p != null) pop = Math.max(pop, p);
    const r = pick(series.precipitation, i);
    if (r != null) mm += r;
    const w = pick(series.wind_speed_10m, i);
    if (w != null) wind = Math.max(wind, w);
    const c = pick(series.weather_code, i);
    if (c != null && (worst == null || weatherRank(c) > weatherRank(worst))) worst = c;
  }
  if (tMin === Infinity) return null;

  return {
    tMin: Math.round(tMin),
    tMax: Math.round(tMax),
    feels: feelsMax === -Infinity ? null : Math.round(feelsMax),
    pop: Math.round(pop),
    mm: Math.round(mm * 10) / 10,
    wind: Math.round(wind),
    code: worst,
    firstHour,
    lastHour
  };
}

// סיכום יומי — איחוד של כל הפעילויות של אותו יום, כל אחת בשעות ובמיקום שלה.
function dayWeather(day) {
  const parts = day.blocks.map(b => blockWeather(day, b)).filter(Boolean);
  if (!parts.length) return null;
  return {
    tMin: Math.min(...parts.map(p => p.tMin)),
    tMax: Math.max(...parts.map(p => p.tMax)),
    pop: Math.max(...parts.map(p => p.pop)),
    mm: Math.round(parts.reduce((s, p) => s + p.mm, 0) * 10) / 10,
    code: parts.reduce((worst, p) => (worst == null || weatherRank(p.code) > weatherRank(worst) ? p.code : worst), null)
  };
}

/* חלונות הגשם של היום — אבל רק בשעות שאתם בחוץ, ולפי המיקום שאתם אמורים
   להיות בו באותה שעה. שעה שבה סיכוי הגשם עובר את הסף נחשבת "גשומה";
   רצפים סמוכים (עם פער של שעה אחת לכל היותר) מאוחדים לחלון אחד. */
const RAIN_HOUR_THRESHOLD = 20;

function dayRainWindows(day) {
  if (!WX.store) return [];
  const byHour = new Map();
  for (const b of day.blocks) {
    if (!b.coords) continue;
    const series = WX.store.byPoint[wxPointKey(b.coords)];
    const w = blockWeather(day, b);
    if (!series || !w) continue;
    for (let h = w.firstHour; h <= w.lastHour; h++) {
      const i = series.time.indexOf(`${day.date}T${String(h).padStart(2, "0")}:00`);
      if (i === -1) continue;
      const p = series.precipitation_probability ? series.precipitation_probability[i] : null;
      if (p == null) continue;
      byHour.set(h, Math.max(byHour.get(h) != null ? byHour.get(h) : 0, p));
    }
  }
  if (!byHour.size) return [];

  const hours = Array.from(byHour.keys()).sort((a, b) => a - b);
  const wet = hours.filter(h => byHour.get(h) >= RAIN_HOUR_THRESHOLD);
  const windows = [];
  for (const h of wet) {
    const last = windows[windows.length - 1];
    if (last && h - last[1] <= 2) last[1] = h;
    else windows.push([h, h]);
  }
  return windows;
}

function dayRainWindowLabel(day) {
  const windows = dayRainWindows(day);
  if (!windows.length) return null;
  const fmt = h => String(h).padStart(2, "0") + ":00";
  return windows.map(([a, b]) => (a === b ? fmt(a) : `${fmt(a)}–${fmt(b + 1)}`)).join(" · ");
}

function popLevel(pop) {
  if (pop >= 60) return "high";
  if (pop >= 30) return "mid";
  return "low";
}

// שורת מזג האוויר שמוצגת בתוך כרטיס פעילות.
function weatherHTML(day, block) {
  const w = blockWeather(day, block);
  if (!w) {
    if (!block.coords || !block.start) return "";
    if (WX.status === "loading") return `<div class="wx wx-pending">טוען תחזית…</div>`;
    if (WX.status === "out-of-range") return `<div class="wx wx-pending">התחזית תיפתח בעוד ${wxDaysUntilForecast()} ימים</div>`;
    if (WX.status === "error") return `<div class="wx wx-pending">אין תחזית זמינה כרגע</div>`;
    return "";
  }

  const temp = w.tMin === w.tMax ? `${w.tMax}°` : `${w.tMin}°–${w.tMax}°`;
  const label = weatherLabelHe(w.code);

  const rainWarn = (!block.indoor && w.pop >= 50)
    ? `<div class="wx-warn">${ICON.warn}<span>סיכוי גבוה לגשם בשעות של הפעילות הזו — שווה מעיל/מטרייה, או להחליף עם פעילות מקורה ביום אחר.</span></div>`
    : "";

  return `
    <div class="wx">
      <span class="wx-icon">${weatherEmoji(w.code)}</span>
      <span class="wx-temp">${temp}</span>
      <span class="wx-pop ${popLevel(w.pop)}">${ICON.drop}${w.pop}% גשם</span>
      ${w.mm >= 0.5 ? `<span class="wx-mm">${w.mm} מ"מ</span>` : ""}
      ${label ? `<span class="wx-desc">${escapeHTML(label)}</span>` : ""}
      ${w.wind >= 25 ? `<span class="wx-wind">${w.wind} קמ"ש רוח</span>` : ""}
    </div>
    ${rainWarn}
  `;
}

function dayWeatherHTML(day) {
  const w = dayWeather(day);
  if (!w) return "";
  const temp = w.tMin === w.tMax ? `${w.tMax}°` : `${w.tMin}°–${w.tMax}°`;
  return `<span class="wx-inline ${popLevel(w.pop)}">${weatherEmoji(w.code)} ${temp} · ${ICON.drop}${w.pop}%</span>`;
}

function wxUpdatedLabel() {
  if (WX.status === "out-of-range") return `התחזית נפתחת בעוד ${wxDaysUntilForecast()} ימים`;
  if (!WX.store) return WX.status === "error" ? "לא הצלחנו להביא תחזית" : "אין עדיין תחזית";
  return minutesAgoLabel(WX.store.fetchedAt);
}

function wxBarHTML() {
  const loading = WX.status === "loading";
  return `
    <div class="weather-updated">
      <span>${loading ? "מרענן…" : escapeHTML(wxUpdatedLabel())}</span>
      <button class="weather-refresh-btn" id="weather-refresh" ${loading ? "disabled" : ""}>${ICON.refresh}${loading ? "מרענן…" : "רענון"}</button>
    </div>
  `;
}

function bindWxRefresh() {
  const btn = $("#weather-refresh");
  if (btn) btn.addEventListener("click", () => wxFetch({ force: true }));
}

/* ============================================================
   תצוגת מזג אוויר — כל ימי הטיול, פעילות אחרי פעילות
   ============================================================ */

function weatherDayCardHTML(day) {
  const todayStr = localDateStr(new Date());
  const isToday = day.date === todayStr;
  const dw = dayWeather(day);
  const rain = dayRainWindowLabel(day);

  const rows = day.blocks.map(b => {
    if (!b.coords || !b.start) return "";
    const w = blockWeather(day, b);
    const right = w
      ? `<span class="wx-act-temp">${w.tMin === w.tMax ? `${w.tMax}°` : `${w.tMin}°–${w.tMax}°`}</span>
         <span class="wx-pop ${popLevel(w.pop)}">${ICON.drop}${w.pop}%</span>`
      : `<span class="wx-act-none">—</span>`;
    return `
      <div class="wx-act">
        <span class="wx-act-icon">${w ? weatherEmoji(w.code) : "🌡️"}</span>
        <span class="wx-act-body">
          <span class="wx-act-title">
            <strong><bdi>${escapeHTML(b.title)}</bdi></strong>
            ${b.wxPlace ? `<a class="wx-act-link" href="${googleWeatherLink(b.wxPlace)}" target="_blank" rel="noopener" title="${escapeHTML("תחזית Google עבור " + b.wxPlace)}">${ICON.link} Google</a>` : ""}
          </span>
          <span class="wx-act-meta">
            <span class="wx-act-when">${escapeHTML(timeLabel(b))}${w && weatherLabelHe(w.code) ? " · " + escapeHTML(weatherLabelHe(w.code)) : ""}</span>
            ${right}
          </span>
        </span>
      </div>
    `;
  }).join("");

  return `
    <div class="card wx-day-card ${isToday ? "today" : ""}">
      <div class="wx-day-head">
        <div class="wx-day-date">
          ${isToday ? "היום" : escapeHTML(hebWeekday(day.date).replace("יום ", ""))}
          <span>${dayMonth(day.date)} · ${escapeHTML(day.title)}</span>
        </div>
        ${dw ? `<div class="wx-day-sum">${weatherEmoji(dw.code)} <strong>${dw.tMin}°–${dw.tMax}°</strong> <span class="wx-pop ${popLevel(dw.pop)}">${ICON.drop}${dw.pop}%</span></div>` : ""}
      </div>
      ${rows || `<div class="empty-note" style="padding:8px 0">אין פעילות עם מיקום ושעה ביום הזה.</div>`}
      ${rain ? `<div class="wx-day-rain">${ICON.drop} גשם צפוי בשעות הפעילות בין ${rain}</div>` : ""}
    </div>
  `;
}

function renderWeather() {
  const body = (WX.status === "out-of-range" && !WX.store)
    ? `<div class="empty-note">התחזית מכסה כ-${WX.horizonDays} ימים קדימה — היא תיפתח בעוד ${wxDaysUntilForecast()} ימים ותתמלא כאן.</div>`
    : (!WX.store && WX.status === "error")
      ? `<div class="empty-note">לא הצלחנו לטעון תחזית — בדקו חיבור לאינטרנט ונסו "רענון".</div>`
      : (!WX.store)
        ? `<div class="empty-note">טוען תחזית…</div>`
        : DAYS.map(weatherDayCardHTML).join("");

  $("#view-weather").innerHTML = `
    <h2 class="mini-list-title" style="margin-top:0">מזג אוויר — לפי שעות הפעילות</h2>
    ${wxBarHTML()}
    ${body}
    <div class="chips" style="margin-top:14px">
      <a class="chip info" href="https://open-meteo.com/" target="_blank" rel="noopener">${ICON.link} נתונים מ-Open-Meteo</a>
    </div>
  `;
  bindWxRefresh();
}


/* ============================================================
   טאבים + אתחול
   ============================================================ */

function showUpdateToast() {
  if ($("#updateToast")) return;
  document.body.insertAdjacentHTML("beforeend", `
    <div class="update-toast" id="updateToast">
      <span>יש גרסה חדשה של האפליקציה</span>
      <button type="button">רענון</button>
    </div>`);
  $("#updateToast button").addEventListener("click", () => location.reload());
}

function showView(name) {
  $$(".view").forEach(v => v.classList.remove("active"));
  $(`#view-${name}`).classList.add("active");
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
  $("#app").scrollTop = 0;
  localStorage.setItem(globalKey("lasttab"), name);
  podMount();   // אם פרק מתנגן, הנגן עובר לתצוגה שנפתחה עכשיו
}

$$(".tab").forEach(tab => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});

// רינדור מחדש של כל התצוגות שמושפעות מהתחזית, בלי לאבד את הגלילה
// ואת הימים הפתוחים במסלול.
function rerenderWeatherViews() {
  const app = $("#app");
  const scroll = app ? app.scrollTop : 0;
  renderNow();         // תחזית של הפעילות הנוכחית ושל המשך היום
  renderItinerary();   // סיכום יומי בכותרת כל יום
  renderWeather();
  if (app) app.scrollTop = scroll;
}

/* ============================================================
   גיליון בחירת הטיול
   ============================================================ */

function tripStatusOf(t) {
  const today = localDateStr(new Date());
  if (today < t.start) return "planned";
  if (today > t.end) return "past";
  return "current";
}

function tripSheetItemHTML(t) {
  const state = tripStatusOf(t);
  const active = t.id === TRIP_ID;
  const days = Math.round((new Date(t.start + "T00:00:00") - new Date(localDateStr(new Date()) + "T00:00:00")) / 86400000);
  const note = state === "current" ? "מתרחש עכשיו"
    : state === "planned" ? (days === 1 ? "מחר" : `עוד ${days} ימים`)
    : "הסתיים";
  return `
    <button class="trip-item ${active ? "active" : ""}" data-trip="${escapeHTML(t.id)}">
      <span class="trip-item-icon">${ICON[t.icon] || ICON.tree}</span>
      <span class="trip-item-text">
        <span class="trip-item-title">${escapeHTML(t.title)}</span>
        <span class="trip-item-sub">${escapeHTML(t.subtitle || "")}</span>
      </span>
      <span class="trip-item-note">${t.hasDraft ? `<span class="trip-draft">טיוטה</span>` : ""}${state === "past" ? ICON.lock : ""}${note}</span>
    </button>
  `;
}

function renderTripSheet() {
  const today = localDateStr(new Date());
  const live = TRIP_INDEX.filter(t => t.end >= today).sort((a, b) => a.start.localeCompare(b.start));
  const past = TRIP_INDEX.filter(t => t.end < today).sort((a, b) => b.end.localeCompare(a.end));

  $("#tripSheetBody").innerHTML = `
    <div class="sheet-handle"></div>
    <h2 class="sheet-title">הטיולים שלנו</h2>
    ${live.length ? `<div class="sheet-group">מתוכנן</div>${live.map(tripSheetItemHTML).join("")}` : ""}
    ${past.length ? `<div class="sheet-group">ארכיון</div>${past.map(tripSheetItemHTML).join("")}` : ""}
    <div class="sheet-actions">
      <button class="sheet-btn primary" data-new-trip>${ICON.plus} טיול חדש</button>
      <button class="sheet-btn" data-edit-trip>${ICON.pencil} עריכת ${escapeHTML(TRIP.title)}</button>
    </div>
    <p class="sheet-note">עריכות נשמרות במכשיר כטיוטה. מה שפורסם משתנה רק כשמפרסמים.</p>
  `;
}

function openTripSheet() {
  renderTripSheet();
  $("#tripSheet").hidden = false;
}

function closeTripSheet() {
  $("#tripSheet").hidden = true;
}

// רענון הטיול הפעיל אחרי עריכה — אותו מסלול כמו החלפת טיול, בלי הגיליון.
async function reloadActiveTrip(id) {
  TRIP_INDEX = edMergeIndex(TRIP_INDEX.filter(t => !t.localOnly));
  const target = id || TRIP_ID;
  if (!TRIP_INDEX.some(t => t.id === target)) { location.reload(); return; }
  await loadTrip(target);
  openDays = null;
  renderNow();
  renderItinerary();
  renderInfo();
  renderWeather();
  wxFetch();
}

// החלפת טיול בזמן ריצה: טוענים קובץ אחר ומרנדרים הכול מחדש, בלי רענון דף.
async function switchTrip(id) {
  if (id === TRIP_ID) { closeTripSheet(); return; }
  podClose();
  try {
    await loadTrip(id);
  } catch (err) {
    $("#tripSheetBody").insertAdjacentHTML("beforeend",
      `<p class="sheet-note">לא הצלחנו לטעון את הטיול הזה. אולי אין קליטה והוא עוד לא נשמר במכשיר.</p>`);
    return;
  }
  closeTripSheet();
  openDays = null;
  WX.store = wxLoadCache();
  WX.status = WX.store ? "ok" : "idle";
  renderNow();
  renderItinerary();
  renderInfo();
  renderWeather();
  showView("now");
  wxFetch();
}

function bindTripSheet() {
  $("#tripSwitch").innerHTML = ICON.swap;
  $("#tripSwitch").addEventListener("click", openTripSheet);
  $("#tripSheet").addEventListener("click", e => {
    if (e.target.id === "tripSheet") { closeTripSheet(); return; }
    if (e.target.closest("[data-new-trip]")) { edNewTrip(); return; }
    if (e.target.closest("[data-edit-trip]")) { edOpenTrip(TRIP_ID); return; }
    const item = e.target.closest("[data-trip]");
    if (item) switchTrip(item.dataset.trip);
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#tripSheet").hidden) closeTripSheet();
  });
}

async function init() {
  $$(".tab-icon").forEach(el => { el.innerHTML = ICON[el.dataset.icon]; });
  migrateLegacyStorage();
  bindTripSheet();

  try {
    const index = await fetchJSON("trips/index.json").catch(() => ({ trips: [] }));
    TRIP_INDEX = edMergeIndex(index.trips || []);
    const id = pickDefaultTrip(TRIP_INDEX);
    if (!id) throw new Error("no trips in index");
    await loadTrip(id);
  } catch (err) {
    $("#view-now").innerHTML = `<div class="empty-note">לא הצלחנו לטעון את רשימת הטיולים. אם אין קליטה, נסו שוב כשתהיה.</div>`;
    $("#view-now").classList.add("active");
    console.error(err);
    return;
  }

  // תחזית שמורה מהפעם הקודמת — מוצגת מיד, גם בלי רשת.
  WX.store = wxLoadCache();
  if (WX.store) WX.status = "ok";

  renderNow();
  renderItinerary();
  renderInfo();
  renderWeather();
  showView("now");

  // האזנה מואצלת: "עכשיו" מתרנדר כל דקה, ובלי אצילה היו נערמים מאזינים.
  $("#app").addEventListener("click", e => {
    const rate = e.target.closest("[data-pod-rate]");
    if (rate) {
      const r = parseFloat(rate.dataset.podRate);
      podSaveRate(r);
      podApplyRate(r);
      // עדכון הסימון במקום, ולא רינדור מחדש של הפאנל — כדי לא לגעת בנגן.
      $$(".pod-rate").forEach(b => {
        const on = parseFloat(b.dataset.podRate) === r;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
      return;
    }
    const title = e.target.closest(".pod-title");
    if (title) { podToggle(title.dataset.pod); return; }
    if (e.target.closest("[data-open-trips]")) { openTripSheet(); return; }
    if (e.target.closest("[data-edit-current]")) edOpenTrip(TRIP_ID);
  });

  // ההרשמה נדחית לסוף הטעינה כדי לא להתחרות על הרשת עם הרינדור הראשון.
  // init() הוא async ומחכה לקובץ הטיול, כך שאירוע load עלול כבר לקרות עד
  // שמגיעים לכאן — ואז מאזין ל-load לבדו לא היה נקרא לעולם.
  if ("serviceWorker" in navigator) {
    const registerSW = () => navigator.serviceWorker.register("sw.js").catch(() => {});
    if (document.readyState === "complete") registerSW();
    else window.addEventListener("load", registerSW, { once: true });
  }

  // כל שינוי במצב התחזית (טעינה/הצלחה/כישלון) מרנדר מחדש.
  WX.listeners.push(rerenderWeatherViews);
  wxFetch();

  // רענון תצוגת "עכשיו" מדי דקה, כדי שהפעילות הנוכחית תישאר מדויקת
  // אם האפליקציה נשארת פתוחה. באותה הזדמנות בודקים אם התחזית התיישנה.
  setInterval(() => {
    renderNow();
    if (wxIsStale()) wxFetch();
  }, 60000);

  // חזרה לאפליקציה / חזרה לרשת — מושכים תחזית מעודכנת אם צריך.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wxIsStale()) wxFetch();
  });
  window.addEventListener("online", () => wxFetch({ force: true }));
}

init();
