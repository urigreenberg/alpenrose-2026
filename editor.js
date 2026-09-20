/* ============================================================
   עורך הטיולים
   נטען לפני app.js ומגדיר פונקציות בלבד — הן קוראות לעזרים של app.js
   ($ , escapeHTML, ICON וכו') רק בזמן ריצה, אחרי שהכול כבר נטען.

   עיקרון הבטיחות: מה שפורסם לא משתנה לעולם מתוך העורך. כל עריכה נכתבת
   לטיוטה מקומית (tp:<מזהה>:draft), ורק "פרסום" מוציא אותה החוצה. לכן אפשר
   לטעות, לשחזר גרסה קודמת, או פשוט להשליך את הטיוטה ולחזור למה שפורסם.
   ============================================================ */

const ED = {
  open: false,          // מסך העורך פתוח
  trip: null,           // הטיול שבעריכה (עותק עמוק, לא מה שמוצג באפליקציה)
  meta: null,           // { savedAt, trash: [] }
  dirty: false,
  form: null,           // טופס פעילות פתוח: { kind: "day"|"extra", dayDate, index|null, draft, lookup }
  swap: null,           // { extraIndex } — בחירת פעילות מתוכננת להחלפה עם אפשרות נוספת
  undo: null            // פעולת ביטול אחרונה למחיקה, עם טיימר
};

const ED_HISTORY_MAX = 20;

function edDraftKey(id) { return `tp:${id}:draft`; }
function edHistoryKey(id) { return `tp:${id}:history`; }
function edLocalKey() { return "tp:local-trips"; }

function edClone(value) { return JSON.parse(JSON.stringify(value)); }

/* ---------- טיוטות ---------- */

function edReadDraft(id) {
  return storeGet(edDraftKey(id));
}

function edHasDraft(id) {
  return !!edReadDraft(id);
}

/* שמירה. כל שמירה גם דוחפת תמונת מצב להיסטוריה, כדי שתמיד אפשר לחזור
   כמה צעדים אחורה — זה קו ההגנה מפני "מחקתי בטעות ולא שמתי לב מתי". */
function edSaveDraft({ snapshot = true } = {}) {
  ED.meta.savedAt = Date.now();
  storeSet(edDraftKey(ED.trip.id), { trip: ED.trip, meta: ED.meta });
  if (snapshot) {
    const hist = storeGet(edHistoryKey(ED.trip.id), []);
    hist.unshift({ at: ED.meta.savedAt, trip: ED.trip });
    storeSet(edHistoryKey(ED.trip.id), hist.slice(0, ED_HISTORY_MAX));
  }
  ED.dirty = true;
  edMarkLocal(ED.trip);
}

// טיול שקיים רק במכשיר (עוד לא פורסם) חייב להופיע ברשימת הטיולים,
// אחרת הוא "נעלם" ברגע שסוגרים את העורך.
function edMarkLocal(trip) {
  const local = storeGet(edLocalKey(), []);
  if (!local.some(t => t.id === trip.id)) {
    local.push(edIndexEntry(trip));
  } else {
    const i = local.findIndex(t => t.id === trip.id);
    local[i] = { ...local[i], ...edIndexEntry(trip) };
  }
  storeSet(edLocalKey(), local);
}

function edIndexEntry(trip) {
  return {
    id: trip.id,
    title: trip.title,
    subtitle: trip.subtitle || "",
    icon: trip.icon || "route",
    start: trip.start,
    end: trip.end,
    status: trip.status || "planned",
    localOnly: !!trip.localOnly
  };
}

// הרשימה שמוצגת בגיליון: מה שפורסם, בתוספת טיולים שקיימים רק כאן.
function edMergeIndex(published) {
  const local = storeGet(edLocalKey(), []);
  const byId = new Map(published.map(t => [t.id, { ...t }]));
  for (const t of local) {
    if (byId.has(t.id)) byId.set(t.id, { ...byId.get(t.id), localOnly: false });
    else byId.set(t.id, { ...t, localOnly: true });
  }
  for (const t of byId.values()) t.hasDraft = edHasDraft(t.id);
  return Array.from(byId.values());
}

function edDiscardDraft(id) {
  try {
    localStorage.removeItem(edDraftKey(id));
    localStorage.removeItem(edHistoryKey(id));
  } catch { /* התעלמות */ }
  const local = storeGet(edLocalKey(), []).filter(t => t.id !== id);
  storeSet(edLocalKey(), local);
}

/* ---------- יצירת טיול חדש ---------- */

/* המזהה הוא גם שם התיקייה וגם חלק מכתובת ה-URL, ולכן הוא חייב להישאר
   אותיות לטיניות: שם בעברית היה עובר קידוד בכל נתיב — ב-git, ב-API של
   GitHub וב-Pages. שם עברי מתועתק, והמשתמש יכול לתקן את התוצאה בטופס. */
const HEB_TRANSLIT = {
  "א": "a", "ב": "b", "ג": "g", "ד": "d", "ה": "h", "ו": "v", "ז": "z", "ח": "ch",
  "ט": "t", "י": "y", "כ": "k", "ך": "k", "ל": "l", "מ": "m", "ם": "m", "נ": "n",
  "ן": "n", "ס": "s", "ע": "a", "פ": "p", "ף": "f", "צ": "tz", "ץ": "tz", "ק": "k",
  "ר": "r", "ש": "sh", "ת": "t"
};

function edSlug(title) {
  const latin = Array.from(title.trim().toLowerCase())
    .map(ch => HEB_TRANSLIT[ch] !== undefined ? HEB_TRANSLIT[ch] : ch)
    .join("");
  const base = latin.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return base || "trip";
}

function edUniqueId(title, year, asIs = false) {
  const stem = asIs ? edSlug(title) : `${edSlug(title)}-${year}`;
  let id = stem;
  const taken = new Set(TRIP_INDEX.map(t => t.id));
  let n = 2;
  while (taken.has(id)) id = `${stem}-${n++}`;
  return id;
}

function edDatesBetween(start, end) {
  const out = [];
  for (let d = new Date(start + "T12:00:00"); localDateStr(d) <= end; d.setDate(d.getDate() + 1)) {
    out.push(localDateStr(d));
  }
  return out;
}

function edSubtitleFor(start, end) {
  const a = Number(start.slice(8, 10));
  const b = Number(end.slice(8, 10));
  const monthA = HEB_MONTHS[Number(start.slice(5, 7)) - 1];
  const monthB = HEB_MONTHS[Number(end.slice(5, 7)) - 1];
  const year = end.slice(0, 4);
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${a}–${b} ${monthB} ${year}`
    : `${a} ${monthA} – ${b} ${monthB} ${year}`;
}

// שלד טיול: יום ריק לכל תאריך בטווח. משם ממשיכים בטופס הפעילויות.
function edCreateTrip({ title, start, end, baseName, baseAddress, baseCoords, kind, id: wantedId }) {
  const id = wantedId ? edUniqueId(wantedId, end.slice(0, 4), true) : edUniqueId(title, end.slice(0, 4));
  return {
    schemaVersion: 1,
    id,
    localOnly: true,
    status: "planned",
    title: title.trim(),
    subtitle: edSubtitleFor(start, end),
    icon: "route",
    start,
    end,
    base: { kind: kind || "hotel", name: baseName.trim(), address: baseAddress.trim(), coords: baseCoords },
    flightIn: null,
    flightOut: null,
    checklist: [],
    tips: [],
    podcasts: {},
    extras: [],
    days: edDatesBetween(start, end).map(date => ({
      date,
      title: "",
      place: "",
      driveNote: "",
      blocks: []
    }))
  };
}

/* ---------- השלמות אוטומטיות ----------
   הכול ממקורות חופשיים בלי מפתח API. שום ערך לא נכנס לטיול בשקט — הוא
   ממלא שדה שאפשר לתקן, ומוצג לצידו מאיפה הגיע. */

// חיפוש מקום: קודם הגאוקודר של Open-Meteo (אותו ספק כמו התחזית, מהיר
// ומדויק לשמות מקומות), ואם אין תוצאה — Nominatim, שיודע גם כתובות רחוב.
async function edGeocode(query) {
  const q = query.trim();
  if (q.length < 2) return [];

  try {
    const url = "https://geocoding-api.open-meteo.com/v1/search?count=6&language=he&format=json&name=" + encodeURIComponent(q);
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      const hits = (json.results || []).map(r => ({
        name: r.name,
        detail: [r.admin1, r.country].filter(Boolean).join(", "),
        address: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
        coords: { lat: r.latitude, lng: r.longitude, elev: Math.round(r.elevation ?? 0) },
        source: "Open-Meteo"
      }));
      if (hits.length) return hits;
    }
  } catch { /* ממשיכים ל-Nominatim */ }

  try {
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=he&q=" + encodeURIComponent(q);
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return json.map(r => ({
      name: r.name || r.display_name.split(",")[0],
      detail: r.display_name.split(",").slice(1, 3).join(",").trim(),
      address: r.display_name,
      coords: { lat: Number(r.lat), lng: Number(r.lon), elev: null },
      source: "OpenStreetMap"
    }));
  } catch { return []; }
}

// גובה — התחזית משתמשת בו, ובלעדיו פסגה ועמק באותו אזור מקבלים אותם מספרים.
async function edElevation(coords) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${coords.lat}&longitude=${coords.lng}`);
    if (!res.ok) return null;
    const json = await res.json();
    const e = json.elevation && json.elevation[0];
    return typeof e === "number" ? Math.round(e) : null;
  } catch { return null; }
}

/* תקציר מוויקיפדיה לפי קרבה לנקודה. עברית קודם; לישובים קטנים בגרמניה
   בדרך כלל אין ערך עברי, ואז חוזרים לגרמנית/אנגלית — אבל טקסט בשפה זרה
   לא נכנס לתיאור בעצמו, אלא מוצג לצידו כחומר גלם לכתיבה. */
