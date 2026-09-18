// המעטפת מוגשת מהמטמון מיד (כדי שהאפליקציה תיפתח גם בלי קליטה), ובמקביל
// נמשכת ברקע ונשמרת לפעם הבאה — stale-while-revalidate. קודם זה היה
// cache-first נטו, ואז כל שינוי ב-app.js חייב העלאת המספר כאן, אחרת מכשיר
// שכבר התקין את האפליקציה ממשיך להריץ קוד ישן לנצח. המספר עדיין מנקה מטמון
// ישן בבת אחת, אבל הוא כבר לא התנאי לקבלת עדכון.
const CACHE = "tp-v3";

// פרקי הפודקאסט יושבים במטמון נפרד ובלי מספר גרסה, כדי שעדכון של האפליקציה
// לא ימחק אותם — הורדה חוזרת של כל הפרקים היא הרבה מגה-בייט.
const AUDIO_CACHE = "tp-audio";
// נתוני הטיולים והתמונות שלהם — נשמרים תוך כדי שימוש, לא בהתקנה, כי הם
// משתנים לפי הטיול הפעיל ואין טעם להוריד את כולם מראש.
const TRIPS_CACHE = "tp-trips";
const KEEP = [CACHE, AUDIO_CACHE, TRIPS_CACHE];

// רק מעטפת האפליקציה. הנתונים של כל טיול יושבים ב-trips/ ונשמרים בזמן ריצה,
// אחרת כל טיול חדש היה מחייב לגעת ברשימה הזאת.
const SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./editor.js",
  "./manifest.json",
  "./trips/index.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];
// שימו לב: קבצי audio/ לא נמצאים ב-SHELL בכוונה. הם כמה מגה-בייט כל אחד,
// ואין סיבה שההתקנה הראשונה תוריד את כולם. פרק נשמר כאן בהאזנה הראשונה
// אליו, ומאותו רגע הוא זמין גם בלי קליטה.

// cache: "reload" מכריח כל קובץ ב-SHELL להגיע מהרשת בזמן ההתקנה.
// בלי זה, העלאת המספר של CACHE לא מספיקה: GitHub Pages מגיש את הקבצים עם
// Cache-Control: max-age=600, כך שמכשיר שפתח את האפליקציה בעשר הדקות
// האחרונות היה שומר במטמון החדש דווקא את app.js הישן מהמטמון של הדפדפן —
// ומכיוון שה-Service Worker הוא cache-first, הגרסה הישנה הייתה נתקעת שם
// עד העלאת הגרסה הבאה.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL.map(url => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

const isAudio = url => url.pathname.includes("/audio/");
const isShell = url => /\/(app|editor)\.js$|\/style\.css$|\/index\.html$|\/$/.test(url.pathname);

// השוואה לפי כותרות — ETag או Last-Modified. GitHub Pages ו-http.server
// של פייתון שולחים לפחות אחת מהן; בלי אף אחת לא מכריזים על שינוי.
function changed(cached, fresh) {
  for (const h of ["etag", "last-modified"]) {
    const a = cached.headers.get(h), b = fresh.headers.get(h);
    if (a && b) return a !== b;
  }
  return false;
}

let notified = false;
// יומן קצר של מה ה-worker ראה — הדף יכול לבקש אותו (sw-debug). שימושי
// כשמישהו אומר "אצלי זה לא מתעדכן" ואי אפשר לפתוח לו DevTools.
const swLog = [];
const logPush = entry => { swLog.push(entry); if (swLog.length > 24) swLog.shift(); };
async function notifyUpdated() {
  if (notified) return;
  notified = true;
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  logPush({ t: "notify", clients: clients.length });
  clients.forEach(c => c.postMessage({ type: "shell-updated" }));
}

self.addEventListener("message", event => {
  if (event.data && event.data.type === "sw-debug") {
    event.source.postMessage({ type: "sw-debug", log: swLog.slice(-12), notified });
  }
});
const isTripData = url => /\/trips\/[^/]*\.json$|\/trips\/[^/]+\/trip\.json$|\/trips\/index\.json$/.test(url.pathname);
const isTripAsset = url => url.pathname.includes("/trips/") && !isTripData(url) && !isAudio(url);

/* קבצי הטיול הם התוכן עצמו, ולכן רשת-קודם: ברגע שגרסה חדשה מתמזגת, היא
   מופיעה בלי להעלות את מספר הגרסה של המטמון. אין רשת — חוזרים למה שנשמר. */
