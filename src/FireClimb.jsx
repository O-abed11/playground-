import { useRef, useEffect, useState } from "react";

const WALL = 16;
const BAR_W = 76;
const BAR_H = 13;
const R = 13;
const GRAV = 0.4;
const JUMP = -11.9;
const MAXK = 2.1;

const LEVELS = {
  easy:   { label: "Easy",   fire: 0.60, behind: 0.55, ramp: 2400, reach: 128, gapMin: 84, gapMax: 108, brkAt: 220, brkP: 0.16, flames: 1, note: "The fire takes its time" },
  medium: { label: "Medium", fire: 0.76, behind: 0.40, ramp: 1400, reach: 150, gapMin: 88, gapMax: 120, brkAt: 120, brkP: 0.26, flames: 2, note: "It keeps pace with you" },
  hard:   { label: "Hard",   fire: 0.90, behind: 0.26, ramp: 900,  reach: 170, gapMin: 92, gapMax: 132, brkAt: 40,  brkP: 0.36, flames: 3, note: "It is already at your heels" },
};

const HIGH_SCORE_KEY = "fireClimbHighScores";

const loadHighScores = () => {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export default function FireClimb() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const [phase, setPhase] = useState("menu");
  const [score, setScore] = useState(0);
  const [name, setName] = useState("");
  const [level, setLevel] = useState("medium");
  const [highScores, setHighScores] = useState(loadHighScores);
  const [isNewHigh, setIsNewHigh] = useState(false);
  const game = useRef(null);
  const phaseRef = useRef("menu");
  const cfgRef = useRef(LEVELS.medium);

  useEffect(() => {
    document.documentElement.style.backgroundColor = "#0A0907";
    document.body.style.backgroundColor = "#0A0907";
  }, []);

  useEffect(() => {
    if (phase !== "over") return;
    const climber = name.trim() || "CLIMBER";
    setHighScores((prev) => {
      const best = prev[level];
      if (best && score <= best.score) {
        setIsNewHigh(false);
        return prev;
      }
      const next = { ...prev, [level]: { score, name: climber } };
      try {
        localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(next));
      } catch {}
      setIsNewHigh(score > 0);
      return next;
    });
  }, [phase]);

  const makeBar = (y, W, prevX, sc, cfg) => {
    const min = WALL + BAR_W / 2 + 4;
    const max = W - WALL - BAR_W / 2 - 4;
    const lo = Math.max(min, prevX - cfg.reach);
    const hi = Math.min(max, prevX + cfg.reach);
    return {
      x: lo + Math.random() * Math.max(1, hi - lo),
      y,
      breakable: sc >= cfg.brkAt && Math.random() < cfg.brkP,
      broken: false, scored: false, burning: false,
      burnT: 0, fade: 1, seed: Math.random() * 100,
    };
  };

  const reset = () => {
    const c = canvasRef.current;
    if (!c) return;
    const cfg = cfgRef.current;
    const gap = () => cfg.gapMin + Math.random() * (cfg.gapMax - cfg.gapMin);
    const W = c.width, H = c.height;
    const floorY = H - 40;
    const bars = [];
    let y = floorY - 112, prevX = W / 2, lastY = y;
    while (y > -H) {
      const b = makeBar(y, W, prevX, 0, cfg);
      bars.push(b); prevX = b.x; lastY = y; y -= gap();
    }
    game.current = {
      W, H, floorY, cfg, gap,
      ball: { x: W / 2, y: floorY - R - 130, vx: 0, vy: 0 },
      pointerX: W / 2, camY: 0, fireTop: floorY, ignited: false,
      topBarY: lastY, lastX: prevX,
      bars, embers: [], death: null, score: 0, t: 0,
    };
    setScore(0);
  };

  useEffect(() => {
    const c = canvasRef.current;
    const fit = () => {
      const box = wrapRef.current.getBoundingClientRect();
      c.width = Math.min(460, box.width);
      c.height = box.height;
      reset();
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    const move = (e) => {
      const r = c.getBoundingClientRect();
      if (game.current) game.current.pointerX = e.clientX - r.left;
    };
    c.addEventListener("pointermove", move);
    return () => c.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = c.getContext("2d");
    let raf;

    const die = (g) => {
      const b = g.ball, parts = [];
      for (let i = 0; i < 60; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 2 + Math.random() * 9;
        parts.push({
          x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 2,
          r: 1.5 + Math.random() * 4, life: 1, hot: Math.random() > 0.4,
        });
      }
      g.death = { t: 0, x: b.x, y: b.y, parts };
      setPhase("dying");
    };

    const tick = (g) => {
      g.t++;
      const b = g.ball, cfg = g.cfg;
      const k = 1 + Math.min(MAXK - 1, g.score / cfg.ramp);
      const grav = GRAV * k * k;
      const jump = JUMP * k;

      const dx = g.pointerX - b.x;
      b.vx = Math.max(-7.5 * k, Math.min(7.5 * k, dx * 0.15 * k));
      b.x += b.vx;
      if (b.x - R < WALL) { b.x = WALL + R; b.vx = 0; }
      if (b.x + R > g.W - WALL) { b.x = g.W - WALL - R; b.vx = 0; }

      const prevY = b.y;
      b.vy += grav;
      b.y += b.vy;

      if (b.vy > 0) {
        if (!g.ignited && prevY + R <= g.floorY + 2 && b.y + R >= g.floorY) {
          b.y = g.floorY - R; b.vy = jump;
        }
        for (const bar of g.bars) {
          if (bar.broken || bar.burning) continue;
          if (
            prevY + R <= bar.y + 2 && b.y + R >= bar.y &&
            b.x > bar.x - BAR_W / 2 - R * 0.4 &&
            b.x < bar.x + BAR_W / 2 + R * 0.4
          ) {
            b.y = bar.y - R; b.vy = jump; g.ignited = true;
            if (!bar.scored) { bar.scored = true; g.score += 10; setScore(g.score); }
            if (bar.breakable) bar.broken = true;
            break;
          }
        }
      }

      const target = b.y - g.H * 0.44;
      if (target < g.camY) g.camY += (target - g.camY) * 0.16;

      while (g.topBarY > g.camY - g.H) {
        g.topBarY -= g.gap();
        const nb = makeBar(g.topBarY, g.W, g.lastX, g.score, cfg);
        g.lastX = nb.x; g.bars.push(nb);
      }

      for (const bar of g.bars) {
        if (bar.broken) { bar.fade -= 0.05; bar.y += 4; }
        if (!bar.burning && !bar.broken && bar.y >= g.fireTop - 14) bar.burning = true;
        if (bar.burning) { bar.burnT++; if (bar.burnT > 70) bar.fade -= 0.06; }
      }
      g.bars = g.bars.filter((bar) => bar.y < g.camY + g.H + 240 && bar.fade > 0);

      if (g.ignited) {
        const avg = (cfg.gapMin + cfg.gapMax) / 2;
        const climbRate = (avg * grav) / (2 * Math.abs(jump));
        let speed = climbRate * cfg.fire;
        const behind = g.fireTop - b.y;
        const maxBehind = g.H * cfg.behind;
        if (behind > maxBehind) speed += (behind - maxBehind) * 0.06;
        g.fireTop -= speed;

        if (g.t % 2 === 0) {
          g.embers.push({
            x: Math.random() * g.W, y: g.fireTop + Math.random() * 20,
            vy: -0.8 - Math.random() * 1.6, vx: (Math.random() - 0.5) * 0.7,
            life: 1, r: 1 + Math.random() * 2,
          });
        }
      }
      for (const e of g.embers) { e.y += e.vy; e.x += e.vx; e.life -= 0.011; }
      g.embers = g.embers.filter((e) => e.life > 0);

      if (g.ignited && b.y + R >= g.fireTop) die(g);
    };

    const deathTick = (g) => {
      const d = g.death;
      d.t++;
      for (const p of d.parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.22; p.vx *= 0.985; p.life -= 0.012;
      }
      for (const e of g.embers) { e.y += e.vy; e.x += e.vx; e.life -= 0.02; }
      g.embers = g.embers.filter((e) => e.life > 0);
      if (d.t > 96) setPhase("over");
    };

    const drawScene = (ctx, g, ph) => {
      const { W, H, camY } = g;
      const sy = (y) => Math.round(y - camY);

      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#080A14");
      sky.addColorStop(1, "#191F38");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);

      const ft = sy(g.fireTop);
      if (g.ignited && ft < H + 200) {
        const gl = ctx.createLinearGradient(0, ft - 240, 0, ft);
        gl.addColorStop(0, "rgba(255,90,0,0)");
        gl.addColorStop(1, "rgba(255,110,20,0.28)");
        ctx.fillStyle = gl;
        ctx.fillRect(0, ft - 240, W, 240);
      }

      ctx.fillStyle = "#212840";
      ctx.fillRect(0, 0, WALL, H);
      ctx.fillRect(W - WALL, 0, WALL, H);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      for (let i = 0; i < H + 30; i += 30) {
        const o = (((i - camY * 0.5) % 30) + 30) % 30;
        ctx.fillRect(2, i - o, WALL - 4, 2);
        ctx.fillRect(W - WALL + 2, i - o, WALL - 4, 2);
      }

      for (const bar of g.bars) {
        const y = sy(bar.y);
        if (y < -40 || y > H + 40) continue;
        ctx.save();
        ctx.globalAlpha = Math.max(0, bar.fade);
        const x0 = bar.x - BAR_W / 2;
        const ch = bar.burning ? Math.min(1, bar.burnT / 55) : 0;
        const mx = (a, b2) => Math.round(a + (b2 - a) * ch);
        ctx.fillStyle = `rgb(${mx(139, 38)},${mx(94, 30)},${mx(58, 26)})`;
        ctx.beginPath();
        ctx.roundRect(x0, y, BAR_W, BAR_H, 3);
        ctx.fill();
        ctx.fillStyle = `rgb(${mx(168, 54)},${mx(117, 42)},${mx(74, 36)})`;
        ctx.fillRect(x0 + 2, y + 1.5, BAR_W - 4, 2.5);
        ctx.strokeStyle = `rgba(60,38,22,${0.5 - ch * 0.3})`;
        ctx.lineWidth = 1;
        for (let kk = 0; kk < 3; kk++) {
          const gy = y + 4 + kk * 3;
          ctx.beginPath();
          ctx.moveTo(x0 + 4, gy);
          for (let x = x0 + 4; x < x0 + BAR_W - 4; x += 8)
            ctx.lineTo(x, gy + Math.sin((x + bar.seed) * 0.5) * 0.7);
          ctx.stroke();
        }
        ctx.fillStyle = `rgba(50,32,18,${0.55 - ch * 0.2})`;
        ctx.fillRect(x0, y, 2.5, BAR_H);
        ctx.fillRect(x0 + BAR_W - 2.5, y, 2.5, BAR_H);
        if (bar.breakable && !bar.burning) {
          ctx.strokeStyle = "rgba(28,18,10,0.75)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(bar.x - 6, y); ctx.lineTo(bar.x - 1, y + BAR_H);
          ctx.moveTo(bar.x + 8, y); ctx.lineTo(bar.x + 13, y + BAR_H);
          ctx.stroke();
        }
        if (bar.burning) {
          for (let x = x0 + 3; x < x0 + BAR_W - 3; x += 7) {
            const h = 9 + Math.sin((x + bar.seed) * 0.4 + g.t * 0.3) * 5 + Math.random() * 4;
            const fg = ctx.createLinearGradient(0, y - h, 0, y + 3);
            fg.addColorStop(0, "rgba(255,214,120,0)");
            fg.addColorStop(0.4, "rgba(255,150,40,0.85)");
            fg.addColorStop(1, "rgba(255,80,0,0.95)");
            ctx.fillStyle = fg;
            ctx.beginPath();
            ctx.moveTo(x, y + 3);
            ctx.quadraticCurveTo(x + 3.5, y - h, x + 7, y + 3);
            ctx.fill();
          }
        }
        ctx.restore();
      }

      if (ph !== "dying" && ph !== "over") {
        const b = g.ball, by = sy(b.y);
        const bg = ctx.createRadialGradient(b.x - 4, by - 5, 1, b.x, by, R);
        bg.addColorStop(0, "#FFFFFF");
        bg.addColorStop(1, "#E6D3B8");
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(b.x, by, R, 0, Math.PI * 2);
        ctx.fill();
      }

      if (!g.ignited) {
        const fy = sy(g.floorY);
        ctx.fillStyle = "#2A3252";
        ctx.fillRect(WALL, fy, W - WALL * 2, H);
        ctx.fillStyle = "#3A4468";
        ctx.fillRect(WALL, fy, W - WALL * 2, 4);
      }

      if (g.ignited && ft < H + 60) {
        const layers = [
          { off: 14, sp: 0.11, fr: 0.05,  amp: 11, c: ["#8C1300", "#B32400"] },
          { off: 6,  sp: 0.17, fr: 0.075, amp: 9,  c: ["#FF6A00", "#C22F00"] },
          { off: 0,  sp: 0.24, fr: 0.11,  amp: 7,  c: ["#FFD166", "#FF8A1E"] },
        ];
        for (const L of layers) {
          const lt = ft + L.off;
          const gd = ctx.createLinearGradient(0, lt, 0, lt + 200);
          gd.addColorStop(0, L.c[0]); gd.addColorStop(1, L.c[1]);
          ctx.fillStyle = gd;
          ctx.beginPath();
          ctx.moveTo(0, H + 60); ctx.lineTo(0, lt);
          for (let x = 0; x <= W; x += 6) {
            const w = Math.sin(x * L.fr + g.t * L.sp) * L.amp +
              Math.sin(x * L.fr * 2.7 + g.t * L.sp * 1.6) * (L.amp * 0.45);
            ctx.lineTo(x, lt + w);
          }
          ctx.lineTo(W, H + 60);
          ctx.closePath(); ctx.fill();
        }
        for (let x = 0; x < W; x += 18) {
          const h = 18 + Math.sin(x * 0.2 + g.t * 0.26) * 14;
          if (h < 6) continue;
          const tg = ctx.createLinearGradient(0, ft - h, 0, ft + 10);
          tg.addColorStop(0, "rgba(255,225,150,0)");
          tg.addColorStop(0.5, "rgba(255,160,40,0.7)");
          tg.addColorStop(1, "rgba(255,90,0,0.9)");
          ctx.fillStyle = tg;
          ctx.beginPath();
          ctx.moveTo(x, ft + 10);
          ctx.quadraticCurveTo(x + 9, ft - h, x + 18, ft + 10);
          ctx.fill();
        }
      }

      for (const e of g.embers) {
        ctx.globalAlpha = Math.max(0, e.life) * 0.9;
        ctx.fillStyle = e.life > 0.5 ? "#FFD37A" : "#FF7A18";
        ctx.beginPath();
        ctx.arc(e.x, sy(e.y), e.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawDeath = (ctx, g) => {
      const d = g.death, { W, H } = g;
      const sy = (y) => Math.round(y - g.camY);
      const p = d.t / 96;
      if (d.t < 8) {
        ctx.fillStyle = `rgba(255,240,200,${0.85 - d.t / 10})`;
        ctx.fillRect(0, 0, W, H);
      }
      for (const q of d.parts) {
        if (q.life <= 0) continue;
        ctx.globalAlpha = Math.max(0, q.life);
        ctx.fillStyle = q.hot ? "#FFD37A" : "#FF6A18";
        ctx.beginPath();
        ctx.arc(q.x, sy(q.y), q.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      const ease = p * p * p;
      const maxR = Math.hypot(W, H) * 0.95;
      const rad = 6 + ease * maxR;
      const cx = d.x + (W / 2 - d.x) * Math.min(1, p * 1.6);
      const cy = sy(d.y) + (H / 2 - sy(d.y)) * Math.min(1, p * 1.6);
      const fb = ctx.createRadialGradient(cx, cy, rad * 0.05, cx, cy, rad);
      fb.addColorStop(0, "rgba(255,255,240,0.98)");
      fb.addColorStop(0.18, "rgba(255,214,102,0.95)");
      fb.addColorStop(0.45, "rgba(255,120,20,0.85)");
      fb.addColorStop(0.78, "rgba(180,32,0,0.6)");
      fb.addColorStop(1, "rgba(90,10,0,0)");
      ctx.fillStyle = fb;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.12) {
        const wob = 1 + Math.sin(a * 6 + g.t * 0.3) * 0.07 + Math.sin(a * 11 - g.t * 0.22) * 0.04;
        const rr = rad * wob;
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    };

    const step = () => {
      const g = game.current;
      if (g) {
        const ph = phaseRef.current;
        if (ph === "playing") tick(g);
        else if (ph === "dying") deathTick(g);
        ctx.save();
        if (ph === "dying" && g.death && g.death.t < 24) {
          const sh = (1 - g.death.t / 24) * 9;
          ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
        }
        drawScene(ctx, g, ph);
        if ((ph === "dying" || ph === "over") && g.death) drawDeath(ctx, g);
        ctx.restore();
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, []);

  const play = () => {
    cfgRef.current = LEVELS[level];
    reset();
    setIsNewHigh(false);
    setPhase("playing");
  };
  const exit = () => {
    reset();
    setPhase("menu");
  };

  const player = name.trim() || "CLIMBER";
  const GLOW = {
    color: "#FFC24B",
    textShadow: "0 0 18px rgba(255,120,20,0.9), 0 0 44px rgba(255,80,0,0.5), 0 2px 0 #7E2200",
  };
  const GLOW_SOFT = {
    color: "#FFD9A0",
    textShadow: "0 0 12px rgba(255,120,20,0.55), 0 1px 0 #5A1800",
  };

  const Embers = () => (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(14)].map((_, i) => (
        <span
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${(i * 7.3 + 4) % 96}%`,
            bottom: "-12px",
            width: `${2 + (i % 3)}px`,
            height: `${2 + (i % 3)}px`,
            background: i % 3 === 0 ? "#FFD37A" : "#FF7A18",
            animation: `rise ${7 + (i % 5) * 1.6}s linear ${i * 0.9}s infinite`,
          }}
        />
      ))}
    </div>
  );

  const Flames = ({ n, on }) => (
    <span className="flex gap-[4px]">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="block w-[9px] h-[16px]"
          style={{
            clipPath: "polygon(50% 0%, 100% 55%, 82% 100%, 18% 100%, 0% 55%)",
            background: i <= n
              ? (on ? "#FFC46B" : "#FF8A1E")
              : "rgba(255,255,255,0.15)",
          }}
        />
      ))}
    </span>
  );

  return (
    <div
      ref={wrapRef}
      className="h-full w-full bg-[#0A0907] flex items-center justify-center relative overflow-hidden select-none"
      style={{ touchAction: "none" }}
    >
      <style>{`
        @keyframes flick { 0%,100%{filter:brightness(1)} 45%{filter:brightness(1.25)} 70%{filter:brightness(0.9)} }
        @keyframes rise { 0%{transform:translateY(0);opacity:0} 12%{opacity:.95} 100%{transform:translateY(-105vh) translateX(18px);opacity:0} }
        @keyframes pulseGlow { 0%,100%{box-shadow:0 0 26px rgba(255,110,20,.35)} 50%{box-shadow:0 0 46px rgba(255,140,30,.6)} }
        .ember { animation: flick 1.1s infinite; }
        .molten { animation: pulseGlow 2.4s ease-in-out infinite; }
      `}</style>

      <canvas
        ref={canvasRef}
        className={`block touch-none ${phase === "menu" ? "invisible" : ""}`}
      />

      {phase === "playing" && (
        <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-5 pointer-events-none">
          <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-white/60">{player}</span>
          <span className="font-mono text-3xl font-bold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">{score}</span>
          <span className="font-mono text-[11px] tracking-[0.2em] uppercase text-[#FFB347]">{LEVELS[level].label}</span>
        </div>
      )}

      {phase === "menu" && (
        <div className="absolute inset-0 z-20 bg-[#0A0907] overflow-hidden">
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "linear-gradient(to top, rgba(255,90,0,0.22) 0%, rgba(255,80,0,0.10) 30%, rgba(255,70,0,0.03) 60%, transparent 100%)" }} />
          <Embers />
          <div className="relative h-full flex items-center justify-center px-6 py-4">
            <div className="w-full max-w-[320px]">
              <div className="text-center mb-5">
                <p className="font-mono text-[10px] tracking-[0.45em] uppercase text-[#FFB347] mb-1.5">Chapter One</p>
                <h1 className="ember text-[38px] leading-[0.86] font-black tracking-tight"
                  style={{ color: "#FFC24B", textShadow: "0 0 26px rgba(255,120,20,0.85), 0 0 60px rgba(255,80,0,0.5), 0 2px 0 #7E2200" }}>
                  FIRE<br />CLIMB
                </h1>
                <div className="mx-auto mt-2.5 h-[3px] w-20 rounded-full bg-gradient-to-r from-transparent via-[#FF7A18] to-transparent" />
                <p className="mt-2.5 font-mono text-[10px] tracking-[0.2em] uppercase text-[#C9BCA8]">The floor is burning</p>
              </div>

              <p className="font-mono text-[10px] tracking-[0.35em] uppercase text-[#E0B37A] mb-1.5">Who is climbing</p>
              <div className="relative mb-4">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={12}
                  placeholder="CLIMBER"
                  style={GLOW_SOFT}
                  className="w-full bg-[#16130F] border border-[#5A4636] rounded-lg px-4 py-3 font-mono text-[14px] font-bold tracking-[0.15em] uppercase placeholder-[#7A6A58] outline-none focus:border-[#FF8A1E] transition"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[#6B5F50]">{name.length}/12</span>
              </div>

              <p className="font-mono text-[10px] tracking-[0.35em] uppercase text-[#E0B37A] mb-1.5">How hot</p>
              <div className="space-y-1.5 mb-5">
                {Object.entries(LEVELS).map(([id, l]) => {
                  const on = level === id;
                  return (
                    <button key={id} onClick={() => setLevel(id)}
                      className={`w-full flex flex-col items-center justify-center gap-1.5 px-4 py-3 rounded-lg border transition ${
                        on ? "border-[#FF8A1E] bg-gradient-to-r from-[#4A1505] to-[#7E2200] shadow-[0_0_24px_rgba(255,110,20,0.35)]"
                           : "border-[#3A3128] bg-[#16130F]"}`}>
                      <Flames n={l.flames} on={on} />
                      <span className="block font-mono text-[18px] tracking-[0.28em] uppercase font-black" style={on ? GLOW : GLOW_SOFT}>{l.label}</span>
                    </button>
                  );
                })}
              </div>

              <button onClick={play}
                style={GLOW}
                className="molten w-full py-4 rounded-lg font-mono text-[19px] font-black tracking-[0.32em] bg-gradient-to-b from-[#5A1A05] to-[#8E2400] border-2 border-[#FF8A1E]">
                CLIMB
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "over" && (
        <div className="absolute inset-0 z-20 bg-[#0A0907] overflow-y-auto">
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "linear-gradient(to top, rgba(255,90,0,0.24) 0%, rgba(255,80,0,0.11) 30%, rgba(255,70,0,0.03) 60%, transparent 100%)" }} />
          <Embers />
          <div className="relative min-h-full flex items-center justify-center px-6 py-10">
            <div className="w-full max-w-[330px]">
              <div className="rounded-2xl border border-[#4A3A2A] bg-[#16130F] overflow-hidden">
                <div className="px-7 pt-7 pb-6 text-center">
                  <p className="font-mono text-[10px] tracking-[0.5em] uppercase text-[#FFD37A] mb-4">Burned out</p>
                  <p className="ember font-mono text-[76px] leading-none font-black"
                    style={{ color: "#FFD37A", textShadow: "0 0 30px rgba(255,120,20,0.9), 0 0 70px rgba(255,70,0,0.55), 0 2px 0 #7E2200" }}>{score}</p>
                  <p className="mt-2 font-mono text-[10px] tracking-[0.4em] uppercase text-[#9C8E7C]">Points</p>
                  {isNewHigh ? (
                    <p className="ember mt-4 font-mono text-[12px] font-black tracking-[0.35em] uppercase text-[#FFD37A]"
                      style={{ textShadow: "0 0 16px rgba(255,120,20,0.8), 0 0 36px rgba(255,80,0,0.5)" }}>
                      New High Score
                    </p>
                  ) : highScores[level] ? (
                    <p className="mt-4 font-mono text-[11px] tracking-[0.15em] uppercase text-[#C9BCA8]">
                      Best <span className="text-[#FFB347] font-bold">{highScores[level].score}</span> by{" "}
                      <span className="text-[#FFF3D6]">{highScores[level].name}</span>
                    </p>
                  ) : null}
                </div>
                <div className="h-px bg-gradient-to-r from-transparent via-[#FF7A18] to-transparent" />
                <div className="flex divide-x divide-[#3A3128] text-center">
                  <div className="flex-1 py-4">
                    <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-[#9C8E7C] mb-1">Climber</p>
                    <p className="font-mono text-[13px] uppercase text-[#FFF3D6] truncate px-2">{player}</p>
                  </div>
                  <div className="flex-1 py-4">
                    <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-[#9C8E7C] mb-1">Heat</p>
                    <p className="font-mono text-[13px] uppercase text-[#FFB347]">{LEVELS[level].label}</p>
                  </div>
                  <div className="flex-1 py-4">
                    <p className="font-mono text-[9px] tracking-[0.3em] uppercase text-[#9C8E7C] mb-1">Bars</p>
                    <p className="font-mono text-[13px] text-[#FFF3D6]">{score / 10}</p>
                  </div>
                </div>
              </div>

              <button onClick={play}
                style={GLOW}
                className="molten w-full mt-6 py-4 rounded-lg font-mono text-[19px] font-black tracking-[0.32em] bg-gradient-to-b from-[#5A1A05] to-[#8E2400] border-2 border-[#FF8A1E]">
                AGAIN
              </button>
              <button onClick={exit}
                style={GLOW_SOFT}
                className="w-full mt-3 py-3.5 rounded-lg font-mono text-[16px] font-bold tracking-[0.32em] bg-[#1C1410] border border-[#8A5A2A] transition">
                EXIT
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