async function edWikiNearby(coords) {
  for (const lang of ["he", "de", "en"]) {
    try {
      const geo = `https://${lang}.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=${coords.lat}|${coords.lng}&gsradius=3000&gslimit=1&format=json&origin=*`;
      const res = await fetch(geo);
      if (!res.ok) continue;
      const json = await res.json();
      const hit = json.query && json.query.geosearch && json.query.geosearch[0];
      if (!hit) continue;

      const sum = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(hit.title)}`);
      if (!sum.ok) continue;
      const page = await sum.json();
      if (!page.extract) continue;
      return {
        lang,
        title: page.title,
        extract: page.extract,
        url: page.content_urls && page.content_urls.desktop && page.content_urls.desktop.page
      };
    } catch { /* השפה הבאה */ }
  }
  return null;
}

/* תמונות מוויקישיתוף לפי קרבה. extmetadata נותן את היוצר והרישיון, שזה
   בדיוק המבנה שהאפליקציה כבר מרנדרת — כך שהקרדיט נכון מעצם הבחירה. */
async function edCommonsPhotos(coords) {
  try {
    const url = "https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*"
      + "&generator=geosearch&ggsnamespace=6&ggslimit=12"
      + `&ggscoord=${coords.lat}|${coords.lng}&ggsradius=2000`
      + "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200";
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const pages = (json.query && json.query.pages) || {};
    return Object.values(pages).map(p => {
      const info = p.imageinfo && p.imageinfo[0];
      if (!info) return null;
      const meta = info.extmetadata || {};
      const strip = html => String(html || "").replace(/<[^>]*>/g, "").trim();
      if (!/\.(jpe?g|png)$/i.test(p.title)) return null;
      return {
        commonsFile: p.title.replace(/^File:/, ""),
        thumb: info.thumburl || info.url,
        credit: strip(meta.Artist && meta.Artist.value) || "ויקישיתוף",
        license: strip(meta.LicenseShortName && meta.LicenseShortName.value) || ""
      };
    }).filter(Boolean);
  } catch { return []; }
}

/* ---------- הערכת זמן נסיעה ----------
   מרחק אווירי כפול מקדם דרכים, עם מהירות שגדלה במרחק (עירוני קצר מול
   כביש מהיר). זו הערכה ומוצגת ככזאת — הכפתור "מסלול הנסיעה של היום"
   נשאר המקור לזמן אמת. */
function estimateDrive(from, to, fromLabel) {
  if (!from || !to) return null;
  const air = haversineKm(from, to);
  const road = air * 1.3;
  const kmh = road < 15 ? 45 : road < 40 ? 60 : 75;
  const mins = Math.max(5, Math.round((road / kmh) * 60 / 5) * 5);
  const time = mins >= 60
    ? `כ-${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, "0")} שעות`
    : `כ-${mins} דקות`;
  return { time, dist: `כ-${formatDistance(road)}`, from: fromLabel, auto: true };
}

// מחשב מחדש את כל רגלי הנסיעה של יום: מהבסיס לתחנה הראשונה, בין תחנות,
// וחזרה. רגל שנכתבה ביד (בלי auto) לא נדרסת.
function edRecalcDay(day) {
  const base = ED.trip.base;
  if (!base.coords) return;
  const stops = day.blocks.filter(b => b.address && b.coords);
  let prev = { coords: base.coords, label: `מ${base.name ? "-" + base.name : "הבסיס"}` };
  for (const b of stops) {
    if (!b.drive || b.drive.auto) {
      const leg = estimateDrive(prev.coords, b.coords, prev.label);
      if (leg) b.drive = leg;
    }
    prev = { coords: b.coords, label: `מ-${b.title}` };
  }
  if (stops.length && (!day.returnLeg || day.returnLeg.auto)) {
    const back = estimateDrive(prev.coords, base.coords, prev.label);
    if (back) day.returnLeg = { ...back, label: "חזרה לבסיס" };
  }
  if (!stops.length) delete day.returnLeg;
}

/* ---------- סל מחיקות וביטול ---------- */

function edTrashPush(kind, payload) {
  ED.meta.trash.push({ kind, at: Date.now(), payload });
}

function edUndoLast() {
  if (!ED.undo) return;
  ED.undo.restore();
  ED.meta.trash.pop();
  ED.undo = null;
  edSaveDraft();
  edRender();
}

function edShowUndo(text, restore) {
  ED.undo = { restore };
  clearTimeout(ED.undoTimer);
  ED.undoTimer = setTimeout(() => { ED.undo = null; edRender(); }, 12000);
}

/* ---------- היסטוריה ---------- */

function edRestoreSnapshot(index) {
  const hist = storeGet(edHistoryKey(ED.trip.id), []);
  const snap = hist[index];
  if (!snap) return;
  ED.trip = edClone(snap.trip);
  edSaveDraft();
  edRender();
}

/* ---------- גיבוי ---------- */

function edExportBackup() {
  const local = storeGet(edLocalKey(), []);
  const drafts = {};
  for (const t of TRIP_INDEX) {
    const d = edReadDraft(t.id);
    if (d) drafts[t.id] = d;
  }
  const payload = { kind: "trips-backup", at: new Date().toISOString(), local, drafts };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `trips-backup-${localDateStr(new Date())}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function edImportBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data.kind === "trips-backup") {
    storeSet(edLocalKey(), data.local || []);
    for (const [id, d] of Object.entries(data.drafts || {})) storeSet(edDraftKey(id), d);
    return Object.keys(data.drafts || {}).length;
  }
  // קובץ טיול בודד
  if (data.schemaVersion && data.days) {
    storeSet(edDraftKey(data.id), { trip: data, meta: { savedAt: Date.now(), trash: [] } });
    edMarkLocal({ ...data, localOnly: true });
    return 1;
  }
  throw new Error("קובץ לא מוכר");
}

/* ============================================================
   ממשק העורך
   מסך מלא מעל האפליקציה. נפתח מגיליון הטיולים, ונסגר בחזרה אליו.
   ============================================================ */

function edHost() {
  let el = $("#editor");
  if (!el) {
    el = document.createElement("div");
    el.id = "editor";
    el.className = "editor";
    document.body.appendChild(el);
    el.addEventListener("click", edOnClick);
    el.addEventListener("input", edOnInput);
    el.addEventListener("change", edOnInput);
  }
  return el;
}

async function edOpenTrip(id) {
  const draft = edReadDraft(id);
  if (draft) {
    ED.trip = draft.trip;
    ED.meta = draft.meta || { savedAt: draft.trip ? Date.now() : 0, trash: [] };
  } else {
    const published = await fetchJSON(`trips/${id}/trip.json`);
    ED.trip = published;
    ED.meta = { savedAt: 0, trash: [] };
  }
  if (!ED.meta.trash) ED.meta.trash = [];
  if (!ED.trip.extras) ED.trip.extras = [];
  ED.dirty = !!draft;
  ED.open = true;
  ED.form = null;
  closeTripSheet();
  edRender();
}

function edClose() {
  ED.open = false;
  ED.form = null;
  edHost().innerHTML = "";
  edHost().classList.remove("on");
  // מה שנערך צריך להופיע מיד באפליקציה עצמה.
  if (ED.trip) reloadActiveTrip(ED.trip.id);
}

function edSavedLabel() {
  if (!ED.meta.savedAt) return "לא נשמרו שינויים";
  const mins = Math.floor((Date.now() - ED.meta.savedAt) / 60000);
  if (mins < 1) return "נשמר לפני רגע";
  if (mins < 60) return `נשמר לפני ${mins} דק׳`;
  return "נשמר מוקדם יותר";
}

function edDayLabel(date) {
  return `${hebWeekday(date)}, ${dayMonth(date)}`;
}

function edBlockRowHTML(day, b, i) {
  const time = timeLabel(b) || "ללא שעה";
  const auto = b.drive && b.drive.auto;
  return `
    <div class="ed-row" data-edit-block="${day.date}:${i}">
      <span class="ed-row-main">
        <span class="ed-row-title">${escapeHTML(b.title || "ללא שם")}</span>
        <span class="ed-row-sub">${escapeHTML(time)}${b.drive ? ` · ${escapeHTML(b.drive.time)}${auto ? " (הערכה)" : ""}` : ""}</span>
      </span>
      <span class="ed-row-icons">
        ${b.image ? ICON.camera : ""}
        ${b.area && ED.trip.podcasts[b.area] ? ICON.headphones : ""}
        <button class="ed-del" data-del-block="${day.date}:${i}" aria-label="מחיקת פעילות">${ICON.trash}</button>
      </span>
    </div>
  `;
}

function edExtraRowHTML(x, i) {
  return `
    <div class="ed-row" data-edit-extra="${i}">
      <span class="ed-row-main">
        <span class="ed-row-title">${escapeHTML(x.title || "ללא שם")}</span>
        <span class="ed-row-sub">${escapeHTML(x.address || "בלי כתובת")}</span>
      </span>
      <span class="ed-row-icons">
        ${x.image ? ICON.camera : ""}
        <button class="ed-del" data-swap-extra="${i}" aria-label="החלפה עם פעילות מתוכננת" title="החלפה עם פעילות מתוכננת">${ICON.swap}</button>
        <button class="ed-del" data-del-extra="${i}" aria-label="מחיקת אפשרות">${ICON.trash}</button>
      </span>
    </div>
  `;
}

function edDayHTML(day, n) {
  return `
    <section class="ed-day">
      <header class="ed-day-head">
        <span class="ed-day-n">יום ${n}</span>
        <span class="ed-day-date">${edDayLabel(day.date)}</span>
      </header>
      <input class="ed-day-title" data-day-title="${day.date}" value="${escapeHTML(day.title || "")}" placeholder="כותרת היום — למשל: סיינה">
      ${day.blocks.length ? day.blocks.map((b, i) => edBlockRowHTML(day, b, i)).join("") : `<p class="ed-empty">אין עדיין פעילויות ביום הזה.</p>`}
      <button class="ed-add" data-add-block="${day.date}">${ICON.plus} פעילות ליום הזה</button>
    </section>
  `;
}

