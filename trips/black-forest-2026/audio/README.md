# audio/

כאן יושבים פרקי הפודקאסט לילדים, קובץ אחד לכל אזור פעילות:

```
audio/feldberg.m4a      audio/triberg.m4a
audio/todtnau.m4a       audio/gutach.m4a
audio/vogelpark.m4a     audio/rheinfall.m4a
audio/europapark.m4a    audio/badeparadies.m4a
audio/titisee.m4a       audio/lindt.m4a
audio/freiburg.m4a      audio/rulantica.m4a
```

שמות הקבצים אינם שרירותיים — הם חייבים להתאים לשדה `file` שברשומת האזור
תחת `podcasts` שב-`trip.json` של הטיול. אזור שאין לו קובץ עדיין: שם המקום באפליקציה נשאר לחיץ, ומי
שילחץ עליו יקבל הודעה שהפרק עוד לא הועלה, במקום נגן שבור.

**אין לשים כאן קבצי WAV.** WAV הוא בסביבות 10 מגה-בייט לדקה, ו-12 פרקים
כאלה מנפחים את המאגר במאות מגה-בייט. את הקובץ שמורידים מ-NotebookLM
מעבירים דרך `tools/convert-audio.sh`, שממיר אותו ל-AAC מונו — בסביבות
מגה-בייט וחצי לפרק — ומניח אותו כאן בשם הנכון.

איך מייצרים פרק: `podcast-scripts/README.md`.

הקבצים כאן **לא** נכנסים ל-`SHELL` שב-`sw.js` בכוונה: אין סיבה שההתקנה
הראשונה של האפליקציה תוריד את כל הפרקים. פרק נשמר למטמון נפרד
(`bf2026-audio`) בהאזנה הראשונה אליו, והמטמון הזה שורד עדכוני גרסה
של האפליקציה.
