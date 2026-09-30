/* ==========================================================
   NEBULA — SPACE DEFENDER  ·  script.js
   Works with the provided index.html + style.css.
   Controls: ← → / A D move · Space shoot · P pause · M sound
   Touch: drag to move, ship auto-fires while your finger is down.
   ========================================================== */
(() => {
  'use strict';

  // ---------- Constants ----------
  const W = 800, H = 600;
  const START_LIVES = 3, MAX_LIVES = 5;
  const DURATION = { shield: 8, rapid: 10, spread: 10 };
  const COLOR = {
    cyan: '#19f0ff', magenta: '#ff2e88', violet: '#8a5cff',
    amber: '#ffb020', lime: '#5dff9a', red: '#ff5a5a'
  };
  const PICKUP = {
    shield: { color: COLOR.cyan,    label: 'S' },
    rapid:  { color: COLOR.amber,   label: 'R' },
    spread: { color: COLOR.magenta, label: 'T' },
    life:   { color: COLOR.lime,    label: '+' }
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const wrap = $('game-wrap');
  const hudEl = $('hud');
  const powerupsEl = $('powerups');
  const scoreEl = $('score');
  const highEl = $('high-score');
  const comboEl = $('combo');
  const waveEl = $('wave');
  const waveProgEl = $('wave-progress');
  const livesEl = $('lives');
  const bannerEl = $('wave-banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const muteBtn = $('mute-btn');
  const screens = {
    start: $('start-screen'),
    pause: $('pause-screen'),
    over: $('gameover-screen')
  };
  const chips = {
    shield: { chip: $('chip-shield'), bar: $('bar-shield') },
    rapid:  { chip: $('chip-rapid'),  bar: $('bar-rapid') },
    spread: { chip: $('chip-spread'), bar: $('bar-spread') }
  };

  // Sharp rendering on high-DPI screens (logical size stays 800 x 600)
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = W * DPR;
  canvas.height = H * DPR;

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pad6 = (n) => String(n).padStart(6, '0');
  const fmtTime = (s) => {
    s = Math.floor(s);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const reflow = (el) => void el.offsetWidth;
  const bump = (el) => {
    el.classList.remove('bump');
    reflow(el);
    el.classList.add('bump');
  };

  // ---------- Persistence ----------
  const BEST_KEY = 'nebula-high-score';
  const MUTE_KEY = 'nebula-muted';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };
  let best = parseInt(store.get(BEST_KEY), 10) || 0;

  // ---------- Audio (synthesised, no files needed) ----------
  const Sound = {
    ctx: null,
    master: null,
    noiseBuf: null,
    muted: store.get(MUTE_KEY) === '1',

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.6);
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    },

    setMuted(m) {
      this.muted = m;
      store.set(MUTE_KEY, m ? '1' : '0');
      if (this.master) this.master.gain.value = m ? 0 : 0.5;
    },

    tone(freq, end, dur, type, vol, delay) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.03);
    },

    noise(dur, vol, cutoff) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(cutoff, t);
      f.frequency.exponentialRampToValueAtTime(100, t + dur);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.master);
      src.start(t);
      src.stop(t + dur + 0.03);
    },

    shoot()     { this.tone(900, 260, 0.08, 'square', 0.05); },
    hit()       { this.tone(300, 180, 0.06, 'square', 0.06); },
    explosion(big) { this.noise(big ? 0.5 : 0.3, big ? 0.35 : 0.22, big ? 1400 : 2200); this.tone(160, 40, big ? 0.35 : 0.2, 'sawtooth', 0.1); },
    block()     { this.tone(1200, 600, 0.12, 'triangle', 0.12); },
    hurt()      { this.noise(0.5, 0.4, 1000); this.tone(220, 50, 0.4, 'sawtooth', 0.15); },
    powerup()   { [520, 660, 880].forEach((f, i) => this.tone(f, f * 1.02, 0.09, 'square', 0.07, i * 0.07)); },
    wave()      { [440, 554, 659, 880].forEach((f, i) => this.tone(f, f, 0.14, 'triangle', 0.1, i * 0.09)); },
    start()     { [330, 440, 660].forEach((f, i) => this.tone(f, f, 0.12, 'square', 0.07, i * 0.08)); },
    gameOver()  { [440, 370, 311, 220].forEach((f, i) => this.tone(f, f * 0.9, 0.3, 'sawtooth', 0.09, i * 0.22)); }
  };

  // ---------- Game state ----------
  let state = 'menu'; // menu | playing | paused | over
  let G = newGame();
  let last = performance.now();

  const keys = { left: false, right: false, fire: false };
  const pointer = { active: false, x: W / 2 };

  const hudCache = { score: '', best: '', wave: -1, prog: -1, mult: 0 };

  function newGame() {
    return {
      score: 0, kills: 0, time: 0,
      wave: 0, total: 0, spawned: 0, resolved: 0,
      waveState: 'intro', waveTimer: 0, spawnTimer: 0,
      lives: START_LIVES, livesShown: START_LIVES,
      chain: 0, comboTimer: 0,
      pu: { shield: 0, rapid: 0, spread: 0 },
      player: { x: W / 2, y: H - 70, invuln: 0, cooldown: 0, dead: false },
      bullets: [], enemies: [], pickups: [], particles: [], texts: [],
      shake: 0, overTimer: 0, overShown: false, newRecord: false
    };
  }

  const multiplier = () => Math.min(8, 1 + Math.floor(G.chain / 3));

  // ---------- Starfield + background ----------
  const stars = Array.from({ length: 90 }, () => ({
    x: Math.random() * W, y: Math.random() * H, z: Math.random()
  }));

  const bgCanvas = document.createElement('canvas');
  bgCanvas.width = W;
  bgCanvas.height = H;
  (function paintBackground() {
    const c = bgCanvas.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1230');
    g.addColorStop(1, '#02030a');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    [
      [160, 140, 260, 'rgba(138,92,255,0.16)'],
      [660, 380, 300, 'rgba(255,46,136,0.10)'],
      [400, 570, 320, 'rgba(25,240,255,0.08)']
    ].forEach(([x, y, r, col]) => {
      const rg = c.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, col);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.fillRect(0, 0, W, H);
    });
  })();

  // ---------- UI helpers ----------
  function showScreen(name) {
    Object.keys(screens).forEach((k) => screens[k].classList.toggle('visible', k === name));
  }

  function showBanner(title, sub) {
    bannerTitle.textContent = title;
    bannerSub.textContent = sub || '';
    bannerEl.classList.remove('show');
    reflow(bannerEl);
    bannerEl.classList.add('show');
  }

  function renderLives(hit) {
    const n = Math.max(START_LIVES, G.livesShown);
    livesEl.textContent = '';
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'life' + (i >= G.lives ? ' lost' : '');
      livesEl.appendChild(d);
    }
    if (hit) {
      livesEl.classList.remove('hit');
      reflow(livesEl);
      livesEl.classList.add('hit');
    }
  }

  function updateHud(force) {
    const s = pad6(G.score);
    if (s !== hudCache.score) {
      hudCache.score = s;
      scoreEl.textContent = s;
      if (!force) bump(scoreEl);
    }
    const b = pad6(Math.max(best, G.score));
    if (b !== hudCache.best) {
      hudCache.best = b;
      highEl.textContent = b;
    }
    if (G.wave !== hudCache.wave) {
      hudCache.wave = G.wave;
      waveEl.textContent = G.wave;
    }
    const prog = G.total ? Math.min(1, G.resolved / G.total) : 0;
    if (prog !== hudCache.prog) {
      hudCache.prog = prog;
      waveProgEl.style.transform = 'scaleX(' + prog + ')';
    }
    const m = G.chain > 0 ? multiplier() : 1;
    if (m !== hudCache.mult) {
      hudCache.mult = m;
      if (m >= 2) {
        comboEl.textContent = '×' + m + ' combo';
        comboEl.classList.remove('hidden');
      } else {
        comboEl.classList.add('hidden');
      }
    }
    Object.keys(chips).forEach((k) => {
      const on = G.pu[k] > 0;
      chips[k].chip.classList.toggle('active', on);
      if (on) chips[k].bar.style.transform = 'scaleX(' + clamp(G.pu[k] / DURATION[k], 0, 1) + ')';
    });
  }

  // ---------- Flow: start / pause / game over ----------
  function startGame() {
    Sound.init();
    G = newGame();
    state = 'playing';
    wrap.classList.remove('is-paused');
    showScreen(null);
    hudEl.classList.remove('hidden');
    powerupsEl.classList.remove('hidden');
    hudCache.score = hudCache.best = '';
    hudCache.wave = hudCache.prog = hudCache.mult = -1;
    clearInput();
    renderLives(false);
    startWave(1);
    updateHud(true);
    Sound.start();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function toMenu() {
    state = 'menu';
    G = newGame();
    wrap.classList.remove('is-paused');
    hudEl.classList.add('hidden');
    powerupsEl.classList.add('hidden');
    $('start-best').textContent = pad6(best);
    showScreen('start');
  }

  function pauseGame() {
    if (state !== 'playing') return;
    state = 'paused';
    wrap.classList.add('is-paused');
    showScreen('pause');
    clearInput();
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    wrap.classList.remove('is-paused');
    showScreen(null);
    last = performance.now();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function gameOver() {
    state = 'over';
    G.player.dead = true;
    G.overTimer = 1.2;
    explode(G.player.x, G.player.y, COLOR.cyan, 60, 340);
    Sound.explosion(true);
    Sound.gameOver();
    G.shake = 18;
    G.newRecord = G.score > best && G.score > 0;
    if (G.score > best) {
      best = G.score;
      store.set(BEST_KEY, String(best));
    }
    clearInput();
  }

  function showGameOver() {
    G.overShown = true;
    $('final-score').textContent = pad6(G.score);
    $('final-best').textContent = pad6(best);
    $('final-wave').textContent = G.wave;
    $('final-kills').textContent = G.kills;
    $('final-time').textContent = fmtTime(G.time);
    $('new-record').classList.toggle('visible', G.newRecord);
    hudEl.classList.add('hidden');
    powerupsEl.classList.add('hidden');
    showScreen('over');
  }

  // ---------- Waves & spawning ----------
  function startWave(n) {
    G.wave = n;
    G.total = 6 + n * 3;
    G.spawned = 0;
    G.resolved = 0;
    G.waveState = 'intro';
    G.waveTimer = 2.4;
    G.spawnTimer = 0.3;
    showBanner('Wave ' + n, n === 1 ? 'Get ready' : 'Incoming');
  }

  function spawnEnemy() {
    const w = G.wave;
    const scale = Math.min(2.2, 1 + (w - 1) * 0.09);
    const tankChance = w >= 3 ? Math.min(0.25, 0.08 + w * 0.02) : 0;
    const zigChance = w >= 2 ? Math.min(0.4, 0.15 + w * 0.03) : 0;
    const roll = Math.random();
    let e;

    if (roll < tankChance) {
      e = { type: 'tank', r: 18, hp: 3, speed: 48 * scale, score: 300, color: COLOR.red };
    } else if (roll < tankChance + zigChance) {
      e = { type: 'zig', r: 12, hp: 1, speed: 95 * scale, score: 150, color: COLOR.violet };
    } else {
      e = { type: 'drone', r: 13, hp: 1, speed: 75 * scale, score: 100, color: COLOR.magenta };
    }

    const margin = e.type === 'zig' ? 110 : e.type === 'drone' ? 60 : 40;
    e.baseX = rand(margin, W - margin);
    e.x = e.baseX;
    e.y = -30;
    e.maxHp = e.hp;
    e.t = 0;
    e.phase = rand(0, Math.PI * 2);
    e.flash = 0;
    G.enemies.push(e);
    G.spawned++;
  }

  // ---------- Effects ----------
  function explode(x, y, color, n, speed) {
    if (G.particles.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(0.15, 1) * (speed || 220);
      G.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: rand(0.35, 0.9), size: rand(1.5, 3.5), color
      });
    }
  }

  function floatText(x, y, text, color) {
    G.texts.push({ x, y, text, color, life: 0, max: 0.9 });
  }

  // ---------- Player actions ----------
  function fire() {
    const p = G.player;
    const spd = 680;
    p.cooldown = G.pu.rapid > 0 ? 0.1 : 0.22;
    const c = G.pu.rapid > 0 ? COLOR.amber : COLOR.cyan;
    G.bullets.push({ x: p.x, y: p.y - 22, vx: 0, vy: -spd, color: c });
    if (G.pu.spread > 0) {
      G.bullets.push({ x: p.x - 10, y: p.y - 14, vx: -170, vy: -spd * 0.96, color: COLOR.magenta });
      G.bullets.push({ x: p.x + 10, y: p.y - 14, vx: 170, vy: -spd * 0.96, color: COLOR.magenta });
    }
    Sound.shoot();
  }

  // Returns true if the player actually lost a life.
  function hurt(force) {
    const p = G.player;
    if (!force && p.invuln > 0) return false;
    if (G.pu.shield > 0) {
      p.invuln = Math.max(p.invuln, 0.3);
      explode(p.x, p.y - 10, COLOR.cyan, 14, 180);
      Sound.block();
      G.shake = Math.max(G.shake, 4);
      return false;
    }
    G.lives--;
    G.chain = 0;
    G.comboTimer = 0;
    p.invuln = 1.8;
    G.shake = 14;
    explode(p.x, p.y, COLOR.cyan, 26, 260);
    Sound.hurt();
    renderLives(true);
    if (G.lives <= 0) gameOver();
    return true;
  }

  function killEnemy(e, award) {
    const i = G.enemies.indexOf(e);
    if (i < 0) return;
    G.enemies.splice(i, 1);
    G.resolved++;
    explode(e.x, e.y, e.color, e.type === 'tank' ? 36 : 22, 230);
    Sound.explosion(e.type === 'tank');
    G.shake = Math.max(G.shake, e.type === 'tank' ? 6 : 3);
    if (award) {
      G.kills++;
      G.chain++;
      G.comboTimer = 2.2;
      const pts = e.score * multiplier();
      G.score += pts;
      floatText(e.x, e.y, '+' + pts, e.color);
      maybeDrop(e);
    }
  }

  function maybeDrop(e) {
    const chance = e.type === 'tank' ? 0.3 : 0.09;
    if (Math.random() > chance) return;
    const pool = ['shield', 'rapid', 'spread'];
    if (G.lives < MAX_LIVES && Math.random() < 0.25) pool.push('life');
    const kind = pool[Math.floor(Math.random() * pool.length)];
    G.pickups.push({ x: e.x, y: e.y, kind, t: 0 });
  }

  function collectPickup(p) {
    if (p.kind === 'life') {
      if (G.lives < MAX_LIVES) {
        G.lives++;
        G.livesShown = Math.max(G.livesShown, G.lives);
        renderLives(false);
      } else {
        G.score += 250;
      }
    } else {
      G.pu[p.kind] = DURATION[p.kind];
    }
    floatText(p.x, p.y - 10, p.kind === 'life' ? '+HULL' : PICKUP[p.kind].label === 'T' ? 'TRI-SHOT' : p.kind.toUpperCase(), PICKUP[p.kind].color);
    explode(p.x, p.y, PICKUP[p.kind].color, 16, 160);
    Sound.powerup();
  }

  // ---------- Update ----------
  function update(dt) {
    // Stars scroll on menu, in play, and on game over
    if (state !== 'paused') {
      for (const s of stars) {
        s.y += (20 + s.z * 120) * dt * (state === 'playing' ? 1 : 0.5);
        if (s.y > H) { s.y = -2; s.x = Math.random() * W; }
      }
    }

    if (state === 'playing') updatePlaying(dt);
    else if (state === 'over') updateOver(dt);
  }

  function updateOver(dt) {
    updateParticles(dt);
    G.shake = Math.max(0, G.shake - 40 * dt);
    if (!G.overShown) {
      G.overTimer -= dt;
      if (G.overTimer <= 0) showGameOver();
    }
  }

  function updateParticles(dt) {
    for (let i = G.particles.length - 1; i >= 0; i--) {
      const p = G.particles[i];
      p.life += dt;
      if (p.life >= p.max) { G.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const drag = 1 - 1.8 * dt;
      p.vx *= drag;
      p.vy *= drag;
    }
    for (let i = G.texts.length - 1; i >= 0; i--) {
      const t = G.texts[i];
      t.life += dt;
      t.y -= 32 * dt;
      if (t.life >= t.max) G.texts.splice(i, 1);
    }
  }

  function updatePlaying(dt) {
    const p = G.player;
    G.time += dt;

    // Movement: keyboard wins, otherwise follow the finger / mouse drag
    const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (dir) {
      p.x += dir * 400 * dt;
    } else if (pointer.active) {
      const d = pointer.x - p.x;
      const step = 900 * dt;
      p.x += Math.abs(d) <= step ? d : Math.sign(d) * step;
    }
    p.x = clamp(p.x, 24, W - 24);

    // Shooting
    p.cooldown -= dt;
    if ((keys.fire || pointer.active) && p.cooldown <= 0) fire();

    // Timers
    if (p.invuln > 0) p.invuln -= dt;
    Object.keys(G.pu).forEach((k) => { if (G.pu[k] > 0) G.pu[k] = Math.max(0, G.pu[k] - dt); });
    if (G.comboTimer > 0) {
      G.comboTimer -= dt;
      if (G.comboTimer <= 0) G.chain = 0;
    }

    // Wave state machine
    if (G.waveState === 'intro') {
      G.waveTimer -= dt;
      if (G.waveTimer <= 0) G.waveState = 'active';
    } else if (G.waveState === 'active') {
      G.spawnTimer -= dt;
      if (G.spawned < G.total && G.spawnTimer <= 0) {
        spawnEnemy();
        const interval = Math.max(0.38, 1.05 - G.wave * 0.055);
        G.spawnTimer = interval * rand(0.7, 1.3);
      }
      if (G.spawned >= G.total && G.enemies.length === 0) {
        const bonus = 250 * G.wave;
        G.score += bonus;
        G.waveState = 'cleared';
        G.waveTimer = 2.6;
        showBanner('Wave cleared', '+' + bonus + ' bonus');
        Sound.wave();
      }
    } else if (G.waveState === 'cleared') {
      G.waveTimer -= dt;
      if (G.waveTimer <= 0) startWave(G.wave + 1);
    }

    // Bullets
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y < -20 || b.x < -20 || b.x > W + 20) G.bullets.splice(i, 1);
    }

    // Enemies
    for (let i = G.enemies.length - 1; i >= 0; i--) {
      const e = G.enemies[i];
      e.t += dt;
      e.y += e.speed * dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.type === 'drone') e.x = clamp(e.baseX + Math.sin(e.t * 1.5 + e.phase) * 30, e.r, W - e.r);
      else if (e.type === 'zig') e.x = clamp(e.baseX + Math.sin(e.t * 3 + e.phase) * 90, e.r, W - e.r);

      // Reached the bottom
      if (e.y - e.r > H) {
        G.enemies.splice(i, 1);
        G.resolved++;
        explode(e.x, H - 4, COLOR.red, 12, 150);
        hurt(true);
        if (state !== 'playing') return;
        continue;
      }

      // Rammed the ship
      if (!p.dead) {
        const dx = e.x - p.x, dy = e.y - p.y, rr = e.r + 14;
        if (dx * dx + dy * dy < rr * rr) {
          const ghost = p.invuln > 0 && G.pu.shield <= 0;
          if (!ghost) {
            const shielded = G.pu.shield > 0;
            hurt(false);
            killEnemy(e, shielded);
            if (state !== 'playing') return;
            continue;
          }
        }
      }
    }

    // Bullets vs enemies
    for (let i = G.bullets.length - 1; i >= 0; i--) {
      const b = G.bullets[i];
      for (let j = G.enemies.length - 1; j >= 0; j--) {
        const e = G.enemies[j];
        if (Math.abs(b.x - e.x) < e.r + 3 && Math.abs(b.y - e.y) < e.r + 8) {
          G.bullets.splice(i, 1);
          e.hp--;
          e.flash = 0.08;
          explode(b.x, b.y, b.color, 4, 120);
          if (e.hp <= 0) killEnemy(e, true);
          else Sound.hit();
          break;
        }
      }
    }

    // Pickups
    for (let i = G.pickups.length - 1; i >= 0; i--) {
      const k = G.pickups[i];
      k.t += dt;
      k.y += 100 * dt;
      const dx = k.x - p.x, dy = k.y - p.y;
      if (dx * dx + dy * dy < 28 * 28) {
        G.pickups.splice(i, 1);
        collectPickup(k);
      } else if (k.y > H + 20) {
        G.pickups.splice(i, 1);
      }
    }

    updateParticles(dt);
    G.shake = Math.max(0, G.shake - 40 * dt);
    updateHud(false);
  }

  // ---------- Drawing ----------
  function poly(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
  }

  function drawStars() {
    ctx.fillStyle = '#cfe9ff';
    for (const s of stars) {
      const size = 0.6 + s.z * 1.6;
      ctx.globalAlpha = 0.3 + s.z * 0.7;
      ctx.fillRect(s.x, s.y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPlayer() {
    const p = G.player;
    if (p.dead) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && G.pu.shield <= 0) ctx.globalAlpha = Math.floor(p.invuln * 14) % 2 ? 0.35 : 1;

    // Engine flame
    const fl = 8 + Math.random() * 9;
    ctx.fillStyle = COLOR.amber;
    ctx.shadowColor = COLOR.amber;
    ctx.shadowBlur = 12;
    poly([[-5, 10], [5, 10], [0, 10 + fl]]);
    ctx.fill();

    // Hull
    ctx.shadowColor = COLOR.cyan;
    ctx.shadowBlur = 16;
    ctx.fillStyle = COLOR.cyan;
    poly([[0, -22], [17, 16], [0, 8], [-17, 16]]);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#02030a';
    poly([[0, -8], [4, 4], [-4, 4]]);
    ctx.fill();

    // Shield bubble
    if (G.pu.shield > 0) {
      const low = G.pu.shield < 2 && Math.floor(G.pu.shield * 8) % 2;
      ctx.globalAlpha = low ? 0.25 : 0.55 + Math.sin(performance.now() / 120) * 0.15;
      ctx.strokeStyle = COLOR.cyan;
      ctx.fillStyle = 'rgba(25,240,255,0.12)';
      ctx.shadowColor = COLOR.cyan;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    const col = e.flash > 0 ? '#ffffff' : e.color;
    const r = e.r;
    ctx.shadowColor = e.color;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';

    let shape;
    if (e.type === 'drone') {
      shape = [[0, r], [r, -r * 0.2], [r * 0.6, -r], [-r * 0.6, -r], [-r, -r * 0.2]];
    } else if (e.type === 'zig') {
      shape = [[0, r * 0.9], [r, -r], [0, -r * 0.35], [-r, -r]];
    } else {
      shape = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        shape.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
    }

    poly(shape);
    ctx.globalAlpha = 0.25;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, e.type === 'zig' ? -r * 0.2 : 0, e.type === 'tank' ? 5 : 3, 0, Math.PI * 2);
    ctx.fill();

    // Tank health pips
    if (e.type === 'tank') {
      ctx.shadowBlur = 0;
      for (let i = 0; i < e.maxHp; i++) {
        ctx.fillStyle = i < e.hp ? COLOR.lime : 'rgba(255,255,255,0.2)';
        ctx.fillRect(-12 + i * 9, -r - 9, 7, 3);
      }
    }
    ctx.restore();
  }

  function drawPickup(k) {
    const c = PICKUP[k.kind].color;
    const r = 13 + Math.sin(k.t * 6) * 1.2;
    ctx.save();
    ctx.translate(k.x, k.y);
    ctx.shadowColor = c;
    ctx.shadowBlur = 14;
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.lineWidth = 2;
    poly([[-r * 0.5, -r], [r * 0.5, -r], [r, 0], [r * 0.5, r], [-r * 0.5, r], [-r, 0]]);
    ctx.globalAlpha = 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.font = 'bold 14px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(PICKUP[k.kind].label, 0, 1);
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (G.shake > 0) ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);

    ctx.drawImage(bgCanvas, 0, 0);
    drawStars();

    if (state !== 'menu') {
      G.pickups.forEach(drawPickup);
      G.enemies.forEach(drawEnemy);

      // Bullets (short glowing streaks)
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 8;
      for (const b of G.bullets) {
        ctx.strokeStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;

      drawPlayer();

      // Particles (additive blend for glow)
      ctx.globalCompositeOperation = 'lighter';
      for (const p of G.particles) {
        ctx.globalAlpha = 1 - p.life / p.max;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Floating score text
      ctx.font = 'bold 15px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of G.texts) {
        ctx.globalAlpha = 1 - t.life / t.max;
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  // ---------- Main loop ----------
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  // ---------- Input ----------
  function clearInput() {
    keys.left = keys.right = keys.fire = false;
    pointer.active = false;
  }

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'fire'
  };

  function toggleMute() {
    Sound.init();
    Sound.setMuted(!Sound.muted);
    syncMuteButton();
  }

  function syncMuteButton() {
    muteBtn.textContent = Sound.muted ? 'Sound off' : 'Sound on';
    muteBtn.setAttribute('aria-pressed', String(Sound.muted));
  }

  document.addEventListener('keydown', (e) => {
    Sound.init();
    const k = KEYMAP[e.code];
    if (k) {
      if (state === 'playing') e.preventDefault();
      keys[k] = true;
      if (e.code === 'Space' && state === 'menu' && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) {
        e.preventDefault();
        startGame();
      }
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'playing') pauseGame();
      else if (state === 'paused') resumeGame();
    } else if (e.code === 'KeyM') {
      toggleMute();
    } else if (e.code === 'Enter' && state === 'menu' && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) {
      startGame();
    }
  });

  document.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) keys[k] = false;
  });

  // Touch / mouse drag on the canvas
  function pointerToX(e) {
    const rect = canvas.getBoundingClientRect();
    return ((e.clientX - rect.left) / rect.width) * W;
  }

  canvas.addEventListener('pointerdown', (e) => {
    Sound.init();
    if (state !== 'playing') return;
    pointer.active = true;
    pointer.x = pointerToX(e);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointer.active) pointer.x = pointerToX(e);
  });
  const endPointer = () => { pointer.active = false; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Auto-pause when the tab or app loses focus
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('blur', () => { clearInput(); });

  // Buttons
  function onClick(id, fn) {
    $(id).addEventListener('click', (e) => {
      fn();
      e.currentTarget.blur();
    });
  }
  onClick('start-btn', startGame);
  onClick('restart-btn', startGame);
  onClick('pause-restart-btn', startGame);
  onClick('resume-btn', resumeGame);
  onClick('menu-btn', toMenu);
  onClick('mute-btn', toggleMute);

  // ---------- Boot ----------
  syncMuteButton();
  highEl.textContent = pad6(best);
  $('start-best').textContent = pad6(best);
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
})();