function edRender() {
  const host = edHost();
  host.classList.add("on");

  if (ED.publish) { host.innerHTML = edPublishHTML(); return; }
  if (ED.newTrip) { host.innerHTML = edNewTripHTML(); return; }
  if (ED.swap) { host.innerHTML = edSwapHTML(); return; }
  if (ED.form) { host.innerHTML = edFormHTML(); edAfterFormRender(); return; }

  const trash = ED.meta.trash.length;
  const hist = storeGet(edHistoryKey(ED.trip.id), []).length;

  host.innerHTML = `
    <header class="ed-top">
      <button class="ed-back" data-close-editor>${ICON.chevron} סיום</button>
      <strong>${escapeHTML(ED.trip.title)}</strong>
      <button class="ed-publish" data-publish>פרסום</button>
    </header>

    <div class="ed-body">
      <div class="ed-banner ${ED.dirty ? "on" : ""}">
        <span>${ED.dirty ? "טיוטה שלא פורסמה" : "אין שינויים מקומיים"}</span>
        <span class="ed-banner-time">${escapeHTML(edSavedLabel())}</span>
      </div>

      <div class="ed-tools">
        <button data-history ${hist ? "" : "disabled"}>${ICON.refresh} ${hist} גרסאות</button>
        <button data-trash ${trash ? "" : "disabled"}>${ICON.trash} סל: ${trash}</button>
        <button data-backup>${ICON.download} גיבוי</button>
      </div>

      ${ED.trip.days.map((d, i) => edDayHTML(d, i + 1)).join("")}

      <section class="ed-day">
        <header class="ed-day-head">
          <span class="ed-day-n">אפשרויות נוספות</span>
        </header>
        <p class="ed-hint" style="margin-top:0">רעיונות שלא נכנסו למסלול הקבוע. אפשר לערוך אותם כאן, או להחליף אחד מהם עם פעילות מתוכננת.</p>
        ${ED.trip.extras.length ? ED.trip.extras.map((x, i) => edExtraRowHTML(x, i)).join("") : `<p class="ed-empty">אין עדיין אפשרויות נוספות.</p>`}
        <button class="ed-add" data-add-extra>${ICON.plus} אפשרות נוספת</button>
      </section>

      <div class="ed-danger">
        <button data-discard>השלכת כל השינויים המקומיים</button>
      </div>
    </div>

    ${ED.undo ? `<div class="ed-undo"><span>הפעילות נמחקה</span><button data-undo>ביטול</button></div>` : ""}
  `;
}

/* ---------- טופס פעילות (הוספה ועריכה — אותו מסך) ---------- */

function edEmptyBlock(dayDate) {
  return { start: "", end: "", approx: true, title: "", desc: "", address: "", coords: null, _day: dayDate };
}

function edOpenForm(dayDate, index) {
  const day = ED.trip.days.find(d => d.date === dayDate);
  const block = index == null ? edEmptyBlock(dayDate) : edClone(day.blocks[index]);
  block._day = dayDate;
  ED.form = { kind: "day", dayDate, index, block, results: null, busy: false, photos: null, wiki: null, wikiDismissed: false, query: "", photoUrlDraft: "", parkingDraft: edParkingText(block.parking), parkingErr: null };
  edRender();
}

function edEmptyExtra() {
  return { title: "", desc: "", address: "", coords: null };
}

function edOpenExtraForm(index) {
  const block = index == null ? edEmptyExtra() : edClone(ED.trip.extras[index]);
  ED.form = { kind: "extra", dayDate: null, index, block, results: null, busy: false, photos: null, wiki: null, wikiDismissed: false, query: "", photoUrlDraft: "", parkingDraft: edParkingText(block.parking), parkingErr: null };
  edRender();
}

function edDayOptionsHTML(selected) {
  return ED.trip.days.map((d, i) =>
    `<option value="${d.date}" ${d.date === selected ? "selected" : ""}>יום ${i + 1} · ${escapeHTML(edDayLabel(d.date))}</option>`
  ).join("");
}

function edAreaOptionsHTML(selected) {
  const areas = Object.keys(ED.trip.podcasts || {});
  return `<option value="">— בלי פרק —</option>` + areas.map(a =>
    `<option value="${escapeHTML(a)}" ${a === selected ? "selected" : ""}>${escapeHTML(ED.trip.podcasts[a].title || a)}</option>`
  ).join("");
}

// כמה פעילויות חולקות את אותו פרק — הפרק שייך לאזור, לא לפעילות בודדת.
function edAreaSiblings(area, exceptDay, exceptIndex) {
  const out = [];
  ED.trip.days.forEach(d => d.blocks.forEach((b, i) => {
    if (b.area === area && !(d.date === exceptDay && i === exceptIndex)) out.push(b.title || "ללא שם");
  }));
  return out;
}

function edFormHTML() {
  const f = ED.form;
  const b = f.block;
  const isNew = f.index == null;
  const isExtra = f.kind === "extra";
  const siblings = !isExtra && b.area ? edAreaSiblings(b.area, f.dayDate, f.index) : [];

  return `
    <header class="ed-top">
      <button class="ed-back" data-form-cancel>${ICON.chevron} ביטול</button>
      <strong>${isNew ? (isExtra ? "אפשרות נוספת חדשה" : "פעילות חדשה") : (isExtra ? "עריכת אפשרות נוספת" : "עריכת פעילות")}</strong>
      <button class="ed-publish" data-form-save>שמירה</button>
    </header>

    <div class="ed-body">
      ${isExtra ? "" : `
      <div class="ed-field-row">
        <label class="ed-field ed-flex2">
          <span>יום</span>
          <select data-field="_day">${edDayOptionsHTML(b._day)}</select>
        </label>
        <label class="ed-field">
          <span>משעה</span>
          <input data-field="start" value="${escapeHTML(b.start || "")}" placeholder="09:30" inputmode="numeric">
        </label>
        <label class="ed-field">
          <span>עד</span>
          <input data-field="end" value="${escapeHTML(b.end || "")}" placeholder="12:00" inputmode="numeric">
        </label>
      </div>
      <p class="ed-hint">שינוי היום כאן מעביר את הפעילות — זמני הנסיעה יחושבו מחדש בשני הימים.</p>
      `}

      <label class="ed-field">
        <span>חיפוש מקום</span>
        <input data-lookup value="${escapeHTML(f.query)}" placeholder="שם מקום או כתובת">
      </label>
      <button class="ed-add" data-do-lookup ${f.busy ? "disabled" : ""}>
        ${ICON.target} ${f.busy ? "מחפש…" : "חיפוש והשלמה אוטומטית"}
      </button>
      ${edResultsHTML()}

      <label class="ed-field">
        <span>שם הפעילות</span>
        <input data-field="title" value="${escapeHTML(b.title || "")}" placeholder="מפלי טריברג">
      </label>

      <label class="ed-field">
        <span>שם לחיפוש במפות ו-Waze</span>
        <input data-field="mapsQuery" value="${escapeHTML(b.mapsQuery || "")}" placeholder="${escapeHTML(b.title || "שם המקום כפי שגוגל מכירה אותו")}">
      </label>
      <p class="ed-hint">זה מה שייפתח בצ'יפ "מפה". בלי זה משתמשים בכתובת, שלפעמים מצביעה על נקודה גנרית ברחוב.</p>

      <label class="ed-field">
        <span>תיאור</span>
        <textarea data-field="desc" rows="4" placeholder="מה עושים שם">${escapeHTML(b.desc || "")}</textarea>
      </label>
      ${edWikiOfferHTML()}

      <label class="ed-field">
        <span>כתובת</span>
        <input data-field="address" value="${escapeHTML(b.address || "")}" placeholder="רחוב, עיר, מדינה">
      </label>
      ${edDerivedHTML(b)}

      ${edParkingHTML(b)}

      ${edPhotoHTML(b)}

      <div class="ed-field-row">
        <label class="ed-field"><span>מחיר</span><input data-field="price" value="${escapeHTML(b.price || "")}" placeholder="מבוגר 12€"></label>
        <label class="ed-field"><span>שעות</span><input data-field="hours" value="${escapeHTML(b.hours || "")}" placeholder="09:00–18:00"></label>
      </div>
      <label class="ed-field">
        <span>אתר רשמי</span>
        <input data-field="infoUrl" value="${escapeHTML(b.infoUrl || "")}" placeholder="https://" dir="ltr">
      </label>
      <p class="ed-hint">זה מה שייפתח בצ'יפ "מידע נוסף". בלי אתר, הצ'יפ נופל לחיפוש גוגל לפי שם המקום.</p>

      ${isExtra ? "" : `
      <label class="ed-field">
        <span>פרק פודקאסט</span>
        <select data-field="area">${edAreaOptionsHTML(b.area)}</select>
      </label>
      ${siblings.length ? `<div class="ed-warn">${ICON.warn} הפרק משותף גם ל: ${escapeHTML(siblings.join(", "))} — החלפה תשנה אותו גם עבורן.</div>` : ""}
      ${edEpisodeHTML(b)}
      `}

      ${isNew ? "" : `<div class="ed-danger"><button data-form-delete>מחיקת ${isExtra ? "האפשרות" : "הפעילות"}</button></div>`}
    </div>
  `;
}

/* הצעת ויקיפדיה. תמיד הצעה ולעולם לא מילוי שקט: שם הכתבה מוצג, כדי
   שהתאמה שגויה תהיה מיד גלויה, וטקסט בשפה זרה מסומן ככזה. */
function edWikiOfferHTML() {
  const w = ED.form.wiki;
  if (!w || ED.form.wikiDismissed) return "";
  const langName = w.lang === "he" ? "" : w.lang === "de" ? " (בגרמנית)" : " (באנגלית)";
  return `
    <div class="ed-ref">
      <span class="ed-ref-tag">מוויקיפדיה — הכתבה "${escapeHTML(w.title)}"${langName}</span>
      <p>${escapeHTML(w.extract)}</p>
      <div class="ed-ref-actions">
        <button class="ed-link" data-wiki-use>${w.lang === "he" ? "שימוש כתיאור" : "העתקה לתיאור לתרגום"}</button>
        <button class="ed-link" data-wiki-skip>לא קשור</button>
      </div>
    </div>`;
}

