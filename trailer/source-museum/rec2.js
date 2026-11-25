const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const FMT = process.argv[2] || 'wide';
const OUT = path.resolve(process.argv[3] || `frames-${FMT}`);
const SITE = 'http://127.0.0.1:8765/index.html';
const IMG = 'http://127.0.0.1:8765/images';
const CARDS = 'file://' + path.resolve(__dirname, 'cards.html');
const LIB = process.env.LIB || path.resolve(__dirname, '../lib');          // local copies of the CDN scripts (three r128, model-viewer 3.5.0, qrcode-generator 1.4.4)
const THREE_JS = fs.readFileSync(path.join(LIB, 'three.min.js'));
const MV_JS = fs.readFileSync(path.join(LIB, 'model-viewer.min.js')), QR_JS = fs.readFileSync(path.join(LIB, 'qrcode.js'));
const ROOM_PHOTO = process.env.ROOM_PHOTO || path.resolve(__dirname, 'room.jpg');
const FPS = 30, WIDE = FMT === 'wide';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null, CAPTOP = !!process.env.CAPTOP;
const VP = WIDE ? { width: 1440, height: 810, dsf: 4 / 3 } : { width: 405, height: 720, dsf: 8 / 3 };
const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const clamp = x => Math.max(0, Math.min(1, x));

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let ctx, page, sceneNo = 0, clockOn = false;
  async function newPage(phone) {
    if (ctx) await ctx.close();
    ctx = await b.newContext({ viewport: { width: VP.width, height: VP.height }, deviceScaleFactor: VP.dsf, colorScheme: 'light',
      ...(phone ? { isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36' } : {}) });
    page = await ctx.newPage();
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/**', r => r.fulfill({ body: QR_JS, contentType: 'application/javascript' }));
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/three.js/**', r => r.fulfill({ body: THREE_JS, contentType: 'application/javascript' }));
    await page.route('https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/**', r => r.fulfill({ body: MV_JS, contentType: 'application/javascript' }));
    page.on('pageerror', e => console.log('PAGEERROR', e.message));
  }
  async function record(name, dur, step) {
    const dir = path.join(OUT, String(++sceneNo).padStart(2, '0') + '-' + name);
    if (ONLY && !ONLY.includes(name)) return;
    fs.mkdirSync(dir, { recursive: true });
    const n = Math.round(dur * FPS);
    for (let f = 0; f < n; f++) {
      await step(f / FPS, dur);
      if (clockOn) await page.clock.runFor(Math.round((f + 1) * 1000 / FPS) - Math.round(f * 1000 / FPS));
      await page.screenshot({ path: path.join(dir, String(f).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    }
    console.log(FMT, name, n, 'frames');
  }
  async function card(name, dur) {
    await newPage(); clockOn = false;
    await page.goto(CARDS); await page.evaluate(([n, d]) => build(n, d), [name, IMG]);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => { const u = getComputedStyle(document.querySelector('.bg')).backgroundImage.slice(5, -2); return new Promise(r => { const i = new Image(); i.onload = () => r(true); i.src = u; }); });
    await record('card-' + name, dur, (t, d) => page.evaluate(([t, d]) => setT(t, d), [t, d]));
  }
  async function openSite(phone) {
    await newPage(phone);
    await page.clock.install({ time: new Date('2026-11-23T10:00:00') }); clockOn = true;
    await page.goto(SITE);
    await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 1000));   // time only moves when the recorder says so
    await page.addStyleTag({ content: `
      html{scroll-behavior:auto!important} *{transition:none!important}
      #cap{position:fixed;inset:${WIDE && !CAPTOP ? 'auto 0 48px 0' : (WIDE ? '26px 0 auto 0' : '90px 0 auto 0')};margin:0 auto;width:max-content;max-width:88vw;border:1px solid rgba(201,169,110,.55);padding:12px 30px;
        background:rgba(10,9,8,.86);color:#ece4d6;font:400 ${WIDE ? '30px' : '21px'}/1.25 Bellefair,serif;letter-spacing:.02em;opacity:0;pointer-events:none;text-align:center}
      .trailer-room header.top, .trailer-room #room > .head, .trailer-room #progress { display:none!important }
      .trailer-room .room { padding:0!important } .trailer-room .room-stage { height:100vh!important }
      .trailer-room .room-hint { display:none!important }` });
    await page.evaluate(() => { const c = document.createElement('div'); c.id = 'cap'; c.setAttribute('popover', 'manual'); document.body.appendChild(c); c.showPopover(); });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
      await Promise.all([...document.images].filter(i => i.loading !== "lazy").map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
      await Promise.all(PAINTINGS.flatMap(p => [p.image, p.crop, thumb(p.image), ...p.details]).map(s => new Promise(r => { const i = new Image(); i.onload = i.onerror = r; i.src = s; })));
    });
  }
  const cap = (text, t, dur, a = .35) => page.evaluate(([text, o]) => {
    const c = document.getElementById('cap'); c.innerHTML = text; c.style.opacity = o;
    if (c.matches(':popover-open')) c.hidePopover(); c.showPopover();
  }, [text, text ? Math.min(clamp((t - a) / .4), clamp((dur - .3 - t) / .4)) : 0]);
  async function enterRoom() {
    await page.evaluate(() => { document.documentElement.classList.add('trailer-room'); document.getElementById('roomStage').scrollIntoView(); });
    await page.waitForFunction(() => document.getElementById('roomMsg').hidden, null, { timeout: 60000 });
    await page.waitForTimeout(5000);           // real time: let all 38 textures arrive
    for (let k = 0; k < 10; k++) await page.clock.runFor(100);
  }

  // 1 intro
  await card('intro', 3.6);

  // 2 hero: paint with the mouse
  await openSite();
  await page.clock.runFor(300);
  const W = VP.width, H = WIDE ? 760 : 700;
  await record('hero', 4.8, async (t, d) => {
    const s = t / d;
    await page.mouse.move(W * (.75 - .5 * ease(s)), VP.height * (.45 + .12 * Math.sin(s * 5)));
    if (!WIDE) await page.evaluate(y => scrollTo(0, y), Math.round(ease((t - 2.2) / 2.4) * 380));
    await cap('', t, d);
  });

  // statement: the wall text
  const s0 = await page.evaluate(() => document.getElementById('statement').getBoundingClientRect().top + scrollY - 40);
  const s1 = await page.evaluate(() => { const p = document.querySelector('.statement .sig'); return p.getBoundingClientRect().bottom + scrollY - innerHeight + 60; });
  await record('statement', 4.6, async (t, d) => {
    await page.evaluate(y => scrollTo(0, y), Math.round(s0 + (s1 - s0) * ease(t / d)));
    await cap('', t, d);
  });

  // 3 card
  await card('soul', 3);

  // 4 the 3D room: slow look around
  await openSite(); await enterRoom();
  const y0 = await page.evaluate(() => Room.state.yaw);
  await record('room', 5.8, async (t, d) => {
    await page.evaluate(([y]) => { const s = Room.state; s.idle = 0; s.tYaw = s.yaw = y; }, [y0 - ease(t / d) * 1.5]);
    await cap('חדר עגול, אור חם. כל 38 הציורים יחד', t, d, .5);
  });

  // 5 focus on paintings
  let stage = 0;
  await record('focus', 5.6, async (t, d) => {
    const want = t < 2.8 ? 30 : 35;
    if (want !== stage) { stage = want; await page.evaluate(i => Room.focusOn(i), want); }
    await cap('ניגשים לכל ציור מקרוב', t, d, .4);
  });

  // 6 the canvas in 3D
  await openSite();
  await page.evaluate(() => { openLB(4); setTab('three'); });
  await page.waitForTimeout(2500); for (let k = 0; k < 10; k++) await page.clock.runFor(100);
  const bb = await page.locator('#lb3d').boundingBox();
  let flipped = false;
  await record('canvas3d', 5.6, async (t, d) => {
    const s = t / d;
    await page.mouse.move(bb.x + bb.width * (.15 + .7 * s), bb.y + bb.height * (.25 + .4 * Math.sin(s * 3.1)));
    if (!flipped && t > 3.1) { flipped = true; await page.evaluate(() => document.getElementById('flip3d').click()); }
    await cap('מסובבים את הקנבס, והאור זז על המכחול', t, d, .4);
  });

  // 7 card
  await card('stone', 3.2);

  // 8 a photo of your own wall: the painting hangs on it, drag it, size it, try what matches the room
  await openSite();
  await page.evaluate(() => { openLB(30); setTab('wall'); });
  await page.setInputFiles('#wallFile', ROOM_PHOTO);
  await page.waitForFunction(() => !document.getElementById('wallMatch').hidden && document.querySelector('#lbWall .art img').complete);
  await page.waitForTimeout(800); await page.clock.runFor(300);
  const art = await page.locator('#wallArt').boundingBox(), ax = art.x + art.width / 2, ay = art.y + art.height / 2;
  const DX = WIDE ? -170 : -60, DY = WIDE ? 30 : 20; let down = false, up = false, swapped = false;
  await record('mywall', 6.2, async (t, d) => {
    const s = ease((t - .7) / 2.1);
    if (t > .5 && !down) { down = true; await page.mouse.move(ax, ay); await page.mouse.down(); }
    if (down && !up) await page.mouse.move(ax + DX * s, ay + DY * s);
    if (t > 3 && !up) { up = true; await page.mouse.up(); }
    if (t > 3.1 && t < 4.3) await page.evaluate(v => { const r = document.getElementById('wallSize'); r.value = v; r.dispatchEvent(new Event('input')); }, Math.round(32 - 8 * ease((t - 3.1) / 1.1)));
    if (t > 4.5 && !swapped) { swapped = true; await page.evaluate(() => document.querySelector('#wallMatch button:nth-of-type(2)').click()); }
    await cap(t < 4.3 ? 'מצלמים את הקיר שלכם, והציור כבר תלוי עליו' : 'ומקבלים ציורים שמתאימים לצבעי החדר', t < 4.3 ? t : t - 4.3, t < 4.3 ? 4.3 : d - 4.3, t < 4.3 ? .35 : .05);
  });

  // 8b AR: the real canvas on the real wall, at real size
  await openSite(!WIDE);
  await page.evaluate(() => { openLB(30); AR.open(30); });
  for (let k = 0; k < 200; k++) {
    await page.clock.runFor(100); await page.waitForTimeout(50);
    if (await page.evaluate(w => { const m = document.querySelector('model-viewer'); return !!(m && m.loaded) && (w ? !document.getElementById('arQR').hidden : !document.getElementById('arGo').hidden); }, WIDE)) break;
  }
  await page.waitForTimeout(1500); for (let k = 0; k < 10; k++) await page.clock.runFor(100);
  let sz = 1;
  await record('ar', 6, async (t, d) => {
    const k = t < 2.2 ? 1 : t < 3.8 ? 2 : 0;
    if (k !== sz) { sz = k; await page.evaluate(k => document.querySelector(`#arSizes button:nth-child(${k + 1})`).click(), k); }
    await cap(WIDE ? 'וגם במציאות רבודה: סורקים, והציור על הקיר האמיתי' : 'בטלפון: הציור על הקיר האמיתי, בגודל אמיתי', t, d, .4);
  });

  // 9 colour search
  await openSite();
  const top = await page.evaluate(() => document.querySelector('#works .filters').getBoundingClientRect().top + scrollY - (innerWidth < 600 ? 90 : 120));
  await page.evaluate(y => scrollTo(0, y), top);
  const fams = ['red', 'blue', 'yellow']; let fi = -1;
  await record('colors', 4.6, async (t, d) => {
    const k = t < .4 ? -1 : Math.min(2, Math.floor((t - .4) / 1.4));
    if (k !== fi && k >= 0) { fi = k; await page.evaluate(f => document.querySelector(`.swatch[data-fam="${f}"]`).click(), fams[k]); await page.evaluate(y => scrollTo(0, y), top); }
    await cap('מחפשים לפי צבע', t, d, .3);
  });

  // the exhibition wall
  await openSite();
  const g0 = await page.evaluate(() => document.getElementById('grid').getBoundingClientRect().top + scrollY - 160);
  const g1 = g0 + (WIDE ? 1500 : 2600);
  await record('exhibition', 4.6, async (t, d) => {
    await page.evaluate(y => scrollTo(0, y), Math.round(g0 + (g1 - g0) * ease(t / d)));
    await cap('שלושים ושמונה ציורים, ואין שניים דומים', t, d, .3);
  });

  // 10 favourites + contact
  await openSite();
  await page.evaluate(() => { [30, 35, 4].forEach(i => favs.add(i)); syncFavs(); });
  const c0 = await page.evaluate(() => document.getElementById('contact').getBoundingClientRect().top + scrollY - 64);
  await page.evaluate(y => scrollTo(0, y - 260), c0);
  await page.selectOption('#workSelect', 'favs');
  const NAME = 'דנה כהן', REACH = '050-0000000';
  await record('contact', 4.4, async (t, d) => {
    await page.evaluate(y => scrollTo(0, y), Math.round(c0 - 260 + 260 * ease(t / 1.2) + (WIDE ? 0 : 300 * ease((t - 1.2) / 1))));
    await page.evaluate(([a, b2]) => { const f = document.getElementById('inquiry'); f.name.value = a; f.reach.value = b2; },
      [NAME.slice(0, Math.floor(clamp((t - 1.3) / 1.1) * NAME.length)), REACH.slice(0, Math.floor(clamp((t - 2.4) / 1.1) * REACH.length))]);
    await cap('שומרים את מה שאהבתם, ושולחים לטל בהודעה אחת', t, d);
  });

  // 11 outro
  await card('outro', 4.6);
  await b.close();
})();
