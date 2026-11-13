const EX = [0.95, -0.3];
const EZ = [0.5, 0.42];
const AVENUE = 1.3;
const STREET = 0.9;
const WALK = 0.4;
const LIFT = 0.3;
const BLOCK = 6;
const LOT = 0.76;

export const MONO = `ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace`;
export const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif`;

const PALETTES = {
  night: {
    night: true,
    accent: "#34d399",
    board: "#0b1220",
    boardText: "#f8fafc",
    boardSub: "#6ee7b7",
    tag: "#0b1220",
    tagText: "#ecfdf5",
    slab: "#0c110f",
    lot: "#121916",
    park: "#10261a",
    road: "#191c20",
    walk: "#272b30",
    line: "#ca8a04",
    roofs: ["#1c2522", "#0b5a43", "#0f8a63", "#1fbf86", "#6ee7b7"],
    walls: ["#1a212b", "#20262f", "#1b2420", "#252a31", "#1e2330"],
    lit: ["#fde68a", "#fcd34d", "#fef3c7", "#a5f3fc"],
    dim: "#0b1016",
    trunk: "#3b2a1e",
    crowns: ["#14532d", "#166534", "#15803d"],
    lamp: "#fde68a",
    heli: "#0f172a",
  },
  day: {
    night: false,
    accent: "#059669",
    board: "#ffffff",
    boardText: "#0f172a",
    boardSub: "#047857",
    tag: "#ffffff",
    tagText: "#064e3b",
    slab: "#dfe6e2",
    lot: "#e9efeb",
    park: "#bfe3c8",
    road: "#6b7280",
    walk: "#d4d4d8",
    line: "#facc15",
    roofs: ["#e4e9e7", "#a7f3d0", "#5fd9a8", "#16b981", "#047857"],
    walls: ["#d6dde6", "#e2e8f0", "#d8d4cf", "#cfd8e3", "#e5e0da"],
    lit: ["#bfdbfe", "#93c5fd", "#dbeafe", "#a5b4fc"],
    dim: "#94a3b8",
    trunk: "#7c5a3c",
    crowns: ["#16a34a", "#22c55e", "#15803d"],
    lamp: "#f8fafc",
    heli: "#1f2937",
  },
};

const CARS = ["#ef4444", "#f59e0b", "#facc15", "#3b82f6", "#e5e7eb", "#10b981", "#a855f7", "#111827", "#f97316"];
const SHIRTS = ["#ef4444", "#3b82f6", "#f59e0b", "#10b981", "#e5e7eb", "#a855f7", "#ec4899", "#14b8a6"];
const PANTS = ["#1e293b", "#334155", "#1e3a8a", "#3f3f46"];
const SKIN = ["#f1c7a5", "#d69e74", "#a0694a", "#6b4430"];

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(Math.min(255, v * k)).toString(16).padStart(2, "0");
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function hash(s) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

export function wrap(text, width, maxLines) {
  const lines = [""];
  for (const word of text.split(/\s+/)) {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = word;
    else if (cur.length + 1 + word.length <= width) lines[lines.length - 1] = `${cur} ${word}`;
    else lines.push(word);
  }
  const out = lines.slice(0, maxLines).map((l) => (l.length > width ? `${l.slice(0, width - 1)}…` : l));
  if (lines.length > maxLines) out[maxLines - 1] = `${out[maxLines - 1].slice(0, width - 1)}…`;
  return out;
}

function random(seed) {
  let t = seed;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds an isometric living-city diorama from the contribution calendar, fitted into `box`. */
export function cityScene(mode, weeks, box, live = {}) {
  const C = PALETTES[mode];
  const visitors = live.visitors ?? [];
  const rand = random(1337);
  const pick = (list) => list[Math.floor(rand() * list.length)];

  const half = Math.ceil(weeks.length / 2);
  const colX = (x) => x + Math.floor(x / BLOCK) * STREET;
  const XE = colX(half - 1) + 1;
  const ZM = 7 + WALK;
  const ZM2 = ZM + AVENUE;
  const Z1 = ZM2 + WALK;
  const ZB = Z1 + 7;
  const ZR = ZB + WALK;
  const ZW = ZR + AVENUE;
  const ZE = ZW + WALK;
  const districts = [0, Z1];
  const X0 = -0.6;
  const X1 = XE + 0.6;
  const Z0 = -0.6;

  const days = weeks.flatMap((week, x) => week.map((d) => ({ x, z: new Date(`${d.date}T00:00:00Z`).getUTCDay(), n: d.contributionCount, date: d.date })));
  const active = days.map((d) => d.n).filter((n) => n > 0).sort((a, b) => a - b);
  const cap = active[Math.floor(active.length * 0.95)] || 1;
  const cells = days.map((d) => {
    const v = d.n === 0 ? 0 : Math.min(1, d.n / cap);
    const district = d.x < half ? 0 : 1;
    return {
      ...d,
      district,
      X: colX(d.x - district * half),
      Z: districts[district] + d.z,
      v,
      lvl: d.n === 0 ? 0 : v > 0.66 ? 4 : v > 0.33 ? 3 : v > 0.12 ? 2 : 1,
      h: 0.4 + Math.sqrt(v) * 6,
    };
  });

  const raw = (x, y, z) => [x * EX[0] + z * EZ[0], x * EX[1] + z * EZ[1] - y];
  const bounds = [raw(X0, 0, ZE), raw(X1, 0, Z0), raw(X0, 0, Z0), raw(X1, 0, ZE)];
  for (const c of cells) if (c.n) bounds.push(raw(c.X + 1, LIFT + c.h, c.Z));
  const BOARD = { x1: XE - 0.4, x0: XE - 10.4, z: Z0 + 0.4, y0: 7.2, y1: 10.6 };
  if (live.commit) bounds.push(raw(BOARD.x0, BOARD.y1, BOARD.z), raw(BOARD.x1, BOARD.y1, BOARD.z));
  const minX = Math.min(...bounds.map((p) => p[0]));
  const maxX = Math.max(...bounds.map((p) => p[0]));
  const minY = Math.min(...bounds.map((p) => p[1]));
  const maxY = Math.max(...bounds.map((p) => p[1]));
  const k = Math.min(box.w / (maxX - minX), box.h / (maxY - minY));
  const ox = box.x + (box.w - (maxX - minX) * k) / 2 - minX * k;
  const oy = box.y + (box.h - (maxY - minY) * k) / 2 - minY * k;

  const S = (x, y, z) => {
    const [px, py] = raw(x, y, z);
    return [ox + px * k, oy + py * k];
  };
  const pt = (p) => S(...p).map((v) => v.toFixed(1)).join(",");
  const poly = (fill, pts, extra = "") => `<polygon fill="${fill}"${extra} points="${pts.map(pt).join(" ")}"/>`;
  const quad = (fill, x0, z0, x1, z1, y = LIFT) => poly(fill, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
  const f = (v) => v.toFixed(1);

  function box3(x0, y0, z0, x1, y1, z1, top, front, left, extra = "") {
    return [
      poly(top, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]),
      poly(front, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], extra),
      poly(left, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]),
    ].join("");
  }

  const ground = [
    poly(shade(C.slab, 0.8), [[X0, 0, ZE], [X1, 0, ZE], [X1, LIFT, ZE], [X0, LIFT, ZE]]),
    poly(shade(C.slab, 0.6), [[X0, 0, Z0], [X0, 0, ZE], [X0, LIFT, ZE], [X0, LIFT, Z0]]),
    quad(C.lot, X0, Z0, X1, ZE),
  ];
  const zebra = shade(C.road, C.night ? 1.9 : 1.35);
  for (let g = 1; g * BLOCK < half; g++) {
    const xs = colX(g * BLOCK) - STREET;
    for (const [za, zb] of [[Z0, 7], [Z1, ZB]]) {
      ground.push(quad(C.road, xs, za, xs + STREET, zb));
      for (let i = 0; i < 4; i++) ground.push(quad(zebra, xs + 0.1 + i * 0.2, zb - 0.34, xs + 0.2 + i * 0.2, zb - 0.06));
    }
  }
  ground.push(
    quad(C.walk, X0, 7, X1, ZM), quad(C.road, X0, ZM, X1, ZM2), quad(C.walk, X0, ZM2, X1, Z1),
    quad(C.walk, X0, ZB, X1, ZR), quad(C.road, X0, ZR, X1, ZW), quad(C.walk, X0, ZW, X1, ZE)
  );
  for (const zc of [ZM + AVENUE / 2, ZR + AVENUE / 2]) {
    const [ax, ay] = S(X0, LIFT, zc);
    const [bx, by] = S(X1, LIFT, zc);
    ground.push(`<line x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}" stroke="${C.line}" stroke-width="${f(k * 0.06)}" stroke-dasharray="${f(k * 0.5)} ${f(k * 0.4)}"/>`);
  }
  for (const c of cells) if (!c.n) ground.push(quad(C.park, c.X + 0.04, c.Z + 0.04, c.X + 0.96, c.Z + 0.96));

  const defs = [];
  const windowPattern = (id, dir, seed) => {
    const r = random(seed);
    const rects = [];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const on = r() < (C.night ? 0.62 : 0.8);
        const color = on ? C.lit[Math.floor(r() * C.lit.length)] : C.dim;
        rects.push(`<rect x="${i * 0.2 + 0.05}" y="${j * 0.4 + 0.1}" width="0.1" height="0.2" fill="${color}" opacity="${on ? (C.night ? 0.9 : 0.75) : 0.8}"/>`);
      }
    defs.push(`<pattern id="${id}" patternUnits="userSpaceOnUse" width="0.6" height="1.2" patternTransform="matrix(${(dir[0] * k).toFixed(3)} ${(dir[1] * k).toFixed(3)} 0 ${k.toFixed(3)} ${ox.toFixed(2)} ${oy.toFixed(2)})">${rects.join("")}</pattern>`);
  };
  for (let v = 0; v < 3; v++) {
    windowPattern(`wf${v}`, EX, 11 + v);
    windowPattern(`wl${v}`, EZ, 41 + v);
  }

  const tree = (x, z, r, delay) => {
    const [sx, sy] = S(x, LIFT, z);
    const crown = pick(C.crowns);
    return `<g class="t" style="animation-delay:${delay.toFixed(2)}s"><ellipse cx="${f(sx)}" cy="${f(sy)}" rx="${f(r * k * 0.9)}" ry="${f(r * k * 0.4)}" fill="#000" opacity=".25"/><rect x="${f(sx - k * 0.04)}" y="${f(sy - k * 0.4)}" width="${f(k * 0.08)}" height="${f(k * 0.4)}" fill="${C.trunk}"/><circle cx="${f(sx)}" cy="${f(sy - k * (0.4 + r * 0.8))}" r="${f(r * k)}" fill="${crown}"/><circle cx="${f(sx - r * k * 0.3)}" cy="${f(sy - k * (0.4 + r * 1.1))}" r="${f(r * k * 0.55)}" fill="${shade(crown, 1.35)}"/></g>`;
  };

  const building = (c) => {
    const x0 = c.X + (1 - LOT) / 2;
    const z0 = c.Z + (1 - LOT) / 2;
    const x1 = x0 + LOT;
    const z1 = z0 + LOT;
    const y1 = LIFT + c.h;
    const wall = pick(C.walls);
    const roof = C.roofs[c.lvl];
    const v = Math.floor(rand() * 3);
    let out = box3(x0, LIFT, z0, x1, y1, z1, roof, shade(wall, 0.85), shade(wall, 0.62));
    if (c.h > 0.9) {
      out += poly(`url(#wf${v})`, [[x0, LIFT + 0.12, z1], [x1, LIFT + 0.12, z1], [x1, y1 - 0.12, z1], [x0, y1 - 0.12, z1]]);
      out += poly(`url(#wl${v})`, [[x0, LIFT + 0.12, z0], [x0, LIFT + 0.12, z1], [x0, y1 - 0.12, z1], [x0, y1 - 0.12, z0]]);
    }
    if (c.h > 3.2) out += box3(x0 + 0.22, y1, z0 + 0.22, x0 + 0.42, y1 + 0.18, z0 + 0.42, shade(wall, 1.1), shade(wall, 0.8), shade(wall, 0.6));
    if (c.h > 4.6 && C.night) {
      const [bx, by] = S(x0 + LOT / 2, y1 + 0.5, z0 + LOT / 2);
      out += `<line x1="${f(bx)}" y1="${f(by)}" x2="${f(bx)}" y2="${f(by + k * 0.5)}" stroke="${shade(wall, 1.4)}" stroke-width="1"/><circle class="beacon" cx="${f(bx)}" cy="${f(by)}" r="${f(k * 0.07)}" fill="#ef4444" style="animation-delay:${(rand() * 2).toFixed(2)}s"/>`;
    }
    if (c === latest) {
      out += poly(C.accent, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], ` class="pulse"`);
      if (live.coding) {
        const [lx, ly] = S(x0, y1, z0 + LOT / 2);
        const [rx, ry] = S(x1, y1, z0 + LOT / 2);
        out += `<polygon class="beam" fill="url(#live)" points="${f(lx)},${f(ly)} ${f(rx)},${f(ry)} ${f(rx + k * 0.25)},${f(box.y - 40)} ${f(lx - k * 0.25)},${f(box.y - 40)}"/>`;
      }
    }
    return `<g class="b" style="animation-delay:${(0.2 + c.x * 0.022 + c.z * 0.02).toFixed(3)}s"><title>${c.date}: ${c.n} contribution${c.n === 1 ? "" : "s"}</title>${out}</g>`;
  };

  const latest = cells.filter((c) => c.n).at(-1);
  defs.push(`<linearGradient id="live" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${C.accent}" stop-opacity=".7"/><stop offset="1" stop-color="${C.accent}" stop-opacity="0"/></linearGradient>`);

  const billboard = (commit) => {
    const { x0, x1, z, y0, y1 } = BOARD;
    const frame = C.night ? "#1f2937" : "#cbd5e1";
    let out = "";
    for (const px of [x0 + 1.4, x1 - 1.4]) out += box3(px, LIFT, z - 0.2, px + 0.18, y0, z - 0.02, frame, shade(frame, 0.8), shade(frame, 0.6));
    out += box3(x0 - 0.12, y0 - 0.12, z - 0.22, x1 + 0.12, y1 + 0.12, z, frame, frame, shade(frame, 0.7));
    out += poly(C.board, [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]);
    out += poly(C.accent, [[x0, y1 - 0.08, z], [x1, y1 - 0.08, z], [x1, y1, z], [x0, y1, z]]);
    const [sx, sy] = S(x0, y1, z);
    const lines = wrap(commit.message, 28, 2);
    out += `<g transform="matrix(${(EX[0] * k).toFixed(3)} ${(EX[1] * k).toFixed(3)} 0 ${k.toFixed(3)} ${f(sx)} ${f(sy)})">`;
    out += `<text x="0.45" y="0.8" class="bb-sub">latest commit · ${esc(commit.repo)} · ${esc(commit.ago)}</text>`;
    lines.forEach((l, i) => (out += `<text x="0.45" y="${(1.75 + i * 0.86).toFixed(2)}" class="bb-msg">${esc(l)}</text>`));
    out += `</g>`;
    if (C.night)
      for (const px of [x0 + 2, (x0 + x1) / 2, x1 - 2]) {
        const [gx, gy] = S(px, y1 - 0.9, z);
        out += `<ellipse cx="${f(gx)}" cy="${f(gy)}" rx="${f(k * 1.3)}" ry="${f(k * 1.1)}" fill="url(#glow)" opacity=".35"/>`;
      }
    return `<g class="fade-in"><title>Latest commit: ${esc(commit.repo)} — ${esc(commit.message)}</title>${out}</g>`;
  };

  const lot = (c) => (c.n ? building(c) : tree(c.X + 0.5, c.Z + 0.55, 0.3, rand() * 3));
  const byDepth = (a, b) => a.Z - b.Z || b.X - a.X;
  const back = cells.filter((c) => c.district === 0).sort(byDepth).map(lot);
  const front = cells.filter((c) => c.district === 1).sort(byDepth).map(lot);

  const D = X1 - X0 + 2;
  const [dx, dy] = [EX[0] * k * D, EX[1] * k * D];

  const car = (lane, dir, color, dur, delay, label) => {
    const L = 0.95;
    const Wd = 0.44;
    const x = dir > 0 ? X0 - 1.2 : X1 + 0.2;
    const z0 = lane - Wd / 2;
    const z1 = lane + Wd / 2;
    const y0 = LIFT + 0.05;
    const y1 = LIFT + 0.24;
    const cx0 = x + (dir > 0 ? 0.22 : 0.3);
    const lights = dir > 0 ? "#ef4444" : C.night ? "#fef9c3" : "#fde68a";
    let g = `<ellipse cx="${f(S(x + L / 2, LIFT, lane)[0])}" cy="${f(S(x + L / 2, LIFT, lane)[1])}" rx="${f(k * 0.55)}" ry="${f(k * 0.22)}" fill="#000" opacity=".3"/>`;
    if (dir < 0 && C.night) g += poly(C.lamp, [[x, LIFT + 0.01, z0 + 0.06], [x - 1.6, LIFT + 0.01, z0 - 0.25], [x - 1.6, LIFT + 0.01, z1 + 0.25], [x, LIFT + 0.01, z1 - 0.06]], ` opacity=".16"`);
    g += box3(x, y0, z0, x + L, y1, z1, color, shade(color, 0.78), shade(color, 0.58));
    g += box3(cx0, y1, z0 + 0.05, cx0 + 0.42, y1 + 0.16, z1 - 0.05, shade(color, 1.08), C.night ? "#0f172a" : "#334155", C.night ? "#1e293b" : "#475569");
    g += poly(lights, [[x, y0 + 0.07, z0 + 0.04], [x, y0 + 0.07, z0 + 0.12], [x, y0 + 0.13, z0 + 0.12], [x, y0 + 0.13, z0 + 0.04]]);
    g += poly(lights, [[x, y0 + 0.07, z1 - 0.12], [x, y0 + 0.07, z1 - 0.04], [x, y0 + 0.13, z1 - 0.04], [x, y0 + 0.13, z1 - 0.12]]);
    if (label) {
      const [tx, ty] = S(x + L / 2, LIFT + 1.1, lane);
      const w = label.length * 5.8 + 12;
      g += `<rect x="${f(tx - w / 2)}" y="${f(ty - 10)}" width="${f(w)}" height="14" rx="7" fill="${C.tag}" stroke="${C.accent}" stroke-width="1"/><text x="${f(tx)}" y="${f(ty + 0.5)}" text-anchor="middle" class="tag">${esc(label)}</text>`;
    }
    return `<g class="${dir > 0 ? "fwd" : "back"}" style="animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(2)}s">${g}</g>`;
  };

  const traffic = (z0, count, guests = []) => {
    const out = [];
    [[z0 + AVENUE * 0.28, 1], [z0 + AVENUE * 0.72, -1]].forEach(([lane, dir], side) => {
      const mine = guests.filter((_, i) => i % 2 === side);
      const total = count + mine.length;
      const dur = 24 + rand() * 8 + total;
      for (let j = 0; j < total; j++) {
        const guest = mine[j];
        out.push(car(lane, dir, guest ? CARS[hash(guest) % CARS.length] : pick(CARS), dur, -(j / total) * dur - rand(), guest && `@${guest}`));
      }
    });
    return out;
  };

  const person = (z, dir, dur, delay) => {
    const x = dir > 0 ? X0 - 1 : X1 + 1;
    const [sx, sy] = S(x, LIFT, z);
    const u = k * 0.1;
    return `<g class="${dir > 0 ? "fwd" : "back"}" style="animation-duration:${dur.toFixed(1)}s;animation-delay:${delay.toFixed(2)}s"><g class="step" style="animation-delay:${(rand() * 0.5).toFixed(2)}s"><rect x="${f(sx - u * 0.55)}" y="${f(sy - u * 2.2)}" width="${f(u * 1.1)}" height="${f(u * 2.2)}" fill="${pick(PANTS)}"/><rect x="${f(sx - u * 0.75)}" y="${f(sy - u * 4.2)}" width="${f(u * 1.5)}" height="${f(u * 2.2)}" rx="${f(u * 0.3)}" fill="${pick(SHIRTS)}"/><circle cx="${f(sx)}" cy="${f(sy - u * 5)}" r="${f(u * 0.75)}" fill="${pick(SKIN)}"/></g></g>`;
  };

  const walkers = (z0, z1, count) =>
    Array.from({ length: count }, () => {
      const dur = 70 + rand() * 50;
      return person(z0 + (z1 - z0) * (0.3 + rand() * 0.4), rand() < 0.5 ? 1 : -1, dur, -rand() * dur);
    });

  const boulevard = (z) => {
    const out = [];
    for (let x = 0.8; x < XE; x += 2.4) out.push(tree(x, z, 0.26, rand() * 3));
    return out.join("");
  };

  const lamps = (z) => {
    const out = [];
    for (let x = 1.2; x < XE; x += 3.6) out.push(lamp(x, z));
    return out.join("");
  };
  const lamp = (x, z) => {
    const [bx, by] = S(x, LIFT, z);
    const top = by - k * 1.1;
    return `<line x1="${f(bx)}" y1="${f(by)}" x2="${f(bx)}" y2="${f(top)}" stroke="${C.night ? "#52525b" : "#71717a"}" stroke-width="${f(k * 0.07)}"/>${C.night ? `<circle cx="${f(bx)}" cy="${f(top)}" r="${f(k * 0.9)}" fill="url(#glow)"/>` : ""}<circle cx="${f(bx)}" cy="${f(top)}" r="${f(k * 0.11)}" fill="${C.lamp}"/>`;
  };
  if (C.night) defs.push(`<radialGradient id="glow"><stop offset="0" stop-color="${C.lamp}" stop-opacity=".55"/><stop offset="1" stop-color="${C.lamp}" stop-opacity="0"/></radialGradient>`);

  const hy = box.y + 18;
  const heli = `<g class="heli"><g transform="translate(0 ${hy})">${C.night ? `<polygon points="-2,4 -26,120 30,120" fill="url(#beam)"/>` : ""}<rect x="-22" y="-2" width="16" height="3" rx="1.5" fill="${C.heli}"/><ellipse cx="0" cy="0" rx="10" ry="5.5" fill="${C.heli}"/><ellipse cx="4" cy="-1" rx="4" ry="2.6" fill="${C.night ? "#38bdf8" : "#7dd3fc"}" opacity=".8"/><rect x="-2" y="-8" width="2" height="3" fill="${C.heli}"/><rect class="rotor" x="-16" y="-9" width="32" height="1.6" rx=".8" fill="${C.heli}"/><rect x="-6" y="5" width="14" height="1.2" fill="${C.heli}"/><circle class="beacon" cx="-22" cy="-1" r="1.4" fill="#ef4444"/></g></g>`;
  if (C.night) defs.push(`<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8fafc" stop-opacity=".35"/><stop offset="1" stop-color="#f8fafc" stop-opacity="0"/></linearGradient>`);

  const style = `
.b { transform-box: fill-box; transform-origin: 50% 100%; animation: rise .9s cubic-bezier(.2,.8,.2,1) both; }
.t { transform-box: fill-box; transform-origin: 50% 100%; animation: sway 4s ease-in-out infinite alternate; }
.fwd, .back { animation-timing-function: linear; animation-iteration-count: infinite; }
.fwd { animation-name: fwd; }
.back { animation-name: back; }
.step { animation: step .35s ease-in-out infinite alternate; }
.beacon { animation: blink 1.6s steps(1) infinite; }
.rotor { transform-box: fill-box; transform-origin: center; animation: rotor .12s linear infinite alternate; }
.heli { animation: fly 34s linear infinite; }
@keyframes rise { from { transform: scaleY(.02); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes sway { from { transform: rotate(-1.5deg); } to { transform: rotate(1.5deg); } }
@keyframes fwd { 0% { transform: translate(0, 0); opacity: 0; } 3%, 97% { opacity: 1; } 100% { transform: translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px); opacity: 0; } }
@keyframes back { 0% { transform: translate(0, 0); opacity: 0; } 3%, 97% { opacity: 1; } 100% { transform: translate(${(-dx).toFixed(1)}px, ${(-dy).toFixed(1)}px); opacity: 0; } }
@keyframes step { to { transform: translateY(-.8px); } }
@keyframes blink { 50% { opacity: .15; } }
@keyframes rotor { to { transform: scaleX(.2); } }
.pulse { animation: pulse 2.4s ease-in-out infinite; }
.beam { animation: pulse 3s ease-in-out infinite; }
.fade-in { opacity: 0; animation: show 1s 1.4s ease-out forwards; }
.bb-sub { font: 500 0.4px ${MONO}; fill: ${C.boardSub}; }
.bb-msg { font: 600 0.66px ${SANS}; fill: ${C.boardText}; }
.tag { font: 600 9px ${MONO}; fill: ${C.tagText}; }
@keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
@keyframes show { to { opacity: 1; } }
@keyframes fly { from { transform: translate(${box.x - 60}px, ${box.h * 0.35}px); } to { transform: translate(${box.x + box.w + 60}px, 0px); } }`;

  const body = [
    ground.join(""),
    live.commit ? billboard(live.commit) : "",
    back.join("\n"),
    boulevard(7 + WALK * 0.5),
    walkers(7, ZM, 6).join(""),
    traffic(ZM, 4).join("\n"),
    walkers(ZM2, Z1, 6).join(""),
    lamps(ZM2 + WALK * 0.5),
    front.join("\n"),
    boulevard(ZB + WALK * 0.5),
    walkers(ZB, ZR, 7).join(""),
    traffic(ZR, 4, visitors).join("\n"),
    walkers(ZW, ZE, 7).join(""),
    lamps(ZW + WALK * 0.5),
    heli,
  ].join("\n");

  return { defs: defs.join("\n"), style, body };
}
