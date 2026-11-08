(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('canvasWrap');
  const overlay = document.getElementById('screenOverlay');
  const overlayContent = document.getElementById('overlayContent');
  const startButton = document.getElementById('startButton');
  const fireButton = document.getElementById('fireButton');
  const pauseButton = document.getElementById('pauseButton');
  const soundToggle = document.getElementById('soundToggle');
  const W = 960;
  const H = 490;
  const FLOOR = 423;
  const GRAVITY = 1550;
  const ROUND_LENGTH = 60;
  const keys = new Set();
  const held = new Set();
  const particles = [];
  const shots = [];
  const sparks = [];
  let phase = 'ready';
  let round = 1;
  let playerWins = 0;
  let rivalWins = 0;
  let timeLeft = ROUND_LENGTH;
  let lastTime = 0;
  let elapsed = 0;
  let playerFireAt = 0;
  let botFireAt = 0;
  let botJumpAt = 2;
  let botStrafeAt = 0;
  let botDirection = 1;
  let aim = -0.08;
  let soundOn = true;
  let audioContext = null;
  let roundTimeout = 0;
  let aimRepeat = 0;
  let screenShake = 0;

  const player = makeFighter('player');
  const rival = makeFighter('rival');

  function makeFighter(side) {
    return {
      side,
      x: side === 'player' ? 122 : 838,
      y: FLOOR,
      vx: 0,
      vy: 0,
      health: 100,
      grounded: true,
      face: side === 'player' ? 1 : -1,
      hitFlash: 0,
      bob: 0,
      trail: []
    };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    draw();
  }
  window.addEventListener('resize', resize, { passive: true });

  function resetFighters() {
    Object.assign(player, { x: 122, y: FLOOR, vx: 0, vy: 0, health: 100, grounded: true, hitFlash: 0, bob: 0, trail: [] });
    Object.assign(rival, { x: 838, y: FLOOR, vx: 0, vy: 0, health: 100, grounded: true, hitFlash: 0, bob: 0, trail: [] });
    aim = -0.08;
    shots.length = 0;
    particles.length = 0;
    sparks.length = 0;
    timeLeft = ROUND_LENGTH;
  }

  function setOverlay(type, winner) {
    overlay.classList.remove('hidden');
    if (type === 'ready') {
      overlayContent.innerHTML = '<div class="overlay-kicker"><span>01</span> READY PLAYER ONE</div><h2>STEP INTO<br><em>THE ARENA</em></h2><p>First to two round wins takes the match.<br>Jump, dodge, and send it back.</p><button class="primary-button" id="startButton"><span>START MATCH</span><b>↗</b></button><div class="overlay-foot"><span class="keycap">A</span><span class="keycap">D</span> MOVE <span class="foot-dot">·</span> <span class="keycap">W</span> JUMP <span class="foot-dot">·</span> <span class="keycap">↑</span><span class="keycap">↓</span> AIM <span class="foot-dot">·</span> <span class="keycap">SPACE</span> FIRE</div>';
      document.getElementById('startButton').addEventListener('click', startMatch);
    } else if (type === 'paused') {
      overlayContent.innerHTML = '<div class="overlay-kicker"><span>Ⅱ</span> MATCH PAUSED</div><h2>TAKE A<br><em>BREATHER.</em></h2><p>Your rival is waiting. The arena clock is stopped.</p><button class="primary-button" id="resumeButton"><span>RESUME MATCH</span><b>↗</b></button>';
      document.getElementById('resumeButton').addEventListener('click', resumeMatch);
    } else if (type === 'round') {
      const won = winner === 'player';
      overlayContent.innerHTML = `<div class="overlay-kicker"><span>ROUND ${String(round).padStart(2, '0')}</span> ${won ? 'ROUND WON' : 'ROUND LOST'}</div><h2>${won ? 'NICE<br><em>SHOT.</em>' : 'GET BACK<br><em>IN THERE.</em>'}</h2><p>${won ? 'You took the round. Keep the pressure on.' : 'The bot got this one. Reset and strike back.'}<br>Next round starts in a moment…</p><div class="overlay-foot">${playerWins} YOU <span class="foot-dot">·</span> ${rivalWins} PIXEL</div>`;
    } else {
      const won = winner === 'player';
      overlayContent.innerHTML = `<div class="overlay-kicker"><span>MATCH COMPLETE</span> ${won ? 'VICTORY' : 'DEFEAT'}</div><h2>${won ? 'ARENA<br><em>CHAMPION.</em>' : 'RUN IT<br><em>BACK?</em>'}</h2><p>${won ? 'Pixel has been sent back to the lobby.' : 'Every champion starts with a rematch.'}<br>Final score: ${playerWins} — ${rivalWins}</p><button class="primary-button" id="rematchButton"><span>PLAY AGAIN</span><b>↗</b></button><div class="overlay-foot">SECTOR 07 — MIDTOWN</div>`;
      document.getElementById('rematchButton').addEventListener('click', startMatch);
    }
  }

  function startMatch() {
    clearTimeout(roundTimeout);
    playerWins = 0;
    rivalWins = 0;
    round = 1;
    elapsed = 0;
    resetFighters();
    updateScoreboard();
    phase = 'playing';
    overlay.classList.add('hidden');
    pauseButton.innerHTML = '<span>Ⅱ</span> PAUSE';
    lastTime = performance.now();
    playTone(440, 0.06, 'triangle', 0.035);
  }

  function resumeMatch() {
    phase = 'playing';
    overlay.classList.add('hidden');
    pauseButton.innerHTML = '<span>Ⅱ</span> PAUSE';
    lastTime = performance.now();
  }

  function togglePause() {
    if (phase === 'playing') {
      phase = 'paused';
      held.clear();
      keys.clear();
      fireButton.classList.remove('firing');
      pauseButton.innerHTML = '<span>▶</span> RESUME';
      setOverlay('paused');
    } else if (phase === 'paused') resumeMatch();
  }
  pauseButton.addEventListener('click', togglePause);
  startButton.addEventListener('click', startMatch);

  function updateScoreboard() {
    document.getElementById('yourScore').textContent = playerWins;
    document.getElementById('rivalScore').textContent = rivalWins;
    document.getElementById('roundNumber').textContent = String(round).padStart(2, '0');
    const allPips = [
      ['youPip1', playerWins >= 1], ['rivalPip1', rivalWins >= 1],
      ['youPip2', playerWins >= 2], ['rivalPip2', rivalWins >= 2],
      ['youPip3', playerWins >= 3], ['rivalPip3', rivalWins >= 3]
    ];
    for (const [id, won] of allPips) {
      const pip = document.getElementById(id);
      pip.classList.toggle('won-you', won && id.startsWith('you'));
      pip.classList.toggle('won-rival', won && id.startsWith('rival'));
    }
  }

  function updateHealth() {
    document.getElementById('playerHealth').style.width = `${player.health}%`;
    document.getElementById('rivalHealth').style.width = `${rival.health}%`;
    document.getElementById('playerHealthText').textContent = Math.ceil(player.health);
    document.getElementById('rivalHealthText').textContent = Math.ceil(rival.health);
    document.getElementById('timer').textContent = timeLeft.toFixed(1);
  }

  function finishRound(winner) {
    if (phase !== 'playing') return;
    phase = 'roundover';
    held.clear();
    fireButton.classList.remove('firing');
    if (winner === 'player') playerWins++;
    else if (winner === 'rival') rivalWins++;
    updateScoreboard();
    const matchWinner = playerWins >= 2 ? 'player' : rivalWins >= 2 ? 'rival' : null;
    if (matchWinner) {
      setOverlay('match', matchWinner);
      return;
    }
    setOverlay('round', winner);
    roundTimeout = window.setTimeout(() => {
      round++;
      resetFighters();
      updateScoreboard();
      phase = 'playing';
      overlay.classList.add('hidden');
      lastTime = performance.now();
    }, 2400);
  }

  function jump(f) {
    if (phase !== 'playing' || !f.grounded) return;
    f.vy = -610;
    f.grounded = false;
    burst(f.x, f.y - 4, f.side === 'player' ? '#36d9ff' : '#ff4d9b', 8, 115);
    playTone(230, 0.08, 'triangle', 0.025);
  }

  function fire(f, angle) {
    if (phase !== 'playing') return;
    const direction = f.side === 'player' ? 1 : -1;
    const color = f.side === 'player' ? '#66edff' : '#ff72ae';
    const muzzleX = f.x + direction * 31;
    const muzzleY = f.y - 43 + Math.sin(elapsed * 8 + (f.side === 'player' ? 0 : 1)) * 1.5;
    const velocity = 660;
    const a = f.side === 'player' ? angle : Math.PI - angle;
    shots.push({ x: muzzleX, y: muzzleY, vx: Math.cos(a) * velocity, vy: Math.sin(a) * velocity, owner: f.side, color, life: 1.5, trail: [] });
    burst(muzzleX, muzzleY, color, 3, 70);
    playTone(f.side === 'player' ? 590 : 430, 0.055, 'square', f.side === 'player' ? 0.018 : 0.012);
  }

  function hit(target, shot) {
    target.health = Math.max(0, target.health - 12);
    target.hitFlash = 0.16;
    target.vx += shot.vx > 0 ? 56 : -56;
    screenShake = 4;
    burst(shot.x, shot.y, shot.color, 13, 165);
    playTone(125, 0.09, 'sawtooth', 0.035);
    if (target.health <= 0) finishRound(shot.owner);
  }

  function burst(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.25 + Math.random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.42, max: 0.67, size: 1 + Math.random() * 2.4, color });
    }
  }

  function playTone(freq, duration, type = 'sine', volume = 0.02) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(45, freq * 0.55), audioContext.currentTime + duration);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) { /* Audio is optional; gameplay must not depend on it. */ }
  }

  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    document.getElementById('soundIcon').textContent = soundOn ? '♫' : '♪̸';
    soundToggle.setAttribute('aria-label', soundOn ? 'Mute sound' : 'Enable sound');
    if (soundOn) playTone(520, 0.07, 'sine', 0.02);
  });

  document.querySelectorAll('[data-action]').forEach(button => {
    const action = button.dataset.action;
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('pressed');
      if (action === 'jump') jump(player);
      else held.add(action);
    });
    const release = event => {
      event.preventDefault();
      button.classList.remove('pressed');
      held.delete(action);
    };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', event => event.preventDefault());
  });

  const stopFire = event => {
    if (event) event.preventDefault();
    held.delete('fire');
    fireButton.classList.remove('firing');
  };
  fireButton.addEventListener('pointerdown', event => {
    event.preventDefault();
    fireButton.setPointerCapture?.(event.pointerId);
    held.add('fire');
    fireButton.classList.add('firing');
  });
  fireButton.addEventListener('pointerup', stopFire);
  fireButton.addEventListener('pointercancel', stopFire);
  fireButton.addEventListener('lostpointercapture', stopFire);
  fireButton.addEventListener('contextmenu', event => event.preventDefault());

  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
    keys.add(key);
    if ((key === 'w' || key === 'arrowup') && !event.repeat) jump(player);
    if (key === 'escape' || key === 'p') togglePause();
  });
  window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => {
    keys.clear(); held.clear(); fireButton.classList.remove('firing');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'playing') togglePause();
  });

  function isDown(action) {
    if (action === 'left') return held.has('left') || keys.has('a') || keys.has('arrowleft');
    if (action === 'right') return held.has('right') || keys.has('d') || keys.has('arrowright');
    if (action === 'aimUp') return held.has('aimUp') || keys.has('arrowup');
    if (action === 'aimDown') return held.has('aimDown') || keys.has('arrowdown');
    if (action === 'fire') return held.has('fire') || keys.has(' ');
    return false;
  }

  function updateFighter(f, dt, direction) {
    const wasGrounded = f.grounded;
    f.vy += GRAVITY * dt;
    f.y += f.vy * dt;
    if (f.y >= FLOOR) {
      f.y = FLOOR;
      f.vy = 0;
      f.grounded = true;
      if (!wasGrounded) burst(f.x, FLOOR - 2, f.side === 'player' ? '#36d9ff' : '#ff4d9b', 5, 65);
    } else f.grounded = false;
    f.x += f.vx * dt;
    f.vx *= Math.pow(0.001, dt);
    f.x = Math.max(75, Math.min(W - 75, f.x));
    f.bob += dt * (f.grounded ? 7 : 3);
    f.hitFlash = Math.max(0, f.hitFlash - dt);
    if (direction) f.trail.push({ x: f.x, y: f.y - 32, life: 0.2 });
    f.trail.forEach(t => t.life -= dt);
    f.trail = f.trail.filter(t => t.life > 0);
  }

  function update(dt) {
    elapsed += dt;
    timeLeft = Math.max(0, timeLeft - dt);
    if (isDown('left')) player.vx -= 1100 * dt;
    if (isDown('right')) player.vx += 1100 * dt;
    player.vx = Math.max(-255, Math.min(255, player.vx));
    if (isDown('aimUp')) aim = Math.max(-0.75, aim - 1.25 * dt);
    if (isDown('aimDown')) aim = Math.min(0.68, aim + 1.25 * dt);

    if (elapsed >= botStrafeAt) {
      botDirection = Math.random() < 0.5 ? -1 : 1;
      botStrafeAt = elapsed + 1.1 + Math.random() * 1.8;
    }
    const botHome = 838;
    const botTarget = Math.max(710, Math.min(884, botHome + botDirection * 72));
    rival.vx += Math.sign(botTarget - rival.x) * 620 * dt;
    rival.vx = Math.max(-190, Math.min(190, rival.vx));
    if (elapsed >= botJumpAt && rival.grounded) {
      if (Math.random() < 0.76) jump(rival);
      botJumpAt = elapsed + 1.7 + Math.random() * 2.3;
    }

    updateFighter(player, dt, Math.abs(player.vx) > 40);
    updateFighter(rival, dt, Math.abs(rival.vx) > 40);

    if (isDown('fire') && elapsed >= playerFireAt) {
      fire(player, aim);
      playerFireAt = elapsed + 0.29;
    }
    if (elapsed >= botFireAt) {
      const dy = (player.y - rival.y) - rival.vy * 0.12;
      const distance = Math.max(1, rival.x - player.x);
      const botAim = Math.atan2(dy, distance) + (Math.random() - 0.5) * 0.14;
      fire(rival, botAim);
      botFireAt = elapsed + (0.57 + Math.random() * 0.34);
    }

    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      s.trail.push({ x: s.x, y: s.y, life: 0.16 });
      s.trail.forEach(t => t.life -= dt);
      s.trail = s.trail.filter(t => t.life > 0);
      const target = s.owner === 'player' ? rival : player;
      const bodyY = target.y - 42;
      if (Math.abs(s.x - target.x) < 25 && Math.abs(s.y - bodyY) < 33) {
        hit(target, s);
        shots.splice(i, 1);
        continue;
      }
      if (s.life <= 0 || s.x < -15 || s.x > W + 15 || s.y < 15 || s.y > FLOOR + 30) shots.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.05, dt); p.vy *= Math.pow(0.05, dt);
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    screenShake = Math.max(0, screenShake - 28 * dt);
    updateHealth();
    if (phase === 'playing' && timeLeft <= 0) {
      finishRound(player.health === rival.health ? 'draw' : player.health > rival.health ? 'player' : 'rival');
    }
  }

  function drawBackground() {
    const gradient = ctx.createLinearGradient(0, 0, 0, H);
    gradient.addColorStop(0, '#111827');
    gradient.addColorStop(0.62, '#172238');
    gradient.addColorStop(1, '#1b2635');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 38; i++) {
      const x = ((i * 127 + 21) % W);
      const y = 35 + ((i * 71) % 235);
      ctx.fillStyle = i % 4 === 0 ? '#b7f36b' : '#93a5c4';
      ctx.globalAlpha = 0.12 + ((i * 17) % 30) / 100;
      ctx.fillRect(x, y, i % 5 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }
    ctx.globalAlpha = 1;
    const buildings = [
      [0, 210, 115, 214], [93, 164, 96, 260], [176, 202, 130, 222], [287, 146, 111, 278],
      [397, 190, 110, 234], [510, 157, 127, 267], [633, 209, 98, 215], [723, 170, 114, 254], [830, 194, 130, 230]
    ];
    buildings.forEach(([x, y, w, h], index) => {
      ctx.fillStyle = index % 2 ? '#202c40' : '#1c2739';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#28364a';
      ctx.fillRect(x + 7, y + 8, 2, h - 12);
      for (let wx = x + 15; wx < x + w - 9; wx += 18) {
        for (let wy = y + 15; wy < FLOOR - 15; wy += 22) {
          const lit = ((Math.floor(wx / 18) * 7 + Math.floor(wy / 22) * 3 + index) % 6) < 2;
          ctx.fillStyle = lit ? (index % 2 ? '#45544e' : '#344c5a') : '#263246';
          ctx.fillRect(wx, wy, 6, 9);
        }
      }
    });
    ctx.restore();

    // Neon signage and skyline guide lines.
    ctx.save();
    ctx.globalAlpha = 0.62;
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ff4d9b';
    ctx.strokeStyle = '#ad3e72';
    ctx.lineWidth = 2;
    ctx.strokeRect(72, 254, 94, 29);
    ctx.fillStyle = '#f168a4';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('NIGHT / CITY', 81, 273);
    ctx.shadowColor = '#36d9ff';
    ctx.strokeStyle = '#30829a';
    ctx.strokeRect(780, 235, 113, 34);
    ctx.fillStyle = '#68dff5';
    ctx.fillText('SECTOR 07', 793, 257);
    ctx.restore();

    ctx.fillStyle = '#17202c';
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    const floorGrad = ctx.createLinearGradient(0, FLOOR, 0, H);
    floorGrad.addColorStop(0, '#253344'); floorGrad.addColorStop(1, '#131b27');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.strokeStyle = '#5c7e7d';
    ctx.globalAlpha = 0.46;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, FLOOR); ctx.lineTo(W, FLOOR); ctx.stroke();
    ctx.globalAlpha = 0.15;
    for (let i = -5; i <= 5; i++) {
      ctx.beginPath(); ctx.moveTo(W / 2 + i * 58, FLOOR); ctx.lineTo(W / 2 + i * 105, H); ctx.stroke();
    }
    for (let y = FLOOR + 19; y < H; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Central arena marker.
    ctx.fillStyle = '#9db7b7';
    ctx.globalAlpha = 0.55;
    ctx.fillRect(W / 2 - 1, FLOOR - 7, 2, 7);
    ctx.fillRect(W / 2 - 17, FLOOR - 1, 34, 1);
    ctx.globalAlpha = 1;
  }

  function drawFighter(f) {
    const isPlayer = f.side === 'player';
    const main = isPlayer ? '#36d9ff' : '#ff4d9b';
    const dark = isPlayer ? '#126078' : '#73274f';
    const pale = isPlayer ? '#b8f5ff' : '#ffc3dc';
    const dir = isPlayer ? 1 : -1;
    const moving = Math.abs(f.vx) > 25 && f.grounded;
    const run = moving ? Math.sin(f.bob * 2) * 5 : 0;
    const lift = f.grounded ? Math.sin(f.bob) * 1.3 : 0;
    ctx.save();
    // Foot shadow.
    ctx.globalAlpha = Math.max(0.12, 0.32 - (FLOOR - f.y) / 900);
    ctx.fillStyle = '#050810';
    ctx.beginPath(); ctx.ellipse(f.x, FLOOR + 2, f.grounded ? 25 : 18, f.grounded ? 5 : 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    f.trail.forEach(t => {
      ctx.globalAlpha = Math.max(0, t.life / 0.2) * 0.18;
      ctx.fillStyle = main;
      ctx.fillRect(t.x - 12, t.y - 16, 24, 31);
    });
    ctx.globalAlpha = 1;
    ctx.translate(f.x, f.y + lift);
    ctx.scale(dir, 1);
    ctx.shadowColor = main;
    ctx.shadowBlur = 13;
    if (f.hitFlash > 0) ctx.globalAlpha = 0.55 + Math.sin(f.hitFlash * 90) * 0.45;

    // Legs and boots.
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(-12, -20); ctx.lineTo(-2, -20); ctx.lineTo(-4 + run, -4); ctx.lineTo(-15 + run, -4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(3, -20); ctx.lineTo(13, -20); ctx.lineTo(18 - run, -4); ctx.lineTo(7 - run, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = main;
    ctx.fillRect(-18 + run, -5, 15, 5);
    ctx.fillRect(5 - run, -5, 15, 5);

    // Body armor.
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(-16, -39); ctx.lineTo(12, -40); ctx.lineTo(19, -20); ctx.lineTo(10, -14); ctx.lineTo(-13, -17); ctx.lineTo(-20, -27); ctx.closePath(); ctx.fill();
    ctx.fillStyle = main;
    ctx.globalAlpha *= 0.8;
    ctx.beginPath(); ctx.moveTo(-13, -36); ctx.lineTo(9, -36); ctx.lineTo(14, -24); ctx.lineTo(7, -20); ctx.lineTo(-11, -22); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = pale;
    ctx.fillRect(-3, -33, 11, 3);
    ctx.fillStyle = '#101827';
    ctx.fillRect(-9, -30, 7, 5);

    // Head, visor, and ear armor.
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(-12, -61); ctx.lineTo(5, -63); ctx.lineTo(16, -54); ctx.lineTo(14, -39); ctx.lineTo(-6, -37); ctx.lineTo(-16, -45); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pale;
    ctx.beginPath(); ctx.moveTo(-4, -57); ctx.lineTo(9, -57); ctx.lineTo(13, -50); ctx.lineTo(3, -47); ctx.lineTo(-7, -49); ctx.closePath(); ctx.fill();
    ctx.fillStyle = main;
    ctx.fillRect(4, -53, 8, 3);
    ctx.fillStyle = dark;
    ctx.fillRect(-18, -52, 4, 10);
    // Back-mounted pack.
    ctx.fillStyle = '#29364a';
    ctx.fillRect(-21, -37, 7, 16);
    ctx.fillStyle = main;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-20, -34, 2, 8);
    ctx.globalAlpha = 1;

    // Weapon pointed forward.
    ctx.fillStyle = '#b7c4d2';
    ctx.fillRect(7, -35, 29, 7);
    ctx.fillStyle = '#526177';
    ctx.fillRect(14, -37, 16, 2);
    ctx.fillStyle = main;
    ctx.fillRect(34, -34, 5, 4);
    ctx.fillStyle = '#151c28';
    ctx.fillRect(16, -28, 4, 7);
    if (f.hitFlash > 0) ctx.globalAlpha = 1;
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    ctx.save();
    if (screenShake > 0) ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    drawBackground();

    // Arena floor lights.
    for (let i = 0; i < 12; i++) {
      const x = (i * 88 + 19) % W;
      ctx.globalAlpha = 0.18 + Math.sin(elapsed * 2 + i) * 0.08;
      ctx.fillStyle = i % 2 ? '#ff4d9b' : '#36d9ff';
      ctx.fillRect(x, FLOOR + 9, 28, 2);
    }
    ctx.globalAlpha = 1;

    // Projectile trails.
    shots.forEach(s => {
      s.trail.forEach(t => {
        ctx.globalAlpha = Math.max(0, t.life / 0.16) * 0.38;
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(t.x, t.y, 2.5, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.shadowColor = s.color; ctx.shadowBlur = 15;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(s.x, s.y, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.ellipse(s.x - Math.sign(s.vx) * 5, s.y, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    drawFighter(player);
    drawFighter(rival);

    // Aim guide is subtle and only shown while lining up a shot.
    if (phase === 'playing' && (isDown('aimUp') || isDown('aimDown'))) {
      ctx.save();
      ctx.setLineDash([4, 7]); ctx.strokeStyle = '#b7f36b'; ctx.globalAlpha = 0.4; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(player.x + 37, player.y - 43); ctx.lineTo(player.x + 220 * Math.cos(aim), player.y - 43 + 220 * Math.sin(aim)); ctx.stroke();
      ctx.restore();
    }

    particles.forEach(p => {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color; ctx.shadowBlur = 8;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    });
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;

    // Active player aim reticle.
    if (phase === 'playing') {
      const rx = player.x + 240 * Math.cos(aim);
      const ry = player.y - 43 + 240 * Math.sin(aim);
      ctx.save(); ctx.globalAlpha = 0.58; ctx.strokeStyle = '#b7f36b'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(rx, ry, 7, 0, Math.PI * 2); ctx.moveTo(rx - 11, ry); ctx.lineTo(rx - 4, ry); ctx.moveTo(rx + 4, ry); ctx.lineTo(rx + 11, ry); ctx.moveTo(rx, ry - 11); ctx.lineTo(rx, ry - 4); ctx.moveTo(rx, ry + 4); ctx.lineTo(rx, ry + 11); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function frame(now) {
    const dt = Math.min(0.033, Math.max(0, (now - (lastTime || now)) / 1000));
    lastTime = now;
    if (phase === 'playing') update(dt);
    else {
      elapsed += dt * 0.35;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
        if (p.life <= 0) particles.splice(i, 1);
      }
    }
    draw();
    requestAnimationFrame(frame);
  }

  updateScoreboard();
  updateHealth();
  resize();
  requestAnimationFrame(frame);
})();