function edResultsHTML() {
  const f = ED.form;
  if (!f.results) return "";
  if (!f.results.length) return `<p class="ed-hint">לא נמצאו תוצאות. אפשר למלא את השדות ידנית.</p>`;
  return `<div class="ed-results">${f.results.map((r, i) => `
    <button class="ed-result" data-pick="${i}">
      <span class="ed-result-name">${escapeHTML(r.name)}</span>
      <span class="ed-result-detail">${escapeHTML(r.detail || "")} · ${escapeHTML(r.source)}</span>
    </button>`).join("")}</div>`;
}

// מה שהאפליקציה תפיק לבד ברגע שיש כתובת וקואורדינטות.
function edDerivedHTML(b) {
  if (!b.coords) return `<p class="ed-hint">בלי קואורדינטות לא תהיה תחזית לפעילות הזאת.</p>`;
  const prev = edPrevStop();
  const leg = prev ? estimateDrive(prev.coords, b.coords, prev.label) : null;
  return `
    <div class="ed-derived">
      <span class="ed-tag ok">${ICON.cloud} תחזית פעילה</span>
      ${b.address ? `<span class="ed-tag ok">${ICON.pin} Maps${b.parking ? " · Waze לחניה" : " · Waze"}</span>` : ""}
      ${leg ? `<span class="ed-tag est">${ICON.car} ${escapeHTML(leg.time)} · הערכה</span>` : ""}
      <span class="ed-tag plain">${b.coords.lat.toFixed(3)}, ${b.coords.lng.toFixed(3)}${b.coords.elev != null ? ` · ${b.coords.elev} מ׳` : ""}</span>
    </div>
  `;
}

/* ---------- נקודת חניה ----------
   Waze מנווט לכאן במקום למקום עצמו. הקלט מקבל גם קואורדינטות גולמיות וגם
   כתובת URL מלאה של גוגל מפות, כי זה הזרימה הטבעית: מוצאים את החניון
   במפות, מעתיקים קישור, מדביקים.

   סדר הפענוח חשוב: ב-URL של גוגל, !3d!4d הם הסיכה עצמה ואילו @ הוא רק
   מרכז התצוגה — לרוב קרובים, אבל לא תמיד אותו דבר, ולכן הסיכה קודמת. */

const ED_PARK_FAR_KM = 1.5;

function edParkingText(p) {
  return p && p.lat != null ? `${p.lat},${p.lng}` : "";
}

