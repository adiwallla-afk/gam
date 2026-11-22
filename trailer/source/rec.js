const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const FMT = process.argv[2] || 'wide';
const OUT = path.resolve(process.argv[3] || `frames-${FMT}`);
const SITE = 'file:///home/user/gam/tal-levi-art/index.html';
const IMG = 'file:///home/user/gam/tal-levi-art/images';
const CARDS = 'file://' + path.resolve(__dirname, 'cards.html');
const FPS = 30;
const VP = FMT === 'wide' ? { width: 1440, height: 810, dsf: 4/3 } : { width: 405, height: 720, dsf: 8/3 };
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : (x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3) / 2);
const clamp = x => Math.max(0, Math.min(1, x));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: VP.width, height: VP.height }, deviceScaleFactor: VP.dsf, colorScheme: 'light' });
  const page = await ctx.newPage();
  let sceneNo = 0;
  async function record(name, dur, step) {
    const dir = path.join(OUT, String(++sceneNo).padStart(2, '0') + '-' + name);
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(dur * FPS);
    for (let f = 0; f < n; f++) {
      await step(f / FPS, dur);
      await page.screenshot({ path: path.join(dir, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    }
    console.log(FMT, name, n, 'frames');
  }
  async function card(name, dur) {
    await page.goto(CARDS); await page.evaluate(([n, d]) => build(n, d), [name, IMG]);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => { const u = getComputedStyle(document.querySelector('.bg')).backgroundImage.slice(5, -2); return new Promise(r => { const i = new Image(); i.onload = () => r(true); i.src = u; }); });
    await record('card-' + name, dur, (t, d) => page.evaluate(([t, d]) => setT(t, d), [t, d]));
  }

  // ---- site setup ----
  async function openSite(theme) {
    await page.goto(SITE);
    await page.evaluate(t => { try { localStorage.setItem('theme', t); } catch {} }, theme);
    await page.goto(SITE);
    await page.addStyleTag({ content: `
      html{scroll-behavior:auto!important}
      #cap{position:fixed;inset:${FMT==='wide'?'auto 0 40px 0':'84px 0 auto 0'};margin:0 auto;width:max-content;max-width:90vw;border:0;padding:12px 26px;border-radius:999px;
        background:rgba(20,18,16,.82);color:#f6f1e7;font:500 ${FMT==='wide'?'26px':'20px'}/1.2 "Frank Ruhl Libre",serif;opacity:0;pointer-events:none;
        box-shadow:0 10px 30px -10px rgba(0,0,0,.5)}
      #cap b{color:#fb923c;font-weight:500}` });
    await page.evaluate(() => { const c = document.createElement('div'); c.id = 'cap'; c.setAttribute('popover', 'manual'); document.body.appendChild(c); c.showPopover(); });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise(r => setTimeout(r, 30)); }
      scrollTo(0, 0);
      await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      await Promise.all(PAINTINGS.flatMap(p => [p.image, ...p.details]).map(s => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = s; })));
    });
  }
  const cap = (text, t, dur, a = .35) => page.evaluate(([text, o]) => {
    const c = document.getElementById('cap'); c.innerHTML = text; c.style.opacity = o;
    if (!c.matches(':popover-open')) c.showPopover(); else { c.hidePopover(); c.showPopover(); }
  }, [text, text ? Math.min(clamp((t - a) / .4), clamp((dur - .3 - t) / .4)) : 0]);
  const y = sel => page.evaluate(s => document.querySelector(s).getBoundingClientRect().top + scrollY - 64, sel);
  const scroll = v => page.evaluate(v => scrollTo(0, v), v);

  // ---- scenes ----
  await card('intro', 3.6);

  await openSite('light');
  await record('hero', 3.2, async (t, d) => { await scroll(ease(t / d) * (FMT === 'wide' ? 90 : 160)); await cap('', t, d); });

  const st = await y('#statement'), stEnd = st + (FMT === 'wide' ? 260 : 700);
  await record('statement', 4, async (t, d) => { await scroll(st + (stEnd - st) * ease(t / d)); await cap('הצהרת האמן', t, d); });

  await card('soul', 3);

  await openSite('light');
  const g0 = await y('#works'), g1 = g0 + (FMT === 'wide' ? 2600 : 5200);
  await record('gallery', 6, async (t, d) => { await scroll(g0 + (g1 - g0) * ease(t / d)); await cap('<b>38</b> עבודות מקוריות', t, d); });

  await scroll(g0);
  await page.click('.chip:nth-child(4)'); await page.waitForTimeout(400);
  const f1 = g0 + (FMT === 'wide' ? 380 : 900);
  await record('filter', 2.8, async (t, d) => { await scroll(g0 + (f1 - g0) * ease(t / d)); await cap('סינון לפי סגנון', t, d); });

  await page.click('.chip:nth-child(1)');
  await page.evaluate(() => { openLB(35); document.getElementById('lb').style.opacity = 0; });
  await page.waitForTimeout(500);
  let shot = 0;
  await record('lightbox', 5, async (t, d) => {
    await page.evaluate(o => document.getElementById('lb').style.opacity = o, ease(t / .45));
    const want = Math.min(3, Math.floor(Math.max(0, t - .9) / 1.0));
    if (want !== shot) { shot = want; await page.evaluate(k => document.querySelectorAll('#lbShots button')[k].click(), shot); await page.waitForTimeout(60); }
    await cap('תקריב על כל ציור', t, d, .6);
  });

  await card('stone', 3.2);

  await openSite('dark');
  const dk0 = await y('#works') + (FMT === 'wide' ? 1200 : 2600), dk1 = dk0 + (FMT === 'wide' ? 900 : 1800);
  await record('dark', 3.4, async (t, d) => { await scroll(dk0 + (dk1 - dk0) * ease(t / d)); await cap('מצב כהה ובהיר', t, d); });

  await openSite('light');
  const c0 = await y('#contact');
  await scroll(c0 - 300);
  await page.selectOption('#workSelect', '35');
  const NAME = 'דנה כהן', REACH = '050-0000000';
  await record('contact', 4.4, async (t, d) => {
    await scroll(c0 - 300 + 300 * ease(t / 1.2) + (FMT === 'wide' ? 0 : 260 * ease((t - 1.2) / 1)));
    await page.evaluate(([a, b2]) => { const f = document.getElementById('inquiry'); f.name.value = a; f.reach.value = b2; },
      [NAME.slice(0, Math.floor(clamp((t - 1.3) / 1.1) * NAME.length)), REACH.slice(0, Math.floor(clamp((t - 2.4) / 1.1) * REACH.length))]);
    await cap('רכישה בהודעה אחת בוואטסאפ', t, d);
  });

  await card('outro', 4.2);
  await b.close();
})();
