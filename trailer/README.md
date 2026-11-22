# טריילר לאתר של טל לוי

- `tal-levi-trailer-16x9.mp4`: לרוחב (1920×1080), ל-YouTube, לאתר ולמחשב.
- `tal-levi-trailer-9x16.mp4`: לאורך (1080×1920), לרילס ולסטורי באינסטגרם, לטיקטוק ולסטטוס בוואטסאפ.

אורך 38 שניות, בלי מוזיקה. כשמעלים לאינסטגרם או לטיקטוק אפשר להוסיף שם מוזיקה מהספרייה שלהם.

## יצירה מחדש (למשל אחרי שמוסיפים שמות ומחירים לציורים)
```
node source/rec.js wide frames-wide && source/encode.sh frames-wide tal-levi-trailer-16x9.mp4
node source/rec.js tall frames-tall && source/encode.sh frames-tall tal-levi-trailer-9x16.mp4
```
צריך Node עם Playwright ו-ffmpeg. הנתיבים לאתר מוגדרים בראש `rec.js`.
