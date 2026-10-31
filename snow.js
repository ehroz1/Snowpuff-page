/* Snowpuff page: falling snow that settles on the page, sweeps away from the cursor
   and is driven by the working menu. */
(() => {
  "use strict";

  const canvas = document.getElementById("snow");
  const ctx = canvas.getContext("2d");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const COL = 3;                 // drift column width, px
  const REPOSE = 1.5;            // largest height step between columns before snow slumps
  const RATES = { off: 0, light: 150, steady: 380, heavy: 800, variable: 380 };

  const settings = {
    rate: "steady",
    accumulate: true,
    melt: true,
    onWindows: true,
    icicles: true,
    warm: true,
    puff: false,
  };

  let W = 0, H = 0, dpr = 1;
  let time = 0;
  const flakes = [];
  const shards = [];
  const pointer = { x: -1e4, y: -1e4, vx: 0, vy: 0, speed: 0, active: false, t: 0 };
  let layoutKey = "";
  let blow = 0;                  // microphone gust strength, 0…1

  // ---------- sprites ----------
  function sprite(color, size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color);
    grad.addColorStop(1, "rgba(255,240,220,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }
  const SNOW = sprite("rgba(255,243,226,1)", 32);
  const LIT = sprite("rgba(255,246,220,1)", 32);
  const WARM = sprite("rgba(255,214,150,1)", 32);

  // ---------- surfaces ----------
  const surfaces = [...document.querySelectorAll("[data-surface]")].map((el) => ({
    el,
    kind: el.dataset.surface,
    seed: +el.dataset.seed || 0,
    max: el.dataset.surface === "ledge" ? 34 : 24,
    h: new Float32Array(0),
    width: 0,
    rect: null,
    pageX: null, pageY: null, vx: 0, vy: 0,
    spillL: 0, spillR: 0,
    icicles: [],
    hasIcicles: el.hasAttribute("data-icicles") || el.dataset.surface === "ledge",
  }));

  function noise(i, seed) {
    return Math.sin(i * 0.071 + seed) * 0.5 + Math.sin(i * 0.23 + seed * 2.1) * 0.3 + Math.sin(i * 0.61 + seed * 0.7) * 0.2;
  }

  function sizeSurface(s) {
    const rect = s.el.getBoundingClientRect();
    const n = Math.max(2, Math.ceil(rect.width / COL));
    if (n === s.h.length) return;
    const old = s.h;
    const h = new Float32Array(n);
    if (old.length) {
      for (let i = 0; i < n; i++) h[i] = old[Math.min(old.length - 1, Math.floor((i / n) * old.length))];
    } else if (s.seed) {
      for (let i = 0; i < n; i++) {
        const edge = Math.min(1, Math.min(i, n - 1 - i) / 10);
        h[i] = Math.max(0, s.seed * (0.72 + 0.35 * noise(i, s.seed)) * edge);
      }
    }
    s.h = h;
    s.width = rect.width;
    s.icicles = [];
    if (s.hasIcicles) {
      const gap = s.kind === "ledge" ? 150 : 46;
      for (let x = 18 + Math.random() * gap; x < rect.width - 14; x += gap * (0.5 + Math.random())) {
        const max = 6 + Math.random() ** 1.6 * (s.kind === "ledge" ? 34 : 24);
        s.icicles.push({ x, len: s.seed ? Math.random() * max * 0.7 : 0, max, w: 2.2 + Math.random() * 2.6 });
      }
    }
  }

  function surfaceOn(s) {
    return s.kind !== "window" || settings.onWindows;
  }

  // ---------- flakes ----------
  function makeFlake(f, anywhere) {
    const depth = Math.random() ** 0.8;
    f.depth = depth;
    f.r = 0.7 + depth * 2.1 + Math.random() * 0.5;
    f.x = Math.random() * (W + 120) - 60;
    f.y = anywhere ? Math.random() * H : -10 - Math.random() * 40;
    f.vt = 22 + depth * 46 + Math.random() * 10;   // terminal fall speed
    f.vx = 0;
    f.vy = f.vt;
    f.phase = Math.random() * Math.PI * 2;
    f.sway = 6 + Math.random() * 16;
    f.freq = 0.4 + Math.random() * 0.8;
    f.alpha = 0.32 + depth * 0.5;
    f.collide = depth > 0.45;
    f.spray = false;
    return f;
  }

  function spray(x, y, vx, vy) {
    if (flakes.length > 4000) return;
    const f = makeFlake({}, false);
    f.x = x; f.y = y;
    f.vx = vx; f.vy = vy;
    f.r = 0.8 + Math.random() * 1.6;
    f.depth = 0.9;
    f.alpha = 0.85;
    f.collide = true;
    f.spray = true;
    flakes.push(f);
  }

  function targetCount() {
    let rate = RATES[settings.rate];
    if (settings.rate === "variable") {
      const swell = 0.5 + 0.5 * Math.sin(time / 23) * Math.sin(time / 9.7 + 1.3);
      rate = 60 + swell * 760;
    }
    const area = (W * H) / (1440 * 900);
    return Math.round(rate * area * 0.75 * (reduceMotion ? 0.3 : 1));
  }

  // ---------- simulation ----------
  function step(dt) {
    time += dt;
    const sx = scrollX, sy = scrollY;

    // a layout change (fonts loading, resize) moves surfaces without anyone shaking them
    const layout = document.documentElement.scrollHeight + "x" + W;
    if (layout !== layoutKey) { layoutKey = layout; for (const s of surfaces) s.pageX = null; }

    // surfaces: position, motion, slump, melt
    for (const s of surfaces) {
      s.rect = s.el.getBoundingClientRect();
      if (Math.abs(s.rect.width - s.width) > 1) sizeSurface(s);
      const px = s.rect.left + sx, py = s.rect.top + sy;
      if (s.pageX !== null && dt > 0) {
        s.vx = s.vx * 0.5 + ((px - s.pageX) / dt) * 0.5;
        s.vy = s.vy * 0.5 + ((py - s.pageY) / dt) * 0.5;
      }
      s.pageX = px; s.pageY = py;
      const h = s.h, n = h.length;
      const visible = s.rect.bottom > -60 && s.rect.top < H + 60;

      // shaken window: snow slides off, icicles break
      const speed = Math.hypot(s.vx, s.vy);
      if (s.kind === "window" && speed > 650) {
        const frac = Math.min(1, (speed - 650) / 1400) * 0.6;
        shed(s, frac, s.vx * 0.55, s.vy * 0.4 - 40, visible);
        if (speed > 900) breakIcicles(s);
      }
      if (!surfaceOn(s)) { shed(s, 1, 0, 30, visible); breakIcicles(s); }
      if (!settings.accumulate) for (let i = 0; i < n; i++) h[i] = Math.max(0, h[i] - dt * (4 + h[i] * 0.8));

      // slump toward the angle of repose; snow past the ends spills off
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < n - 1; i++) {
          const d = h[i] - h[i + 1];
          if (d > REPOSE) { const m = (d - REPOSE) * 0.3; h[i] -= m; h[i + 1] += m; }
          else if (d < -REPOSE) { const m = (-d - REPOSE) * 0.3; h[i] += m; h[i + 1] -= m; }
        }
        if (h[0] > REPOSE) { const m = (h[0] - REPOSE) * 0.3; h[0] -= m; s.spillL += m; }
        if (h[n - 1] > REPOSE) { const m = (h[n - 1] - REPOSE) * 0.3; h[n - 1] -= m; s.spillR += m; }
      }
      if (s.spillL > 2.2) { s.spillL = 0; if (visible) spray(s.rect.left - 1, s.rect.top - 2, -10 - Math.random() * 20, 10); }
      if (s.spillR > 2.2) { s.spillR = 0; if (visible) spray(s.rect.right + 1, s.rect.top - 2, 10 + Math.random() * 20, 10); }

      if (settings.melt) {
        const falling = RATES[settings.rate] / 380;
        const pace = 0.04 + 0.05 * falling;
        for (let i = 0; i < n; i++) h[i] = Math.max(0, h[i] - dt * (pace + h[i] * 0.01 * (0.5 + falling)));
      }

      // icicles grow under snow
      for (const ic of s.icicles) {
        const c = Math.min(n - 1, Math.floor(ic.x / COL));
        const snow = (h[c] + h[Math.max(0, c - 3)] + h[Math.min(n - 1, c + 3)]) / 3;
        if (settings.icicles && surfaceOn(s) && snow > 5) ic.len = Math.min(ic.max, ic.len + dt * (0.5 + snow * 0.06));
        else if (!settings.icicles) ic.len = 0;
        else if (settings.melt && snow < 1) ic.len = Math.max(0, ic.len - dt * 0.6);
      }

      // the cursor sweeps the drift
      if (visible && pointer.active && pointer.speed > 25 && surfaceOn(s)) {
        const R = 46;
        const top = s.rect.top;
        if (pointer.y > top - s.max - 26 && pointer.y < top + 14 && pointer.x > s.rect.left - R && pointer.x < s.rect.right + R) {
          const c0 = Math.max(0, Math.floor((pointer.x - R - s.rect.left) / COL));
          const c1 = Math.min(n - 1, Math.ceil((pointer.x + R - s.rect.left) / COL));
          for (let i = c0; i <= c1; i++) {
            const x = s.rect.left + i * COL + COL / 2;
            const dx = Math.abs(x - pointer.x);
            if (dx > R || h[i] < 0.2) continue;
            const surfaceY = top - h[i];
            if (pointer.y < surfaceY - 22) continue;
            const take = Math.min(h[i], (1 - dx / R) * Math.min(pointer.speed, 1600) * dt * 0.06);
            h[i] -= take;
            let k = take * 0.9;
            while (k > 0 && Math.random() < k) {
              const side = Math.sign(x - pointer.x) || 1;
              spray(x, surfaceY + Math.random() * 3,
                pointer.vx * 0.35 + side * (30 + Math.random() * 90),
                -60 - Math.random() * 140 - pointer.speed * 0.08);
              k -= 1;
            }
          }
        }
      }

      // a breath lifts the drift
      if (visible && blow > 0.05 && surfaceOn(s)) {
        for (let i = 0; i < n; i++) {
          if (h[i] < 0.3) continue;
          const take = Math.min(h[i], h[i] * blow * dt * 1.6);
          h[i] -= take;
          if (Math.random() < take * 0.7) {
            spray(s.rect.left + i * COL, s.rect.top - h[i], (Math.random() - 0.5) * 260 * blow, -80 - Math.random() * 260 * blow);
          }
        }
      }
    }

    // keep the snowfall at its rate
    const target = targetCount();
    let normal = 0;
    for (const f of flakes) if (!f.spray) normal++;
    let budget = Math.ceil(target / 60) + 2;
    while (normal < target && budget-- > 0) { flakes.push(makeFlake({}, false)); normal++; }

    const wind = Math.sin(time / 11) * 8 + Math.sin(time / 4.3) * 4;

    for (let i = flakes.length - 1; i >= 0; i--) {
      const f = flakes[i];
      const prevY = f.y;

      // drift toward the steady fall with a slow sway
      const swayV = Math.cos(time * f.freq + f.phase) * f.sway + wind * (0.4 + f.depth);
      const k = f.spray ? 2.2 : 3;
      f.vx += (swayV - f.vx) * Math.min(1, dt * (f.spray ? 1.4 : k));
      f.vy += (f.vt - f.vy) * Math.min(1, dt * (f.spray ? 2.4 : k));
      if (f.spray && f.vy > f.vt * 0.9 && Math.abs(f.vx - swayV) < 10) f.spray = false;

      // the cursor pushes flakes aside
      if (pointer.active) {
        const dx = f.x - pointer.x, dy = f.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 80 * 80 && d2 > 1) {
          const d = Math.sqrt(d2);
          const push = (1 - d / 80) * (120 + pointer.speed * 0.6) * f.depth;
          f.vx += (dx / d) * push * dt * 6 + pointer.vx * dt * 1.5 * (1 - d / 80);
          f.vy += (dy / d) * push * dt * 6 + pointer.vy * dt * 1.5 * (1 - d / 80);
        }
      }
      if (blow > 0.05) {
        f.vx += (Math.random() - 0.5) * 600 * blow * dt;
        f.vy -= 380 * blow * dt * f.depth;
      }

      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // landing
      let landed = false;
      if (f.collide && f.vy > 0) {
        for (const s of surfaces) {
          const r = s.rect;
          if (!r || !surfaceOn(s) || f.x < r.left || f.x >= r.right) continue;
          if (f.y < r.top - s.max - 4 || prevY > r.top + 2) continue;
          const c = Math.min(s.h.length - 1, Math.floor((f.x - r.left) / COL));
          const top = r.top - s.h[c];
          if (f.y >= top && prevY <= top + 3) {
            if (settings.accumulate && s.h[c] < s.max) {
              const amt = f.r * 0.55;
              s.h[c] += amt * 0.5;
              if (c > 0) s.h[c - 1] += amt * 0.25;
              if (c < s.h.length - 1) s.h[c + 1] += amt * 0.25;
            }
            landed = true;
            break;
          }
        }
      }

      if (landed || f.y > H + 20 || f.x < -80 || f.x > W + 80 || f.y < -400) {
        if (!f.spray && !landed && normal <= target && f.y > H + 20) makeFlake(f, false);
        else { flakes[i] = flakes[flakes.length - 1]; flakes.pop(); }
      }
    }

    // icicle shards
    for (let i = shards.length - 1; i >= 0; i--) {
      const sh = shards[i];
      sh.vy += 1400 * dt;
      sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.rot += sh.spin * dt;
      sh.life -= dt;
      if (sh.life <= 0 || sh.y > H + 40) {
        for (let k = 0; k < 4; k++) spray(sh.x, sh.y, (Math.random() - 0.5) * 160, -60 - Math.random() * 120);
        shards[i] = shards[shards.length - 1]; shards.pop();
      }
    }

    pointer.speed *= Math.max(0, 1 - dt * 8);
    pointer.vx *= Math.max(0, 1 - dt * 8);
    pointer.vy *= Math.max(0, 1 - dt * 8);
  }

  function shed(s, frac, vx, vy, visible) {
    const h = s.h;
    for (let i = 0; i < h.length; i++) {
      if (h[i] < 0.15) { h[i] = Math.max(0, h[i] - frac * h[i]); continue; }
      const take = h[i] * frac;
      h[i] -= take;
      if (visible && Math.random() < take * 0.7) {
        spray(s.rect.left + i * COL, s.rect.top - h[i] - Math.random() * take,
          vx + (Math.random() - 0.5) * 80, vy - Math.random() * 60);
      }
    }
  }

  function breakIcicles(s) {
    for (const ic of s.icicles) {
      if (ic.len > 2 && s.rect) {
        shards.push({
          x: s.rect.left + ic.x, y: s.rect.bottom, len: ic.len, w: ic.w,
          vx: s.vx * 0.3 + (Math.random() - 0.5) * 60, vy: Math.max(0, s.vy * 0.2) + Math.random() * 40,
          rot: 0, spin: (Math.random() - 0.5) * 6, life: 0.5 + Math.random() * 0.5,
        });
      }
      ic.len = 0;
    }
  }

  // ---------- drawing ----------
  function beams() {
    return [...document.querySelectorAll(".lamp")].map((lamp) => {
      const shade = lamp.querySelector(".lamp__shade").getBoundingClientRect();
      const beam = lamp.querySelector(".lamp__beam").getBoundingClientRect();
      return { x: shade.left + shade.width / 2, y: shade.bottom, spread: beam.width / 2, reach: beam.height };
    }).filter((b) => b.y + b.reach > 0 && b.y < H);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const lights = beams();
    const card = settings.warm ? document.getElementById("card").getBoundingClientRect() : null;

    // flakes
    for (const f of flakes) {
      if (f.y < -10 || f.y > H + 10) continue;
      let img = SNOW, a = f.alpha * 0.8;
      for (const b of lights) {
        const dy = f.y - b.y;
        if (dy > 0 && dy < b.reach && Math.abs(f.x - b.x) < 6 + (b.spread * 0.82 * dy) / b.reach) {
          img = LIT; a = Math.min(1, f.alpha * 1.5 * (1 - (dy / b.reach) * 0.5)); break;
        }
      }
      if (card && img === SNOW && f.x > card.left - 70 && f.x < card.right + 70 && f.y > card.top - 70 && f.y < card.bottom + 70) {
        img = WARM; a = Math.min(1, f.alpha * 1.1);
      }
      const size = f.r * 3.2;
      ctx.globalAlpha = a;
      ctx.drawImage(img, f.x - size / 2, f.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;

    // drifts and icicles
    for (const s of surfaces) {
      const r = s.rect;
      if (!r || r.bottom < -60 || r.top > H + 60) continue;
      drawIcicles(s, r);
      drawDrift(s, r);
    }

    // shards
    for (const sh of shards) {
      ctx.save();
      ctx.translate(sh.x, sh.y);
      ctx.rotate(sh.rot);
      ctx.globalAlpha = Math.min(1, sh.life * 2);
      ctx.fillStyle = "rgba(255,246,228,.85)";
      ctx.beginPath();
      ctx.moveTo(-sh.w / 2, 0); ctx.lineTo(sh.w / 2, 0); ctx.lineTo(0, sh.len);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawDrift(s, r) {
    const h = s.h, n = h.length;
    let any = false;
    for (let i = 0; i < n; i++) if (h[i] > 0.25) { any = true; break; }
    if (!any) return;

    const base = r.top + (s.kind === "ledge" ? 1 : 0.5);
    const inset = s.kind === "window" ? 3 : 0;
    const x0 = r.left + inset, x1 = r.right - inset;
    const step = (x1 - x0) / (n - 1);
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([x0 + i * step, base - Math.max(0, h[i])]);

    ctx.beginPath();
    ctx.moveTo(x0, base);
    ctx.lineTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
    ctx.lineTo(x1, base);
    ctx.closePath();

    const g = ctx.createLinearGradient(0, base - s.max, 0, base);
    g.addColorStop(0, "#FFF8EE");
    g.addColorStop(0.55, "#F6E4D2");
    g.addColorStop(1, "#C99A80");
    ctx.fillStyle = g;
    ctx.shadowColor = "rgba(255, 207, 148, 0.35)";
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(255, 252, 244, 0.9)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawIcicles(s, r) {
    if (!surfaceOn(s)) return;
    for (const ic of s.icicles) {
      if (ic.len < 1) continue;
      const x = r.left + ic.x, y = r.bottom - 1;
      const g = ctx.createLinearGradient(0, y, 0, y + ic.len);
      g.addColorStop(0, "rgba(255,248,236,.95)");
      g.addColorStop(0.6, "rgba(255,236,206,.6)");
      g.addColorStop(1, "rgba(255,226,190,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - ic.w / 2, y);
      ctx.quadraticCurveTo(x - ic.w * 0.15, y + ic.len * 0.5, x, y + ic.len);
      ctx.quadraticCurveTo(x + ic.w * 0.15, y + ic.len * 0.5, x + ic.w / 2, y);
      ctx.closePath();
      ctx.fill();
    }
  }

  // ---------- loop ----------
  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    for (const s of surfaces) sizeSurface(s);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (settings.puff) listen();
    step(dt);
    draw();
    requestAnimationFrame(frame);
  }

  addEventListener("resize", resize);
  resize();
  for (let i = 0; i < targetCount(); i++) flakes.push(makeFlake({}, true));
  requestAnimationFrame(frame);

  // ---------- pointer ----------
  addEventListener("pointermove", (e) => {
    const now = performance.now();
    const dt = Math.max(0.008, (now - pointer.t) / 1000);
    if (pointer.active && now - pointer.t < 120) {
      const vx = (e.clientX - pointer.x) / dt, vy = (e.clientY - pointer.y) / dt;
      pointer.vx = pointer.vx * 0.5 + vx * 0.5;
      pointer.vy = pointer.vy * 0.5 + vy * 0.5;
      pointer.speed = Math.hypot(pointer.vx, pointer.vy);
    }
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.t = now;
    pointer.active = true;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer.active = false; });
  addEventListener("blur", () => { pointer.active = false; });

  // ---------- draggable window ----------
  const card = document.getElementById("card");
  const bar = document.getElementById("card-bar");
  let drag = null;
  bar.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    bar.setPointerCapture(e.pointerId);
    card.classList.add("dragging");
  });
  bar.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    card.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px)`;
  });
  const release = () => {
    if (!drag) return;
    drag = null;
    card.classList.remove("dragging");
    card.style.transform = "";
  };
  bar.addEventListener("pointerup", release);
  bar.addEventListener("pointercancel", release);

  // ---------- microphone ----------
  let audio = null;
  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const src = ac.createMediaStreamSource(stream);
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 500;
      const analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(filter).connect(analyser);
      audio = { stream, ac, analyser, buf: new Float32Array(analyser.fftSize), level: 0 };
      return true;
    } catch {
      return false;
    }
  }
  function stopMic() {
    if (!audio) return;
    audio.stream.getTracks().forEach((t) => t.stop());
    audio.ac.close();
    audio = null;
    blow = 0;
  }
  function listen() {
    if (!audio) return;
    audio.analyser.getFloatTimeDomainData(audio.buf);
    let sum = 0;
    for (const v of audio.buf) sum += v * v;
    const rms = Math.sqrt(sum / audio.buf.length);
    audio.level = audio.level * 0.7 + rms * 0.3;
    blow = Math.max(0, Math.min(1, (audio.level - 0.06) * 6));
  }

  // ---------- menu ----------
  const menu = document.getElementById("menu");
  function sync() {
    for (const b of menu.querySelectorAll("[data-rate]")) b.setAttribute("aria-checked", String(b.dataset.rate === settings.rate));
    for (const b of menu.querySelectorAll("[data-toggle]")) b.setAttribute("aria-checked", String(!!settings[b.dataset.toggle]));
    card.classList.toggle("glow", settings.warm);
  }
  menu.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.rate) settings.rate = b.dataset.rate;
    if (b.dataset.toggle) {
      const key = b.dataset.toggle;
      if (key === "puff") {
        if (settings.puff) { settings.puff = false; stopMic(); }
        else { settings.puff = await startMic(); }
      } else {
        settings[key] = !settings[key];
      }
    }
    if (b.dataset.action === "clear") {
      for (const s of surfaces) { shed(s, 1, 0, 20, s.rect && s.rect.bottom > 0 && s.rect.top < H); breakIcicles(s); }
    }
    if (b.dataset.action === "quit") {
      settings.rate = "off";
      for (const s of surfaces) { s.h.fill(0); breakIcicles(s); }
    }
    sync();
  });
  sync();
})();
