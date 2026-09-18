#!/bin/bash
# המרת פרק פודקאסט שהורד מ-NotebookLM לקובץ שהאפליקציה מנגנת.
#
#   tools/convert-audio.sh <קובץ-שהורד> <מזהה-אזור> [מזהה-טיול]
#   tools/convert-audio.sh ~/Downloads/audio-overview.wav feldberg
#
# מזהה הטיול הוא שם התיקייה תחת trips/. אם יש רק טיול אחד, אפשר להשמיט אותו.
#
# למה בכלל להמיר: NotebookLM מוריד WAV, שהוא בסביבות 10 מגה-בייט לדקה.
# 12 פרקים כאלה הם מאות מגה-בייט, וגם הורדה כזאת בטלפון בחו"ל היא בזבוז.
# AAC מונו ב-32kbps נשמע זהה לדיבור ושוקל כמה מגה-בייט לפרק.
#
# הכלי afconvert מגיע עם macOS, אז אין מה להתקין (ffmpeg לא נדרש).

set -euo pipefail

SRC="${1:-}"
AREA="${2:-}"
TRIP_ID="${3:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "$SRC" ] || [ -z "$AREA" ]; then
  echo "שימוש: tools/convert-audio.sh <קובץ-שהורד> <מזהה-אזור> [מזהה-טיול]" >&2
  echo "לדוגמה: tools/convert-audio.sh ~/Downloads/audio-overview.wav feldberg" >&2
  exit 1
fi

if [ ! -f "$SRC" ]; then
  echo "לא נמצא קובץ: $SRC" >&2
  exit 1
fi

# בלי מזהה טיול מפורש — אם יש בדיוק טיול אחד, הוא הברירה הטבעית.
if [ -z "$TRIP_ID" ]; then
  COUNT=$(find "$ROOT/trips" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  if [ "$COUNT" = "1" ]; then
    TRIP_ID="$(basename "$(find "$ROOT/trips" -mindepth 1 -maxdepth 1 -type d)")"
  else
    echo "יש יותר מטיול אחד — צריך לציין מזהה טיול כפרמטר שלישי:" >&2
    find "$ROOT/trips" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sed 's/^/  - /' >&2
    exit 1
  fi
fi

TRIP_JSON="$ROOT/trips/$TRIP_ID/trip.json"
OUT="$ROOT/trips/$TRIP_ID/audio/$AREA.m4a"

if [ ! -f "$TRIP_JSON" ]; then
  echo "לא נמצא קובץ טיול: trips/$TRIP_ID/trip.json" >&2
  exit 1
fi

# המזהה חייב להתאים לרשומה ב-podcasts שבקובץ הטיול, אחרת האפליקציה
# תחפש שם קובץ אחר ותציג "הפרק עוד לא הועלה".
if ! node -e "process.exit(require('$TRIP_JSON').podcasts?.['$AREA'] ? 0 : 1)"; then
  echo "המזהה \"$AREA\" לא מופיע ב-podcasts של trips/$TRIP_ID/trip.json." >&2
  echo "המזהים הקיימים:" >&2
  node -e "Object.keys(require('$TRIP_JSON').podcasts || {}).forEach(k => console.error('  - ' + k))"
  exit 1
fi

mkdir -p "$ROOT/trips/$TRIP_ID/audio"

REPLACING=0
[ -f "$OUT" ] && REPLACING=1

# ההמרה היא בשני שלבים, וזה לא סתם:
# NotebookLM מייצא לפעמים WAV ולפעמים m4a דחוס. כשהמקור כבר דחוס (AAC),
# afconvert לא מצליח למזג לערוץ אחד תוך כדי פענוח וקידוד מחדש, ונופל עם
#   Error: ExtAudioFileSetProperty ('cclo') failed (-66564)
# ('cclo' הוא מבנה הערוצים שהוא מנסה לקבוע). הפתרון: לפענח קודם ל-PCM גולמי,
# ורק ממנו לקודד. עבור מקור WAV השלב הראשון הוא כמעט חינם.
TMP="$(mktemp -t podcast-convert).wav"
trap 'rm -f "$TMP"' EXIT

# שלב 1 — פענוח ל-PCM ומיזוג למונו (‎--mix -c 1).
afconvert -f WAVE -d LEI16 --mix -c 1 "$SRC" "$TMP"

# שלב 2 — קידוד ל-AAC.
# ‎-f m4af   מכולת MPEG-4 audio (‎.m4a)
# ‎-d aac    קידוד AAC-LC
# ‎-b 32000  32kbps — מספיק בהחלט לדיבור מונו
#
# ‎-s 3 (VBR) בכוונה לא כאן — הוא מתעלם מ-‎-b ומנפח את הקובץ פי אחד וחצי.
afconvert -f m4af -d aac -b 32000 "$TMP" "$OUT"

SIZE=$(du -h "$OUT" | cut -f1 | tr -d ' ')
SECS=$(afinfo "$OUT" | awk -F': ' '/estimated duration/ {printf "%.0f", $2}')
MINS=$((SECS / 60))
REST=$((SECS % 60))

# עדכון הרשומה בקובץ הטיול. שלושת הדברים האלה נשכחים כשעושים אותם ביד:
#   ready   — בלעדיו האפליקציה לא מציגה אוזניות על שם המקום בכלל.
#   minutes — המספר שמוצג למשתמש; שיהיה האורך האמיתי ולא הערכה מהתכנון.
#   rev     — בהחלפת פרק קיים חובה להעלות אותו, אחרת מכשיר שכבר הוריד את
#             הפרק ימשיך לנגן את הגרסה הישנה לנצח (המטמון הוא לפי כתובת).
node -e '
const fs = require("fs");
const [file, area, secs, replacing] = process.argv.slice(1);
const trip = JSON.parse(fs.readFileSync(file, "utf8"));
const pod = trip.podcasts[area];
const before = { minutes: pod.minutes, rev: pod.rev || 1, ready: !!pod.ready };
pod.minutes = Math.max(1, Math.round(Number(secs) / 60));
pod.ready = true;
if (replacing === "1" && before.ready) pod.rev = before.rev + 1;
fs.writeFileSync(file, JSON.stringify(trip, null, 2) + "\n");
const notes = [];
if (!before.ready) notes.push("סומן כזמין (ready)");
if (before.minutes !== pod.minutes) notes.push(`אורך ${before.minutes} ← ${pod.minutes} דק׳`);
if (before.rev !== pod.rev) notes.push(`rev ${before.rev} ← ${pod.rev}`);
console.log(notes.length ? "עודכן בקובץ הטיול: " + notes.join(" · ") : "קובץ הטיול כבר היה מעודכן.");
' "$TRIP_JSON" "$AREA" "$SECS" "$REPLACING"

echo "נוצר: trips/$TRIP_ID/audio/$AREA.m4a · $SIZE · ${MINS}:$(printf '%02d' $REST)"