function edParseParking(text) {
  const s = (text || "").trim();
  if (!s) return null;
  // קישור מקוצר לא ניתן לפענוח בדפדפן (חסימת CORS על ההפניה) — מסמנים
  // ומסבירים, במקום להחזיר null ולהיראות כמו טקסט לא תקין.
  if (/(maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(s)) return { short: true };

  const num = "(-?\\d+\\.\\d+)";
  const patterns = [
    new RegExp(`^\\s*${num}\\s*,\\s*${num}\\s*$`),      // "47.40,10.88" גולמי
    new RegExp(`!3d${num}!4d${num}`),                    // הסיכה בפועל
    new RegExp(`@${num},${num}`),                        // מרכז התצוגה
    new RegExp(`[?&](?:q|ll|center|daddr)=${num},${num}`)
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (!m) continue;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
  }
  return null;
}

function edParkingHTML(b) {
  const f = ED.form;
  const draft = f.parkingDraft != null ? f.parkingDraft : edParkingText(b.parking);
  const far = b.parking && b.coords && haversineKm(b.coords, b.parking) > ED_PARK_FAR_KM;
  return `
    <label class="ed-field">
      <span>נקודת חניה (Waze)</span>
      <input data-field-parking value="${escapeHTML(draft)}" dir="ltr" placeholder="47.4032,10.8846 או קישור מגוגל מפות">
    </label>
    ${f.parkingErr === "short"
      ? `<div class="ed-warn">${ICON.warn} קישור מקוצר (maps.app.goo.gl) לא ניתן לפענוח מהדפדפן. פתחו אותו במפות והעתיקו את הכתובת המלאה מסרגל הכתובות, או הדביקו קואורדינטות.</div>`
      : f.parkingErr === "bad"
        ? `<div class="ed-warn">${ICON.warn} לא זיהינו קואורדינטות בטקסט הזה.</div>`
        : ""}
    ${b.parking ? `
      <div class="ed-derived">
        <span class="ed-tag ok">${ICON.car} ${b.parking.lat.toFixed(4)}, ${b.parking.lng.toFixed(4)}</span>
        ${b.coords ? `<span class="ed-tag ${far ? "est" : "plain"}">${formatDistance(haversineKm(b.coords, b.parking))} מהמקום</span>` : ""}
        <button class="ed-link" data-parking-clear>הסרה</button>
      </div>
      ${far ? `<div class="ed-warn">${ICON.warn} החניה רחוקה מהמקום עצמו — לבדוק שזה באמת החניון הנכון ולא נקודה אקראית.</div>` : ""}
    ` : `<p class="ed-hint">בלי נקודת חניה, Waze ינווט לפי שם המקום.</p>`}
  `;
}

// התחנה שלפני הפעילות ביום שנבחר — בסיס ההערכה של זמן הנסיעה.
// לאפשרות נוספת (לא משויכת ליום) הבסיס עצמו הוא נקודת המוצא היחידה.
function edPrevStop() {
  const f = ED.form;
  if (f.kind === "extra") {
    const base = ED.trip.base;
    return base.coords ? { coords: base.coords, label: `מ${base.name ? "-" + base.name : "הבסיס"}` } : null;
  }
  const day = ED.trip.days.find(d => d.date === f.block._day);
  if (!day) return null;
  const stops = day.blocks.filter((b, i) => b.coords && i !== f.index);
  const last = stops[stops.length - 1];
  return last
    ? { coords: last.coords, label: `מ-${last.title}` }
    : { coords: ED.trip.base.coords, label: `מ${ED.trip.base.name ? "-" + ED.trip.base.name : "הבסיס"}` };
}

// תמונה: מוויקישיתוף (לפי קרבה לנקודה, עם קרדיט ורישיון אוטומטיים),
// העלאה ישירה מהמכשיר, או קישור ישיר לתמונה — שלוש דרכים לאותו שדה image.
// תמונה שמגיעה מהעלאה/קישור מוצגת בלי המתנה לפרסום (thumb/localAsset),
// בדיוק כמו תמונת ויקישיתוף שנבחרה.
function edPhotoHTML(b) {
  const f = ED.form;
  const manual = b.image && !b.image.commonsFile;

  const current = b.image ? `
    <div class="ed-photo-current">
      <img ${b.image.pending && b.image.localAsset
        ? `data-pending-image="${escapeHTML(b.image.file)}"`
        : `src="${escapeHTML(b.image.thumb || tripAsset(b.image.file))}"`} alt="">
      <div>
        ${b.image.credit ? `<p class="ed-hint">${escapeHTML(b.image.credit)}${b.image.license ? " · " + escapeHTML(b.image.license) : ""}</p>` : ""}
        <button class="ed-link" data-photo-clear>הסרה</button>
      </div>
    </div>` : "";

  const commonsGrid = f.photos
    ? (f.photos.length
        ? `<div class="ed-photos">${f.photos.map((p, i) =>
            `<button class="ed-photo" data-photo="${i}"><img src="${escapeHTML(p.thumb)}" alt="" loading="lazy"></button>`).join("")}</div>`
        : `<p class="ed-hint">לא נמצאו תמונות חופשיות סביב הנקודה הזאת.</p>`)
    : "";

  return `
    <div class="ed-field"><span>תמונה</span></div>
    ${current}
    ${manual ? `<label class="ed-field"><span>קרדיט (אופציונלי)</span><input data-image-credit value="${escapeHTML(b.image.credit || "")}" placeholder="שם הצלם, או השאירו ריק"></label>` : ""}

    <div class="ed-field-row">
      <label class="ed-add" for="ed-photo-upload">${ICON.upload} ${b.image ? "החלפה מהמכשיר" : "העלאה מהמכשיר"}</label>
      ${b.coords ? `<button class="ed-add" data-photo-pick>${ICON.camera} חיפוש בוויקישיתוף</button>` : ""}
    </div>
    <input id="ed-photo-upload" type="file" accept="image/*" data-photo-upload hidden>

    <div class="ed-field-row">
      <label class="ed-field ed-flex2"><span>או קישור ישיר לתמונה</span><input data-photo-url value="${escapeHTML(f.photoUrlDraft || "")}" placeholder="https://…" dir="ltr"></label>
      <button class="ed-add" data-photo-url-use>שימוש בקישור</button>
    </div>
    <p class="ed-hint">קישור עובד רק אם האתר המקורי מרשה הורדה חוצה-מקורות — אם הפרסום נכשל על התמונה הזו, כדאי להוריד אותה ולהעלות מהמכשיר במקום.</p>

    ${commonsGrid}
  `;
}

/* ניהול הפרק של האזור. הפרק שייך לאזור ולא לפעילות, ולכן ההעלאה כאן
   משנה אותו לכל הפעילויות באותו אזור — מה שנאמר במפורש למעלה. */
function edEpisodeHTML(b) {
  if (!b.area) {
    return `
      <label class="ed-field">
        <span>אזור חדש לפרק (אותיות לטיניות)</span>
        <input data-new-area value="${escapeHTML(ED.form.newArea || "")}" dir="ltr" placeholder="siena">
      </label>
      <button class="ed-add" data-make-area>${ICON.plus} יצירת אזור פרק</button>`;
  }
  const pod = ED.trip.podcasts[b.area] || {};
  return `
    <div class="ed-episode">
      <div class="ed-episode-row">
        <span>${ICON.headphones} ${escapeHTML(pod.title || b.area)}${pod.ready ? ` · ${pod.minutes} דק׳` : " · אין קובץ"}</span>
        ${pod.pending ? `<span class="ed-tag est">ממתין לפרסום</span>` : ""}
      </div>
      <label class="ed-add" for="ed-audio">${ICON.upload} ${pod.ready ? "החלפת קובץ הפרק" : "בחירת קובץ הפרק"}</label>
      <input id="ed-audio" type="file" accept="audio/*,.m4a,.mp3,.wav" data-audio hidden>
      <p class="ed-hint">m4a או mp3 שכבר דחוסים. קובץ WAV מ-NotebookLM צריך לעבור דרך tools/convert-audio.sh — הדפדפן לא יודע לקודד AAC.</p>
    </div>`;
}

function edAfterFormRender() {
  const el = $("[data-lookup]", edHost());
  if (el && ED.form.focusLookup) { el.focus(); ED.form.focusLookup = false; }
  hydratePendingImages(ED.trip.id, edHost());
}

/* ---------- אירועים ---------- */

function edOnInput(e) {
  const host = edHost();
  const dayTitle = e.target.closest("[data-day-title]");
  if (dayTitle) {
    const day = ED.trip.days.find(d => d.date === dayTitle.dataset.dayTitle);
    day.title = dayTitle.value;
    edSaveDraft({ snapshot: false });
    return;
  }
  if (e.target.matches("[data-lookup]")) { ED.form.query = e.target.value; return; }
  if (e.target.matches("[data-new-area]")) { ED.form.newArea = e.target.value; return; }
  if (e.target.matches("[data-audio]") && e.target.files[0]) {
    edAttachEpisode(ED.form.block.area, e.target.files[0]);
    return;
  }
  if (e.target.matches("[data-field-parking]")) {
    const f = ED.form;
    f.parkingDraft = e.target.value;
    const parsed = edParseParking(e.target.value);
    if (!e.target.value.trim()) { delete f.block.parking; f.parkingErr = null; }
    else if (parsed && parsed.short) f.parkingErr = "short";
    else if (parsed) { f.block.parking = parsed; f.parkingErr = null; }
    else f.parkingErr = "bad";
    // רינדור רק בסיום ההקלדה, אחרת הסמן קופץ באמצע הדבקת קואורדינטות.
    if (e.type === "change") edRender();
    return;
  }
  if (e.target.matches("[data-photo-url]")) { ED.form.photoUrlDraft = e.target.value; return; }
  if (e.target.matches("[data-photo-upload]") && e.target.files[0]) {
    edAttachPhoto(e.target.files[0]);
    return;
  }
  if (e.target.matches("[data-image-credit]")) {
    if (ED.form.block.image) ED.form.block.image.credit = e.target.value;
    return;
  }

  const gh = e.target.closest("[data-gh]");
  if (gh) {
    storeSet(gh.dataset.gh === "token" ? GH.tokenKey : GH.repoKey, e.target.value.trim());
    if (e.type === "change") edRender();
    return;
  }

  const nt = e.target.closest("[data-new]");
  if (nt && ED.newTrip) {
    ED.newTrip[nt.dataset.new] = e.target.value;
    if (nt.dataset.new === "id") ED.newTrip.idTouched = true;
    // כל עוד לא נגעו במזהה ידנית הוא ממשיך להיגזר מהשם.
    if (nt.dataset.new === "title" && !ED.newTrip.idTouched) ED.newTrip.id = edSlug(e.target.value);
    // התאריכים והשם משנים את מצב כפתור "יצירה", אז צריך רינדור מחדש —
    // אבל לא בזמן הקלדה בשדות טקסט, כדי לא לאבד את מיקום הסמן.
    if (e.type === "change" || nt.type === "date") edRender();
    return;
  }

  const field = e.target.closest("[data-field]");
  if (field && ED.form) {
    // נשמר באובייקט הטופס בלבד; לטיול עצמו זה נכנס רק ב"שמירה".
    ED.form.block[field.dataset.field] = e.target.value;
    return;
  }
}

async function edOnClick(e) {
  const hit = sel => e.target.closest(sel);

  if (hit("[data-close-editor]")) { edClose(); return; }
  if (hit("[data-new-cancel]")) { ED.newTrip = null; edClose(); return; }
  if (hit("[data-new-lookup]")) { await edNewTripLookup(); return; }
  const npick = hit("[data-new-pick]");
  if (npick) { await edNewTripPick(Number(npick.dataset.newPick)); return; }
  if (hit("[data-new-create]")) { edNewTripCreate(); return; }
  if (hit("[data-undo]")) { edUndoLast(); return; }
  if (hit("[data-backup]")) { edExportBackup(); return; }

  if (hit("[data-discard]")) {
    if (!confirm("להשליך את כל השינויים המקומיים בטיול הזה ולחזור למה שפורסם?")) return;
    edDiscardDraft(ED.trip.id);
    edClose();
    location.reload();
    return;
  }

  if (hit("[data-history]")) {
    const hist = storeGet(edHistoryKey(ED.trip.id), []);
    const pick = prompt("שחזור גרסה — מספר מהרשימה:\n" +
      hist.map((h, i) => `${i + 1}. ${new Date(h.at).toLocaleString("he-IL")}`).join("\n"));
    const n = Number(pick);
    if (n >= 1 && n <= hist.length) edRestoreSnapshot(n - 1);
    return;
  }

  if (hit("[data-trash]")) {
    alert("בסל:\n" + ED.meta.trash.map(t => `· ${t.payload.title || "ללא שם"}`).join("\n") +
      "\n\nהפריטים האלה יימחקו לצמיתות רק בפרסום.");
    return;
  }

  const add = hit("[data-add-block]");
  if (add) { edOpenForm(add.dataset.addBlock, null); return; }

  const edit = hit("[data-edit-block]");
  if (edit && !hit("[data-del-block]")) {
    const [date, i] = edit.dataset.editBlock.split(":");
    edOpenForm(date, Number(i));
    return;
  }

  const del = hit("[data-del-block]");
  if (del) {
    const [date, i] = del.dataset.delBlock.split(":");
    edDeleteBlock(date, Number(i));
    return;
  }

  if (hit("[data-add-extra]")) { edOpenExtraForm(null); return; }

  const swapExtra = hit("[data-swap-extra]");
  if (swapExtra) { edOpenSwap(Number(swapExtra.dataset.swapExtra)); return; }

  const delExtra = hit("[data-del-extra]");
  if (delExtra) { edDeleteExtra(Number(delExtra.dataset.delExtra)); return; }

  const editExtra = hit("[data-edit-extra]");
  if (editExtra && !hit("[data-del-extra]") && !hit("[data-swap-extra]")) {
    edOpenExtraForm(Number(editExtra.dataset.editExtra));
    return;
  }

  if (hit("[data-swap-cancel]")) { edCloseSwap(); return; }
  const swapPick = hit("[data-swap-pick]");
  if (swapPick) {
    const [date, bi] = swapPick.dataset.swapPick.split(":");
    edPerformSwap(ED.swap.extraIndex, date, Number(bi));
    ED.swap = null;
    edRender();
    return;
  }

  if (hit("[data-form-cancel]")) { edCancelForm(); return; }
  if (hit("[data-form-save]")) { edSaveForm(); return; }
  if (hit("[data-form-delete]")) {
    if (ED.form.kind === "extra") edDeleteExtra(ED.form.index);
    else edDeleteBlock(ED.form.dayDate, ED.form.index);
    ED.form = null;
    edRender();
    return;
  }

  if (hit("[data-do-lookup]")) { await edRunLookup(); return; }

  const pick = hit("[data-pick]");
  if (pick) { await edApplyResult(ED.form.results[Number(pick.dataset.pick)]); return; }

  if (hit("[data-wiki-use]")) {
    const w = ED.form.wiki;
    ED.form.block.desc = w.extract;
    if (!ED.form.block.infoUrl && w.url) ED.form.block.infoUrl = w.url;
    ED.form.wikiDismissed = true;
    edRender();
    return;
  }
  if (hit("[data-wiki-skip]")) { ED.form.wikiDismissed = true; edRender(); return; }

  if (hit("[data-make-area]")) {
    const raw = (ED.form.newArea || "").trim() || $("[data-new-area]", edHost())?.value || "";
    const area = edSlug(raw);
    if (!area || area === "trip") { alert("צריך מזהה אזור באותיות לטיניות, למשל siena."); return; }
    ED.trip.podcasts[area] = ED.trip.podcasts[area] || { title: ED.form.block.title || area, file: `audio/${area}.m4a`, rev: 1 };
    ED.form.block.area = area;
    edSaveDraft({ snapshot: false });
    edRender();
    return;
  }

  if (hit("[data-parking-clear]")) {
    delete ED.form.block.parking;
    ED.form.parkingDraft = "";
    ED.form.parkingErr = null;
    edRender();
    return;
  }

  if (hit("[data-photo-pick]")) { await edLoadPhotos(); return; }
  if (hit("[data-photo-clear]")) { delete ED.form.block.image; edRender(); return; }

  if (hit("[data-photo-url-use]")) {
    const url = (ED.form.photoUrlDraft || "").trim();
    if (!url) { alert("צריך להזין קישור לתמונה."); return; }
    ED.form.block.image = {
      file: `images/${edSlug(ED.form.block.title || "photo")}-${Date.now().toString(36)}.${edGuessImageExt(url)}`,
      thumb: url,
      credit: "",
      license: "",
      pending: true
    };
    ED.form.photos = null;
    ED.form.photoUrlDraft = "";
    edRender();
    return;
  }

  const photo = hit("[data-photo]");
  if (photo) {
    const p = ED.form.photos[Number(photo.dataset.photo)];
    // file נקבע סופית בפרסום, כשהתמונה באמת נכתבת לתיקיית הטיול.
    ED.form.block.image = {
      file: `images/${edSlug(p.commonsFile.replace(/\.[^.]+$/, ""))}.jpg`,
      thumb: p.thumb,
      credit: p.credit,
      license: p.license,
      commonsFile: p.commonsFile,
      pending: true
    };
    ED.form.photos = null;
    edRender();
    return;
  }

  if (hit("[data-publish]")) { edOpenPublish(); return; }
  if (hit("[data-pub-cancel]")) { ED.publish = null; edRender(); return; }
  if (hit("[data-pub-go]")) { await edRunPublish(); return; }
}

/* ---------- חיפוש והשלמה ---------- */

async function edRunLookup() {
  const f = ED.form;
  if (!f.query.trim()) return;
  f.busy = true; edRender();
  f.results = await edGeocode(f.query);
  f.busy = false;
  edRender();
}

async function edApplyResult(r) {
  const f = ED.form;
  const b = f.block;
  f.busy = true; f.results = null; edRender();

  b.coords = { ...r.coords };
  if (b.coords.elev == null) b.coords.elev = await edElevation(b.coords);
  if (!b.address) b.address = r.address;
  b.wxPlace = r.detail ? `${r.name}, ${r.detail}` : r.name;

  // השם מגיע מהמקום שחיפשתם, לא מוויקיפדיה: geosearch מחזיר את הערך
  // הגיאוגרפי הקרוב ביותר, וזה לא בהכרח המקום עצמו — חיפוש של פיאצה דל
  // קמפו מחזיר את "פאליו", מרוץ הסוסים שנערך בה. לכן הערך מוצע בנפרד,
  // עם שם הכתבה גלוי, ונכנס לתיאור רק בלחיצה.
  if (!b.title) b.title = r.name;
  f.wiki = await edWikiNearby(b.coords);

  f.photos = await edCommonsPhotos(b.coords);
  f.busy = false;
  edRender();
}

async function edLoadPhotos() {
  const f = ED.form;
  if (!f.block.coords) return;
  f.busy = true; edRender();
  f.photos = await edCommonsPhotos(f.block.coords);
  f.busy = false;
  edRender();
}

/* יציאה מהטופס בלי לשמור. יצירת אזור פרק והעלאת קובץ נכתבות לטיול מיד
   (הקובץ צריך מקום לשבת בו), אבל הקישור בין הפעילות לאזור נשמר רק
   ב"שמירה" — אז ביטול היה משאיר אזור שאף פעילות לא מפנה אליו. */
function edCancelForm() {
  const used = new Set();
  ED.trip.days.forEach(d => d.blocks.forEach(b => { if (b.area) used.add(b.area); }));
  let removed = 0;
  for (const area of Object.keys(ED.trip.podcasts || {})) {
    if (!used.has(area) && !ED.trip.podcasts[area].ready) { delete ED.trip.podcasts[area]; removed++; }
  }
  if (removed) edSaveDraft({ snapshot: false });
  ED.form = null;
  edRender();
}

/* ---------- שמירה ומחיקה של פעילות ---------- */

// מחשב מחדש את רגל הנסיעה מהבסיס לאפשרות נוספת (אין לה רצף תחנות כמו ביום).
function edRecalcExtra(item) {
  const base = ED.trip.base;
  if (!base.coords || !item.coords) return;
  if (!item.drive || item.drive.auto) {
    const leg = estimateDrive(base.coords, item.coords, `מ${base.name ? "-" + base.name : "הבסיס"}`);
    if (leg) item.drive = leg;
  }
}

function edSaveForm() {
  const f = ED.form;
  const b = edClone(f.block);

  if (!b.title.trim()) { alert("צריך שם לפעילות."); return; }
  for (const k of ["price", "hours", "infoUrl", "area", "address", "desc", "mapsQuery"]) {
    if (b[k] === "") delete b[k];
  }
  if (b.parking && (b.parking.lat == null || b.parking.lng == null)) delete b.parking;
  delete b.infoLink;   // שדה ישן — היום יש רק infoUrl

  if (f.kind === "extra") {
    delete b._day; delete b.start; delete b.end; delete b.approx;
    edRecalcExtra(b);
    if (f.index != null) ED.trip.extras.splice(f.index, 1, b);
    else ED.trip.extras.push(b);
    ED.form = null;
    edSaveDraft();
    edRender();
    return;
  }

  const targetDate = b._day;
  delete b._day;
  if (!b.end) delete b.end;
  if (!b.start) delete b.start;

  // הסרה מהיום הישן והוספה ליום שנבחר — זה גם המנגנון של "העברה ליום אחר".
  if (f.index != null) {
    const from = ED.trip.days.find(d => d.date === f.dayDate);
    from.blocks.splice(f.index, 1);
    edRecalcDay(from);
  }
  const to = ED.trip.days.find(d => d.date === targetDate);
  to.blocks.push(b);
  to.blocks.sort((x, y) => (toMinutes(x.start) ?? 9999) - (toMinutes(y.start) ?? 9999));
  edRecalcDay(to);

  ED.form = null;
  edSaveDraft();
  edRender();
}

function edDeleteBlock(date, index) {
  const day = ED.trip.days.find(d => d.date === date);
  const removed = day.blocks[index];
  if (!removed) return;
  day.blocks.splice(index, 1);
  edRecalcDay(day);
  edTrashPush("block", { ...removed, _day: date });
  edShowUndo("הפעילות נמחקה", () => {
    day.blocks.splice(index, 0, removed);
    edRecalcDay(day);
  });
  edSaveDraft();
  edRender();
}

function edDeleteExtra(index) {
  const removed = ED.trip.extras[index];
  if (!removed) return;
  ED.trip.extras.splice(index, 1);
  edTrashPush("extra", removed);
  edShowUndo("האפשרות נמחקה", () => {
    ED.trip.extras.splice(index, 0, removed);
  });
  edSaveDraft();
  edRender();
}

/* ---------- החלפת אפשרות נוספת עם פעילות מתוכננת ----------
   החלפה הדדית: האפשרות הנוספת יורשת את השעה של הפעילות שהוחלפה, והפעילות
   שהוחלפה עוברת בעצמה ל"אפשרויות נוספות" — כלום לא הולך לאיבוד, ואפשר
   להחליף שוב בחזרה מאוחר יותר. */

function edOpenSwap(extraIndex) {
  ED.swap = { extraIndex };
  edRender();
}

function edCloseSwap() {
  ED.swap = null;
  edRender();
}

function edSwapHTML() {
  const extra = ED.trip.extras[ED.swap.extraIndex];
  const rows = ED.trip.days.flatMap((d, di) => d.blocks.map((b, bi) => ({ d, b, bi })))
    .map(({ d, b, bi }) => `
      <button class="ed-row" data-swap-pick="${d.date}:${bi}">
        <span class="ed-row-main">
          <span class="ed-row-title">${escapeHTML(b.title || "ללא שם")}</span>
          <span class="ed-row-sub">${escapeHTML(edDayLabel(d.date))}${timeLabel(b) ? " · " + escapeHTML(timeLabel(b)) : ""}</span>
        </span>
      </button>
    `).join("");

  return `
    <header class="ed-top">
      <button class="ed-back" data-swap-cancel>${ICON.chevron} ביטול</button>
      <strong>החלפה עם "${escapeHTML(extra.title)}"</strong>
    </header>
    <div class="ed-body">
      <p class="ed-hint" style="margin-top:0">בחרו פעילות מתוכננת שתוחלף. הפעילות שתיבחר תעבור בעצמה ל"אפשרויות נוספות", עם אותה שעה שהייתה לה.</p>
      ${rows || `<p class="ed-empty">אין עדיין פעילויות מתוכננות להחלפה.</p>`}
    </div>
  `;
}

function edPerformSwap(extraIndex, dayDate, blockIndex) {
  const day = ED.trip.days.find(d => d.date === dayDate);
  const planned = day.blocks[blockIndex];
  const extra = ED.trip.extras[extraIndex];
  if (!day || !planned || !extra) return;

  const scheduled = edClone(extra);
  scheduled.start = planned.start;
  scheduled.end = planned.end;
  if (planned.approx) scheduled.approx = true; else delete scheduled.approx;

  const toExtras = edClone(planned);
  delete toExtras.start; delete toExtras.end; delete toExtras.approx;

  day.blocks.splice(blockIndex, 1, scheduled);
  edRecalcDay(day);
  ED.trip.extras.splice(extraIndex, 1, toExtras);
  edSaveDraft();
}

/* ---------- טיול חדש ---------- */

function edNewTrip() {
  const today = localDateStr(new Date());
  ED.newTrip = { title: "", id: "", idTouched: false, start: today, end: today, baseName: "", baseQuery: "", results: null, busy: false, base: null };
  ED.trip = null;
  ED.form = null;
  ED.open = true;
  closeTripSheet();
  edRender();
}

function edNewTripHTML() {
  const n = ED.newTrip;
  const ready = n.title.trim() && /^\d{4}-\d{2}-\d{2}$/.test(n.start) && /^\d{4}-\d{2}-\d{2}$/.test(n.end) && n.end >= n.start;
  const nights = ready ? edDatesBetween(n.start, n.end).length : 0;
  return `
    <header class="ed-top">
      <button class="ed-back" data-new-cancel>${ICON.chevron} ביטול</button>
      <strong>טיול חדש</strong>
      <button class="ed-publish" data-new-create ${ready ? "" : "disabled"}>יצירה</button>
    </header>

    <div class="ed-body">
      <label class="ed-field">
        <span>שם הטיול</span>
        <input data-new="title" value="${escapeHTML(n.title)}" placeholder="טוסקנה">
      </label>

      <label class="ed-field">
        <span>מזהה (שם התיקייה בכתובת)</span>
        <input data-new="id" value="${escapeHTML(n.id || edSlug(n.title))}" placeholder="tuscany" dir="ltr">
      </label>
      <p class="ed-hint">אותיות לטיניות בלבד — זה הופך ל-trips/${escapeHTML(edSlug(n.id || n.title))}/ ולכתובת של התמונות והפרקים. אפשר לשנות עכשיו, קשה לשנות אחר כך.</p>

      <div class="ed-field-row">
        <label class="ed-field"><span>מתאריך</span><input type="date" data-new="start" value="${escapeHTML(n.start)}"></label>
        <label class="ed-field"><span>עד תאריך</span><input type="date" data-new="end" value="${escapeHTML(n.end)}"></label>
      </div>
      ${ready
        ? `<p class="ed-hint">${nights} ימים · ${escapeHTML(edSubtitleFor(n.start, n.end))}</p>`
        : `<p class="ed-hint">צריך שם ותאריכים תקינים (תאריך הסיום לא לפני ההתחלה).</p>`}

      <label class="ed-field">
        <span>איפה ישנים</span>
        <input data-new="baseName" value="${escapeHTML(n.baseName)}" placeholder="שם המלון או הדירה">
      </label>

      <label class="ed-field">
        <span>כתובת מקום הלינה</span>
        <input data-new="baseQuery" value="${escapeHTML(n.baseQuery)}" placeholder="רחוב, עיר, מדינה">
      </label>
      <button class="ed-add" data-new-lookup ${n.busy ? "disabled" : ""}>
        ${ICON.target} ${n.busy ? "מחפש…" : "איתור הכתובת"}
      </button>

      ${n.results ? (n.results.length
        ? `<div class="ed-results">${n.results.map((r, i) => `
            <button class="ed-result" data-new-pick="${i}">
              <span class="ed-result-name">${escapeHTML(r.name)}</span>
              <span class="ed-result-detail">${escapeHTML(r.detail || "")} · ${escapeHTML(r.source)}</span>
            </button>`).join("")}</div>`
        : `<p class="ed-hint">לא נמצאה כתובת כזאת. אפשר ליצור בלי — אבל בלי קואורדינטות אין זמני נסיעה מוערכים ואין תחזית לבסיס.</p>`) : ""}

      ${n.base ? `<div class="ed-derived">
        <span class="ed-tag ok">${ICON.pin} ${escapeHTML(n.base.address)}</span>
        <span class="ed-tag plain">${n.base.coords.lat.toFixed(3)}, ${n.base.coords.lng.toFixed(3)}${n.base.coords.elev != null ? ` · ${n.base.coords.elev} מ׳` : ""}</span>
      </div>` : ""}

      <p class="ed-hint">הטיול ייווצר עם יום ריק לכל תאריך. משם מוסיפים פעילויות.</p>
    </div>
  `;
}

async function edNewTripLookup() {
  const n = ED.newTrip;
  if (!n.baseQuery.trim()) return;
  n.busy = true; edRender();
  n.results = await edGeocode(n.baseQuery);
  n.busy = false;
  edRender();
}

async function edNewTripPick(i) {
  const n = ED.newTrip;
  const r = n.results[i];
  n.busy = true; n.results = null; edRender();
  const coords = { ...r.coords };
  if (coords.elev == null) coords.elev = await edElevation(coords);
  n.base = { address: r.address, coords };
  n.busy = false;
  edRender();
}

function edNewTripCreate() {
  const n = ED.newTrip;
  const trip = edCreateTrip({
    title: n.title,
    id: n.id || n.title,
    start: n.start,
    end: n.end,
    baseName: n.baseName || n.title,
    baseAddress: n.base ? n.base.address : n.baseQuery,
    baseCoords: n.base ? n.base.coords : null
  });
  ED.newTrip = null;
  ED.trip = trip;
  ED.meta = { savedAt: 0, trash: [] };
  edSaveDraft();
  TRIP_INDEX = edMergeIndex(TRIP_INDEX.filter(t => !t.localOnly));
  edRender();
}



/* ============================================================
   מחסן נכסים מקומי (IndexedDB)
   קובץ פרק ששויך לפעילות צריך לשרוד רענון דף עד הפרסום, והוא כמה
   מגה-בייט — הרבה מעבר למה ש-localStorage יכול להחזיק.
   ============================================================ */

const ED_DB = "trips-assets";
const ED_STORE = "files";

function edDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ED_DB, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(ED_STORE)) req.result.createObjectStore(ED_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function edAssetKey(tripId, path) { return `${tripId}/${path}`; }

async function edAssetPut(tripId, path, blob) {
  const db = await edDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ED_STORE, "readwrite");
    tx.objectStore(ED_STORE).put(blob, edAssetKey(tripId, path));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function edAssetGet(tripId, path) {
  const db = await edDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ED_STORE, "readonly");
    const req = tx.objectStore(ED_STORE).get(edAssetKey(tripId, path));
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function edAssetDelete(tripId, path) {
  const db = await edDB();
  return new Promise(resolve => {
    const tx = db.transaction(ED_STORE, "readwrite");
    tx.objectStore(ED_STORE).delete(edAssetKey(tripId, path));
    tx.oncomplete = () => resolve();
  });
}

/* ============================================================
   פרסום — קומיט אחד וענף חדש, ואז Pull Request
   דרך ה-Git Data API ולא Contents API: קובצי הפרקים גדולים מ-1MB
   (המגבלה המתועדת של Contents), וכך גם trip.json, התמונות והאודיו
   נכנסים יחד בקומיט אחד ולא בשרשרת קומיטים נפרדים.
   ============================================================ */

const GH = {
  tokenKey: "tp:gh-token",
  repoKey: "tp:gh-repo",
  api: "https://api.github.com"
};

function ghToken() { return storeGet(GH.tokenKey, ""); }
function ghRepo() { return storeGet(GH.repoKey, "urigreenberg/alpenrose-2026"); }

async function ghFetch(path, options = {}) {
  const res = await fetch(GH.api + path, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${ghToken()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

// base64 בחלקים — קובץ פרק של 6MB הופך למערך של מיליוני בתים, ו-
// String.fromCharCode(...arr) על מערך כזה מפוצץ את מחסנית הקריאות.
function edToBase64(bytes) {
  let out = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(out);
}

async function edBlobToBase64(blob) {
  return edToBase64(new Uint8Array(await blob.arrayBuffer()));
}

/* אילו קבצים הפרסום צריך לכתוב: קובץ הטיול, רשומת האינדקס אם היא
   השתנתה, כל תמונה שנבחרה ועוד לא הועלתה, וכל פרק שממתין. */
// תמונה ממתינה מגיעה משלושה מקורות: חיפוש בוויקישיתוף (thumb הוא URL מרוחק
// עם commonsFile וקרדיט/רישיון), קישור ישיר (thumb הוא ה-URL שהוזן, בלי
// קרדיט), או העלאה מהמכשיר (localAsset — הקובץ יושב ב-IndexedDB ולא ברשת).
async function edProcessPendingImages(items, dir, files, onStep, tripId) {
  for (const item of items) {
    if (!item.image || !item.image.pending) continue;
    let blob;
    if (item.image.localAsset) {
      onStep(`מכין תמונה: ${item.title}`);
      blob = await edAssetGet(tripId, item.image.file);
      if (!blob) throw new Error("קובץ התמונה לא נמצא במכשיר: " + item.title);
    } else {
      onStep(`מוריד תמונה: ${item.image.commonsFile || item.title}`);
      const res = await fetch(item.image.thumb);
      if (!res.ok) throw new Error("לא הצלחנו להוריד את התמונה עבור " + item.title);
      blob = await res.blob();
    }
    files.push({ path: `${dir}/${item.image.file}`, base64: await edBlobToBase64(blob), size: blob.size });
    // מה שנשמר בקובץ הטיול הוא רק המבנה שהאפליקציה מרנדרת.
    const kept = { file: item.image.file };
    if (item.image.credit) kept.credit = item.image.credit;
    if (item.image.license) kept.license = item.image.license;
    if (item.image.commonsFile) kept.commonsFile = item.image.commonsFile;
    if (item.image.sourceUrl) kept.sourceUrl = item.image.sourceUrl;
    item.image = kept;
  }
}

async function edCollectFiles(onStep) {
  const trip = edClone(ED.trip);
  const files = [];
  const dir = `trips/${trip.id}`;

  for (const day of trip.days) await edProcessPendingImages(day.blocks, dir, files, onStep, trip.id);
  await edProcessPendingImages(trip.extras || [], dir, files, onStep, trip.id);

  for (const [area, pod] of Object.entries(trip.podcasts || {})) {
    if (!pod.pending) continue;
    onStep(`מכין פרק: ${pod.title || area}`);
    const blob = await edAssetGet(trip.id, pod.file);
    if (!blob) throw new Error("קובץ הפרק לא נמצא במכשיר: " + area);
    files.push({ path: `${dir}/${pod.file}`, base64: await edBlobToBase64(blob), size: blob.size });
    // שדות עבודה של העורך — לא חלק מהנתונים שהאפליקציה קוראת.
    delete pod.pending;
    delete pod.sizeLabel;
  }

  trip.localOnly = false;
  delete trip.localOnly;
  files.push({ path: `${dir}/trip.json`, text: JSON.stringify(trip, null, 2) + "\n" });
  return { trip, files, dir };
}

async function edPublishRun(onStep) {
  const repo = ghRepo();
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error("שם המאגר לא תקין");

  onStep("קורא את מצב המאגר");
  const repoInfo = await ghFetch(`/repos/${owner}/${name}`);
  const baseBranch = repoInfo.default_branch;
  const ref = await ghFetch(`/repos/${owner}/${name}/git/ref/heads/${baseBranch}`);
  const baseCommitSha = ref.object.sha;
  const baseCommit = await ghFetch(`/repos/${owner}/${name}/git/commits/${baseCommitSha}`);

  // שמירה מפני דריסה: אם הקובץ שפורסם השתנה מאז שהטיוטה נוצרה, לא
  // ממשיכים — עדיף לרענן ולמזג מאשר להעלים שינוי של מישהו אחר.
  if (ED.meta.basedOn && ED.meta.basedOn !== baseCommitSha) {
    const changed = await ghFetch(`/repos/${owner}/${name}/compare/${ED.meta.basedOn}...${baseCommitSha}`);
    const touched = (changed.files || []).some(f => f.filename.startsWith(`trips/${ED.trip.id}/`));
    if (touched) throw new Error("הטיול הזה השתנה במאגר מאז שהתחלתם לערוך. לרענן את הדף ולהתחיל מהגרסה החדשה.");
  }

  const { trip, files, dir } = await edCollectFiles(onStep);

  onStep(`מעלה ${files.length} קבצים`);
  const tree = [];
  for (const f of files) {
    const blob = f.base64
      ? await ghFetch(`/repos/${owner}/${name}/git/blobs`, { method: "POST", body: JSON.stringify({ content: f.base64, encoding: "base64" }) })
      : await ghFetch(`/repos/${owner}/${name}/git/blobs`, { method: "POST", body: JSON.stringify({ content: f.text, encoding: "utf-8" }) });
    tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
  }

  // רשומת האינדקס — נכתבת מחדש תמיד, כדי שטיול חדש יופיע ברשימה.
  const index = await fetchJSON("trips/index.json").catch(() => ({ schemaVersion: 1, trips: [] }));
  const entry = edIndexEntry(trip);
  delete entry.localOnly;
  const others = (index.trips || []).filter(t => t.id !== trip.id);
  const nextIndex = { ...index, trips: [...others, entry].sort((a, b) => a.start.localeCompare(b.start)) };
  const indexBlob = await ghFetch(`/repos/${owner}/${name}/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: JSON.stringify(nextIndex, null, 2) + "\n", encoding: "utf-8" })
  });
  tree.push({ path: "trips/index.json", mode: "100644", type: "blob", sha: indexBlob.sha });

  onStep("יוצר קומיט");
  const newTree = await ghFetch(`/repos/${owner}/${name}/git/trees`, {
    method: "POST",
    body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree })
  });
  const commit = await ghFetch(`/repos/${owner}/${name}/git/commits`, {
    method: "POST",
    body: JSON.stringify({
      message: `Update ${trip.title} (${trip.id})`,
      tree: newTree.sha,
      parents: [baseCommitSha]
    })
  });

  const branch = `trip/${trip.id}-${Date.now().toString(36)}`;
  onStep("פותח ענף");
  await ghFetch(`/repos/${owner}/${name}/git/refs`, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha })
  });

  onStep("פותח Pull Request");
  const pr = await ghFetch(`/repos/${owner}/${name}/pulls`, {
    method: "POST",
    body: JSON.stringify({
      title: `${trip.title} — עדכון מהאפליקציה`,
      head: branch,
      base: baseBranch,
      body: `נוצר מתוך האפליקציה.\n\n${files.map(f => `- \`${f.path}\`${f.size ? ` (${Math.round(f.size / 1024)} ק"ב)` : ""}`).join("\n")}\n- \`trips/index.json\``
    })
  });

  // הטיוטה נשארת — מה שנערך ממשיך להופיע באפליקציה עד שה-PR ימוזג.
  ED.trip = trip;
  ED.meta.pr = { url: pr.html_url, number: pr.number, branch };
  ED.meta.trash = [];
  edSaveDraft({ snapshot: false });
  return pr;
}

/* ---------- מסך הפרסום ---------- */

function edPublishHTML() {
  const p = ED.publish;
  const pending = edPendingSummary();
  const hasToken = !!ghToken();

  return `
    <header class="ed-top">
      <button class="ed-back" data-pub-cancel>${ICON.chevron} חזרה</button>
      <strong>פרסום</strong>
      <button class="ed-publish" data-pub-go ${hasToken && !p.busy ? "" : "disabled"}>${p.busy ? "…" : "פתיחת PR"}</button>
    </header>

    <div class="ed-body">
      ${p.done ? `
        <div class="ed-banner on">נפתח Pull Request #${p.done.number}</div>
        <p class="ed-hint">השינויים לא באתר עדיין — הם ייכנסו כשתאשרו את המיזוג ב-GitHub. עד אז הם ממשיכים להופיע כאן, במכשיר הזה.</p>
        <a class="ed-add" href="${escapeHTML(p.done.html_url)}" target="_blank" rel="noopener">${ICON.link} פתיחת ה-PR ב-GitHub</a>
      ` : `
        <div class="ed-field"><span>מה ייכנס לקומיט</span></div>
        <div class="ed-summary">
          ${pending.map(f => `<div class="ed-summary-row"><span>${f.icon} ${escapeHTML(f.label)}</span><span class="ed-summary-size">${escapeHTML(f.size)}</span></div>`).join("")}
        </div>
        ${ED.meta.trash.length ? `<div class="ed-warn">${ICON.warn} ${edCount(ED.meta.trash.length, "פריט אחד בסל יימחק", "שני פריטים בסל יימחקו", "פריטים בסל יימחקו")} לצמיתות.</div>` : ""}
        <p class="ed-hint">הכול נכנס לקומיט אחד בענף חדש. הטיול החי לא משתנה עד שתאשרו את המיזוג.</p>

        <div class="ed-field"><span>הגדרות GitHub</span></div>
        <label class="ed-field">
          <span>מאגר</span>
          <input data-gh="repo" value="${escapeHTML(ghRepo())}" dir="ltr" placeholder="owner/repo">
        </label>
        <label class="ed-field">
          <span>אסימון גישה (fine-grained, הרשאות Contents ו-Pull requests)</span>
          <input data-gh="token" type="password" value="${escapeHTML(ghToken())}" dir="ltr" placeholder="github_pat_…">
        </label>
        <p class="ed-hint">האסימון נשמר במכשיר הזה בלבד. כדאי להגביל אותו למאגר הזה ולתת לו תאריך תפוגה — אם המכשיר הולך לאיבוד, מבטלים אותו ב-GitHub.</p>
        ${p.error ? `<div class="ed-warn">${ICON.warn} ${escapeHTML(p.error)}</div>` : ""}
        ${p.step ? `<p class="ed-hint">${escapeHTML(p.step)}</p>` : ""}
      `}
    </div>
  `;
}

// ספירה בעברית: "1 פעילויות" נקרא שגוי, ו-2 מקבל צורת זוגי.
function edCount(n, one, two, many) {
  return n === 1 ? one : n === 2 ? two : `${n} ${many}`;
}

function edPendingSummary() {
  const out = [];
  let images = 0;
  ED.trip.days.forEach(d => d.blocks.forEach(b => { if (b.image && b.image.pending) images++; }));
  const pods = Object.values(ED.trip.podcasts || {}).filter(p => p.pending);

  const stops = ED.trip.days.reduce((n, d) => n + d.blocks.length, 0);
  out.push({
    icon: ICON.calendar,
    label: `trip.json — ${edCount(ED.trip.days.length, "יום אחד", "יומיים", "ימים")}, ${edCount(stops, "פעילות אחת", "שתי פעילויות", "פעילויות")}`,
    size: ""
  });
  if (images) out.push({
    icon: ICON.camera,
    label: `${edCount(images, "תמונה אחת", "שתי תמונות", "תמונות")} מוויקישיתוף`,
    size: images === 1 ? "יורדת בפרסום" : "יורדות בפרסום"
  });
  for (const p of pods) out.push({ icon: ICON.headphones, label: p.file, size: p.sizeLabel || "" });
  out.push({ icon: ICON.link, label: "trips/index.json", size: "" });
  return out;
}

function edOpenPublish() {
  ED.publish = { busy: false, step: "", error: null, done: null };
  edRender();
}

async function edRunPublish() {
  const p = ED.publish;
  p.busy = true; p.error = null; edRender();
  try {
    const pr = await edPublishRun(step => { p.step = step; edRender(); });
    p.done = pr;
  } catch (err) {
    p.error = String(err.message || err);
  }
  p.busy = false;
  p.step = "";
  edRender();
}

/* ---------- העלאת פרק ----------
   הדפדפן כאן לא יודע לקודד AAC (AudioEncoder תומך ב-Opus בלבד), ו-Opus
   לא מתנגן אמין ב-iOS — בדיוק הסיבה ש-convert-audio.sh מייצר m4a. לכן
   קובץ דחוס נלקח כמו שהוא, ו-WAV נשלח לסקריפט במקום להמיר כאן חצי-עבודה. */

const ED_AUDIO_MAX = 12 * 1024 * 1024;

async function edAttachEpisode(area, file) {
  const name = file.name.toLowerCase();
  const isCompressed = /\.(m4a|mp3|aac|mp4)$/.test(name);

  if (!isCompressed) {
    alert(`הדפדפן הזה לא יודע לקודד AAC, והמרה ל-Opus לא מתנגנת אמין באייפון.\n\n` +
      `להריץ במחשב:\n  tools/convert-audio.sh "${file.name}" ${area} ${ED.trip.id}\n\n` +
      `ואז לבחור כאן את הקובץ שנוצר תחת audio/.`);
    return;
  }
  if (file.size > ED_AUDIO_MAX) {
    alert(`הקובץ ${Math.round(file.size / 1024 / 1024)} מ״ב — גדול מדי לפרק.\n` +
      `להריץ אותו דרך tools/convert-audio.sh, שמכווץ ל-AAC מונו 32kbps.`);
    return;
  }

  const seconds = await edAudioDuration(file);
  const pod = ED.trip.podcasts[area] || { title: area, file: `audio/${area}.m4a`, rev: 1 };
  const replacing = !!pod.ready;

  pod.file = `audio/${area}.m4a`;
  pod.minutes = Math.max(1, Math.round(seconds / 60));
  pod.ready = true;
  pod.pending = true;
  pod.sizeLabel = `${(file.size / 1024 / 1024).toFixed(1)} מ״ב`;
  // החלפת פרק שכבר פורסם חייבת להעלות rev — הפרקים נשמרים במטמון לפי
  // כתובת, ובלי זה מכשיר שכבר הוריד אותו ינגן את הישן לנצח.
  if (replacing) pod.rev = (pod.rev || 1) + 1;

  ED.trip.podcasts[area] = pod;
  await edAssetPut(ED.trip.id, pod.file, file);
  edSaveDraft();
  edRender();
}

/* ---------- העלאת תמונה ידנית ----------
   כמו קובץ פרק, תמונה שהועלתה מהמכשיר צריכה לשרוד רענון דף עד הפרסום —
   נשמרת ב-IndexedDB (edAssetPut) ולא ב-thumb/blob URL, כי blob URL לא
   שורד רענון. ה-image מסומן localAsset כדי שהרינדור ידע למשוך אותה
   מחדש מה-IndexedDB בכל הצגה (ר' hydratePendingImages ב-app.js), ולא
   כדי שהוא ייכתב ישירות ל-src בזמן בנייה. */

function edGuessImageExt(url) {
  const m = /\.(jpe?g|png|webp|gif)(?:[?#]|$)/i.exec(url);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

async function edAttachPhoto(file) {
  const b = ED.form.block;
  const ext = (/\.([a-z0-9]+)$/i.exec(file.name) || [, "jpg"])[1].toLowerCase();
  const path = `images/${edSlug(b.title || "photo")}-${Date.now().toString(36)}.${ext}`;
  await edAssetPut(ED.trip.id, path, file);
  b.image = { file: path, credit: "", license: "", pending: true, localAsset: true };
  edRender();
}

function edAudioDuration(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(a.duration || 0); };
    a.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
    a.src = url;
  });
}