async function handleTripData(request) {
  const cache = await caches.open(TRIPS_CACHE);
  try {
    const res = await fetch(request, { cache: "no-store" });
    if (res.status === 200) cache.put(request, res.clone());
    return res;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response(null, { status: 504, statusText: "Offline" });
  }
}

// תמונות של טיול — מטמון-קודם, הן לא משתנות אחרי שפורסמו.
async function handleTripAsset(request) {
  const cache = await caches.open(TRIPS_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res.status === 200) cache.put(request, res.clone());
    return res;
  } catch {
    return new Response(null, { status: 504, statusText: "Offline" });
  }
}

/* נגן אודיו לא מבקש את הקובץ במלואו — הוא שולח בקשות Range ומצפה לתשובת 206
   עם החלק שביקש. תשובה כזאת גם אסור לשמור במטמון (cache.put דוחה 206), וגם אם
   מחזירים 200 שלם במקומה, ספארי ב-iOS נתקע בגרירה בתוך הפרק. לכן כאן חותכים
   את התשובה השלמה שבמטמון לפרוסה ובונים 206 ידנית — ככה פרק שהורד מראש עובד
   באוטו גם בלי קליטה, כולל דילוג קדימה ואחורה. */
async function sliceFromCache(request, cached) {
  const range = request.headers.get("range");
  if (!range) return cached;

  const buffer = await cached.arrayBuffer();
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return cached;

  const total = buffer.byteLength;
  const hasStart = match[1] !== "";
  const hasEnd = match[2] !== "";
  let start, end; // end כולל, כמו בכותרת Content-Range

  if (hasStart) {
    start = Number(match[1]);
    end = hasEnd ? Math.min(Number(match[2]), total - 1) : total - 1;
  } else if (hasEnd) {
    // "bytes=-500" — 500 הבתים האחרונים
    const suffix = Math.min(Number(match[2]), total);
    start = total - suffix;
    end = total - 1;
  } else {
    return cached;
  }

  if (!(start >= 0) || start > end || start >= total) {
    return new Response(null, {
      status: 416,
      statusText: "Range Not Satisfiable",
      headers: { "Content-Range": `bytes */${total}` }
    });
  }

  return new Response(buffer.slice(start, end + 1), {
    status: 206,
    statusText: "Partial Content",
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "audio/mp4",
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes"
    }
  });
}

async function handleAudio(request) {
  // מפתח המטמון הוא תמיד הבקשה בלי Range — פרק אחד, רשומה אחת.
  const plain = new Request(request.url, { credentials: "same-origin" });
  const cache = await caches.open(AUDIO_CACHE);
  const cached = await cache.match(plain);
  if (cached) return sliceFromCache(request, cached);

  try {
    // מביאים את הפרק במלואו גם אם המכשיר ביקש רק פרוסה, כדי שיישמר לאופליין.
    const full = await fetch(plain);
    if (full.status === 200) {
      await cache.put(plain, full.clone());
      return sliceFromCache(request, full);
    }
    // 404 וכל השאר — הפרק כנראה עוד לא הועלה; מעבירים כמו שהוא, האפליקציה מסבירה.
    return full;
  } catch {
    return new Response(null, { status: 504, statusText: "Offline" });
  }
}

// Cache-first for same-origin requests, so the app keeps working with no signal.
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== "GET") return;

  if (isAudio(url)) {
    event.respondWith(handleAudio(event.request));
    return;
  }

  if (isTripData(url)) {
    event.respondWith(handleTripData(event.request));
    return;
  }

  if (isTripAsset(url)) {
    event.respondWith(handleTripAsset(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      // רק 200 שלם נשמר: תשובת 206 חלקית לא ניתנת לאחסון ב-Cache API בכלל.
      const fresh = fetch(event.request).then(res => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, clone));
          // המעטפת השתנתה מאז שנשמרה? מודיעים לדף, שמציע רענון. בלי זה
          // הטעינה הראשונה אחרי כל עדכון מריצה קוד ישן ואף אחד לא יודע.
          if (isShell(url)) logPush({ t: "shell", path: url.pathname, hadCached: !!cached, cLM: cached && cached.headers.get("last-modified"), fLM: res.headers.get("last-modified"), changed: cached ? changed(cached, res) : null });
          if (cached && isShell(url) && changed(cached, res)) notifyUpdated();
        }
        return res;
      }).catch(() => cached);
      // יש עותק שמור — מגישים אותו מיד, והמשיכה מהרשת מעדכנת לפעם הבאה.
      return cached || fresh;
    })
  );
});
