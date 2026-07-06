/**
 * Generate Geek-Style Wallpapers
 * Creates 6 desktop (1920x1080) and 6 mobile (390x844) geek-themed wallpapers in .webp
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const DESKTOP_DIR = path.join(rootDir, 'src', 'assets', 'images', 'DesktopWallpaper');
const MOBILE_DIR = path.join(rootDir, 'src', 'assets', 'images', 'MobileWallpaper');
fs.mkdirSync(DESKTOP_DIR, { recursive: true });
fs.mkdirSync(MOBILE_DIR, { recursive: true });

/** Escape text for safe XML/SVG use */
function esc(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ============================================================
// STYLE 1: Code Rain — Dark blue bg, cyan code lines
// ============================================================
function svgCode(w, h) {
  const code = [
    'function fibonacci(n) {',
    '  if (n <= 1) return n;',
    '  return fibonacci(n-1) + fibonacci(n-2);',
    '}',
    'console.log(fibonacci(10));',
    '',
    'class EventEmitter {',
    '  constructor() {',
    '    this.events = new Map();',
    '  }',
    '  on(event, listener) {',
    '    if (!this.events.has(event))',
    '      this.events.set(event, []);',
    '    this.events.get(event).push(listener);',
    '  }',
    '  emit(event, ...args) {',
    '    const listeners = this.events.get(event);',
    '    if (listeners)',
    '      listeners.forEach(fn => fn(...args));',
    '  }',
    '}',
    '',
    'const sleep = (ms) =>',
    '  new Promise(resolve =>',
    '    setTimeout(resolve, ms));',
    '',
    'async function* streamGen() {',
    '  let i = 0;',
    '  while (true) {',
    '    yield i++;',
    '    await sleep(100);',
    '  }',
    '}',
  ];

  const keywordColor = '#c678dd';
  const stringColor = '#98c379';
  const numberColor = '#d19a66';
  const commentColor = '#5c6370';
  const funcColor = '#61afef';
  const textColor = '#abb2bf';
  const lineNumColor = '#2d3748';
  const LINE_H = 24;
  const START_Y = 40;
  const LINE_NUM_W = 45;

  const els = [`<rect width="${w}" height="${h}" fill="#0a0e27"/>`];
  // Subtle grid
  for (let x = 0; x < w; x += 40) els.push(`<line x1="${x}" y1="0" x2="${x}" y2="${h}" stroke="#151b3d" stroke-width="0.5"/>`);
  for (let y = 0; y < h; y += 40) els.push(`<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#151b3d" stroke-width="0.5"/>`);

  code.forEach((line, idx) => {
    const y = START_Y + idx * LINE_H;
    // Line number
    els.push(`<text x="35" y="${y}" fill="${lineNumColor}" font-family="monospace" font-size="12" text-anchor="end">${idx + 1}</text>`);
    // Lines with syntax-like coloring (pseudo highlighting)
    let text = '';
    let color = textColor;
    if (/^(class|function|async|const|let|var|return|if|while|yield|await|new|this\.)/.test(line.trim())) {
      const parts = line.split(/(\b(const|let|var|function|async|await|yield|return|class|new|if|while|true|false|null|undefined|of)\b|"[^"]*"|'[^']*`[^`]*`)/g);
      let offset = LINE_NUM_W + 10;
      for (const part of parts) {
        if (!part || part === undefined) continue;
        if (/^(const|let|var|function|async|await|yield|return|class|new|if|while|of)\b$/.test(part)) color = keywordColor;
        else if (/^(true|false|null|undefined)\b$/.test(part)) color = numberColor;
        else if (/^["'`]/.test(part)) color = stringColor;
        else if (/^\/\//.test(part)) color = commentColor;
        else color = textColor;
        els.push(`<text x="${offset}" y="${y}" fill="${color}" font-family="monospace" font-size="13">${esc(part)}</text>`);
        offset += part.length * 7.8;
      }
    } else {
      els.push(`<text x="${LINE_NUM_W + 10}" y="${y}" fill="${textColor}" font-family="monospace" font-size="13">${esc(line)}</text>`);
    }
  });

  // Floating code debris
  const debris = '(){}[]<>+-*/=&|!?:;.,~@#$%^';
  for (let i = 0; i < 20; i++) {
    const fx = Math.random() * (w - 100) + 50;
    const fy = Math.random() * (h - 100) + 50;
    const ch = debris[Math.floor(Math.random() * debris.length)];
    const op = (0.03 + Math.random() * 0.05).toFixed(3);
    const fs = 8 + Math.random() * 14;
    els.push(`<text x="${fx.toFixed(0)}" y="${fy.toFixed(0)}" fill="#00d4ff" opacity="${op}" font-family="monospace" font-size="${fs.toFixed(0)}">${esc(ch)}</text>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${els.join('\n')}</svg>`;
}

// ============================================================
// STYLE 2: Circuit Board — Dark bg, blue circuit pattern
// ============================================================
function svgCircuit(w, h) {
  const els = [`<rect width="${w}" height="${h}" fill="#0d1117"/>`];
  // Glow
  els.push(`<ellipse cx="${w/2}" cy="${h/2}" rx="${w*0.6}" ry="${h*0.6}" fill="#161b22" opacity="0.5"/>`);

  // Generate circuit traces
  const points = [];
  const spacing = 55;
  const cols = Math.ceil(w / spacing);
  const rows = Math.ceil(h / spacing);
  for (let r = 0; r < rows + 2; r++) {
    for (let c = 0; c < cols + 2; c++) {
      if (Math.random() > 0.55) continue;
      const x = c * spacing + (Math.random() - 0.5) * spacing * 0.3;
      const y = r * spacing + (Math.random() - 0.5) * spacing * 0.3;
      points.push({ x: x.toFixed(0), y: y.toFixed(0) });
    }
  }

  // Traces
  for (const p of points) {
    // Horizontal
    if (Math.random() > 0.4) {
      const len = spacing * (1 + Math.floor(Math.random() * 3));
      els.push(`<rect x="${p.x}" y="${Number(p.y)-1.5}" width="${len}" height="3" fill="#58a6ff" opacity="0.4" rx="1"/>`);
    }
    // Vertical
    if (Math.random() > 0.4) {
      const len = spacing * (1 + Math.floor(Math.random() * 3));
      els.push(`<rect x="${Number(p.x)-1.5}" y="${p.y}" width="3" height="${len}" fill="#58a6ff" opacity="0.4" rx="1"/>`);
    }
    // Junction dot
    els.push(`<circle cx="${p.x}" cy="${p.y}" r="3" fill="#00d4ff" opacity="0.6"/>`);
  }

  // Angled traces
  for (let i = 0; i < 25; i++) {
    const x1 = Math.random() * w;
    const y1 = Math.random() * h;
    const x2 = x1 + (Math.random() - 0.5) * 350;
    const y2 = y1 + (Math.random() - 0.5) * 350;
    els.push(`<line x1="${x1.toFixed(0)}" y1="${y1.toFixed(0)}" x2="${x2.toFixed(0)}" y2="${y2.toFixed(0)}" stroke="#58a6ff" stroke-width="1.5" opacity="0.15"/>`);
  }

  // IC chips
  for (let i = 0; i < 10; i++) {
    const cx = 80 + Math.random() * (w - 160);
    const cy = 80 + Math.random() * (h - 160);
    const size = 25 + Math.random() * 35;
    els.push(`<rect x="${cx.toFixed(0)}" y="${cy.toFixed(0)}" width="${size.toFixed(0)}" height="${size.toFixed(0)}" fill="none" stroke="#58a6ff" stroke-width="2" rx="3" opacity="0.35"/>`);
    // Pins
    for (let p = 0; p < 4; p++) {
      const px = cx + (p / 4) * size + size/8;
      els.push(`<line x1="${px.toFixed(0)}" y1="${(cy-7).toFixed(0)}" x2="${px.toFixed(0)}" y2="${cy.toFixed(0)}" stroke="#58a6ff" stroke-width="2" opacity="0.3"/>`);
      els.push(`<line x1="${px.toFixed(0)}" y1="${(cy+size).toFixed(0)}" x2="${px.toFixed(0)}" y2="${(cy+size+7).toFixed(0)}" stroke="#58a6ff" stroke-width="2" opacity="0.3"/>`);
    }
    // notch
    els.push(`<circle cx="${(cx+size/2).toFixed(0)}" cy="${(cy-3).toFixed(0)}" r="2" fill="#58a6ff" opacity="0.3"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${els.join('\n')}</svg>`;
}

// ============================================================
// STYLE 3: Matrix Rain — Dark bg, green falling chars
// ============================================================
function svgMatrix(w, h) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzãµã¶ã·ã¸ã¹ãºã»ã¼ã½ã¾ã¿ã€ãپã‚ãƒã„ã…ã†ã‡ãˆã‰ãŠã‹ãŒããŽããã‘ã’ã“ã”ã•ã–ã—ã˜ã™ãšã›ãœããžãŸã c0ã¡c2ã£c4ã¥c6ã§c8ã©c1ã«c3ã­c5ã¯c0ã±c2ã³c4ãµc6ã·c8ã¹c0ã»c2ã½c4ã¿c6c1c8c3c0c5c2c7c4c9c6cbc8cdcacfccd1ced0d5d2d7d4d9d6dbd8dddadafcdcfed8';
  const els = [ `<rect width="${w}" height="${h}" fill="#0a0a0a"/>` ];

  // Brightness bursts
  for (let i = 0; i < 3; i++) {
    const bx = Math.random() * w;
    const by = Math.random() * h;
    els.push(`<radialGradient id="bg${i}" cx="${(bx/w*100).toFixed(1)}%" cy="${(by/h*100).toFixed(1)}%" r="30%"><stop offset="0%" stop-color="#0d1f0d"/><stop offset="100%" stop-color="#0a0a0a"/></radialGradient>`);
  }
  els.push(`<rect width="${w}" height="${h}" fill="url(#bg0)" opacity="0.3"/>`);

  const cols = Math.floor(w / 18);
  for (let col = 0; col < cols; col++) {
    const x = col * 18 + 4;
    const startY = Math.random() * h;
    const len = 5 + Math.floor(Math.random() * 18);
    for (let j = 0; j < len; j++) {
      const y = startY + j * 20;
      if (y > h + 30 || y < -30) continue;
      const ch = chars[Math.floor(Math.random() * chars.length)];
      const opacity = j === 0 ? '0.95' : Math.max(0.04, 0.5 - (j / len) * 0.65).toFixed(2);
      const fill = j === 0 ? '#ffffff' : '#00ff41';
      const fs = j === 0 ? 16 : 12 + Math.random() * 4;
      els.push(`<text x="${x.toFixed(0)}" y="${y.toFixed(0)}" fill="${fill}" opacity="${opacity}" font-family="monospace" font-size="${fs.toFixed(0)}">${esc(ch)}</text>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${els.join('\n')}</svg>`;
}

// ============================================================
// STYLE 4: Network Nodes — Dark navy, purple/cyan nodes
// ============================================================
function svgNetwork(w, h) {
  const els = [
    `<rect width="${w}" height="${h}" fill="#0f172a"/>`,
    `<ellipse cx="${w/2}" cy="${h/2}" rx="${w*0.55}" ry="${h*0.55}" fill="#1e293b" opacity="0.4"/>`,
  ];

  // Nodes
  const nodes = [];
  const numNodes = 50 + Math.floor(Math.random() * 30);
  for (let i = 0; i < numNodes; i++) {
    nodes.push({
      x: 30 + Math.random() * (w - 60),
      y: 30 + Math.random() * (h - 60),
      r: 2 + Math.random() * 7,
      c: Math.random() < 0.33 ? '#818cf8' : Math.random() < 0.5 ? '#58a6ff' : '#00d4ff',
    });
  }

  // Connections (proximity-based)
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const threshold = 100 + Math.random() * 80;
      if (dist < threshold) {
        const op = Math.max(0.04, 0.4 - dist / (threshold * 1.5)).toFixed(3);
        const sw = (0.3 + Math.random() * 1.2).toFixed(1);
        els.push(`<line x1="${nodes[i].x.toFixed(0)}" y1="${nodes[i].y.toFixed(0)}" x2="${nodes[j].x.toFixed(0)}" y2="${nodes[j].y.toFixed(0)}" stroke="#818cf8" stroke-width="${sw}" opacity="${op}"/>`);
      }
    }
  }

  // Render nodes
  for (const n of nodes) {
    els.push(`<circle cx="${n.x.toFixed(0)}" cy="${n.y.toFixed(0)}" r="${n.r.toFixed(1)}" fill="${n.c}" opacity="${(0.3 + Math.random() * 0.5).toFixed(2)}"/>`);
  }

  // Pulse glows
  for (let i = 0; i < 6; i++) {
    const n = nodes[Math.floor(Math.random() * nodes.length)];
    const gr = (n.r * 3.5).toFixed(0);
    els.push(`<circle cx="${n.x.toFixed(0)}" cy="${n.y.toFixed(0)}" r="${gr}" fill="none" stroke="#00d4ff" stroke-width="1" opacity="0.12"/>`);
    els.push(`<circle cx="${n.x.toFixed(0)}" cy="${n.y.toFixed(0)}" r="${(gr*0.6).toFixed(0)}" fill="none" stroke="#00d4ff" stroke-width="0.5" opacity="0.08"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${els.join('\n')}</svg>`;
}

// ============================================================
// STYLE 5: Terminal — Dark purple, pink terminal output
// ============================================================
function svgTerminal(w, h) {
  const els = [
    `<rect width="${w}" height="${h}" fill="#1a0a2e"/>`,
    // Window chrome
    `<rect x="0" y="0" width="${w}" height="28" fill="#2d1a4e"/>`,
    `<text x="15" y="19" fill="#a78bfa" font-family="monospace" font-size="12">Terminal — bash — 80x24</text>`,
    `<circle cx="${w-30}" cy="14" r="5" fill="#ff5f56"/>`,
    `<circle cx="${w-50}" cy="14" r="5" fill="#ffbd2e"/>`,
    `<circle cx="${w-70}" cy="14" r="5" fill="#27c93f"/>`,
  ];

  const promptChar = '&#x276f;';
  const commands = [
    { cmd: 'cat ~/.zshrc', output: ['export ZSH=$HOME/.oh-my-zsh', 'ZSH_THEME=powerlevel10k', 'plugins=(git docker node)'] },
    { cmd: 'npm run build', output: ['$ esbuild src/index.ts --bundle', '[WARNING] Import x not found', '  src/index.ts:10:5', 'Build finished in 1.2s'] },
    { cmd: 'git log --oneline -3', output: ['a3f2c1d feat: add websocket support', 'b4e5f6a fix: handle null in parser', 'c7d8e9f refactor: clean up api layer'] },
    { cmd: 'kubectl get pods', output: ['NAME                  READY  STATUS    RESTARTS', 'api-7d8f9c5        1/1    Running   0', 'web-6f5e4d3        0/1    CrashLoop 5', 'redis-3a2b1c0      1/1    Running   0'] },
    { cmd: 'curl -s https://api.example.com/stats | jq', output: ['{', '  uptime: 14d 6h 23m,', '  requests: 1042837,', '  errors: 234,', '  p99_latency: 245ms', '}'] },
    { cmd: 'ssh deploy@prod-01', output: ['Welcome to Ubuntu 24.04 LTS', 'Last login: Mon Jul 6 10:42:23 2026', '', 'deploy@prod-01:~$ '] },
  ];

  const MARGIN = 20;
  let curY = 45;
  const LINE_H = 19;

  for (const entry of commands) {
    if (curY > h - 40) break;

    // Prompt line
    els.push(`<text x="${MARGIN}" y="${curY}" fill="#ff6b9d" font-family="monospace" font-size="13">${promptChar}</text>`);
    els.push(`<text x="${MARGIN+18}" y="${curY}" fill="#e2e8f0" font-family="monospace" font-size="13">${esc(entry.cmd)}</text>`);
    curY += LINE_H + 2;

    // Output
    for (const out of entry.output) {
      if (curY > h - 25) break;
      let fill = '#a0aec0';
      if (out.includes('ERROR') || out.includes('WARNING') || out.includes('CrashLoop')) fill = '#f56565';
      else if (out.includes('Running') || out.includes('Build finished')) fill = '#48bb78';
      else if (/^[a-f0-9]{7,9}\s/.test(out)) fill = '#63b3ed';
      else if (out === '{' || out === '}' || out.startsWith('  ')) fill = '#d53f8c';
      els.push(`<text x="${MARGIN+15}" y="${curY}" fill="${fill}" font-family="monospace" font-size="12">${esc(out)}</text>`);
      curY += LINE_H;
    }
    curY += 6;
  }

  // Blinking cursor at end
  if (curY < h - 30) {
    els.push(`<text x="${MARGIN}" y="${curY}" fill="#ff6b9d" font-family="monospace" font-size="13">${promptChar}</text>`);
    els.push(`<rect x="${MARGIN+18}" y="${curY-11}" width="8" height="15" fill="#ff6b9d" opacity="0.8"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${els.join('\n')}</svg>`;
}

// ============================================================
// STYLE 6: Hex Grid — Dark bg, gold hexagonal pattern
// ============================================================
function svgHex(w, h) {
  const els = [
    `<rect width="${w}" height="${h}" fill="#0a0f1e"/>`,
    `<ellipse cx="${w/2}" cy="${h/2}" rx="${w*0.5}" ry="${h*0.5}" fill="#141a2e" opacity="0.6"/>`,
  ];

  const R = 42;
  const H = R * Math.sqrt(3);
  const W = R * 1.5;

  for (let row = -1; row < Math.ceil(h / (H*0.5)) + 1; row++) {
    for (let col = -1; col < Math.ceil(w / W) + 2; col++) {
      const offsetX = row % 2 === 0 ? 0 : W / 2;
      const cx = col * W + offsetX;
      const cy = row * H * 0.5;
      if (cx < -R || cx > w + R || cy < -R || cy > h + R) continue;

      // Hex path
      const pts = [];
      const hexR = R * (0.85 + Math.random() * 0.15);
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI/3 * i - Math.PI/6;
        pts.push(`${i===0?'M':'L'}${(cx + hexR * Math.cos(angle)).toFixed(1)},${(cy + hexR * Math.sin(angle)).toFixed(1)}`);
      }
      pts.push('Z');
      const op = (0.06 + Math.random() * 0.18).toFixed(2);
      const fill = Math.random() > 0.75 ? '#f0c040' : 'transparent';
      const sw = (0.8 + Math.random() * 1.5).toFixed(1);
      els.push(`<path d="${pts.join(' ')}" fill="${fill}" stroke="#f0c040" stroke-width="${sw}" opacity="${op}"/>`);

      // Inner detail
      if (Math.random() > 0.85) {
        const ipts = [];
        const iR = hexR * 0.3;
        for (let i = 0; i < 6; i++) {
          const angle = Math.PI/3 * i - Math.PI/6;
          ipts.push(`${i===0?'M':'L'}${(cx + iR * Math.cos(angle)).toFixed(1)},${(cy + iR * Math.sin(angle)).toFixed(1)}`);
        }
        ipts.push('Z');
        els.push(`<path d="${ipts.join(' ')}" fill="#f0c040" opacity="0.12"/>`);
      }

      // Data dot
      if (Math.random() > 0.75) {
        els.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(1.5 + Math.random()*3).toFixed(1)}" fill="#f0c040" opacity="0.3"/>`);
      }
    }
  }

  // Central large hex
  const cx = w/2, cy = h/2;
  const bigR = 80;
  const bigPts = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI/3 * i - Math.PI/6;
    bigPts.push(`${i===0?'M':'L'}${(cx + bigR * Math.cos(angle)).toFixed(1)},${(cy + bigR * Math.sin(angle)).toFixed(1)}`);
  }
  bigPts.push('Z');
  els.push(`<path d="${bigPts.join(' ')}" fill="none" stroke="#f0c040" stroke-width="3" opacity="0.5"/>`);
  els.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="8" fill="#f0c040" opacity="0.7"/>`);
  // Inner ring
  const iBigR = 45;
  const iBigPts = [];
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI/3 * i - Math.PI/6;
    iBigPts.push(`${i===0?'M':'L'}${(cx + iBigR * Math.cos(angle)).toFixed(1)},${(cy + iBigR * Math.sin(angle)).toFixed(1)}`);
  }
  iBigPts.push('Z');
  els.push(`<path d="${iBigPts.join(' ')}" fill="none" stroke="#f0c040" stroke-width="1" opacity="0.3"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${els.join('\n')}</svg>`;
}

// ============================================================
// Mobile versions — Same recipes, resized
// ============================================================
const styles = [
  { name: 'd1', mname: 'm1', fn: svgCode, w: 1920, h: 1080, mw: 390, mh: 844 },
  { name: 'd2', mname: 'm2', fn: svgCircuit, w: 1920, h: 1080, mw: 390, mh: 844 },
  { name: 'd3', mname: 'm3', fn: svgMatrix, w: 1920, h: 1080, mw: 390, mh: 844 },
  { name: 'd4', mname: 'm4', fn: svgNetwork, w: 1920, h: 1080, mw: 390, mh: 844 },
  { name: 'd5', mname: 'm5', fn: svgTerminal, w: 1920, h: 1080, mw: 390, mh: 844 },
  { name: 'd6', mname: 'm6', fn: svgHex, w: 1920, h: 1080, mw: 390, mh: 844 },
];

async function generateAll() {
  console.log('🔧 Generating geek-style wallpapers...\n');

  for (const s of styles) {
    // Desktop
    const deskSvg = s.fn(s.w, s.h);
    const deskPath = path.join(DESKTOP_DIR, `${s.name}.webp`);
    await sharp(Buffer.from(deskSvg)).resize(s.w, s.h).webp({ quality: 92, effort: 6 }).toFile(deskPath);
    const dStat = fs.statSync(deskPath);

    // Mobile
    const mobSvg = s.fn(s.mw, s.mh);
    const mobPath = path.join(MOBILE_DIR, `${s.mname}.webp`);
    await sharp(Buffer.from(mobSvg)).resize(s.mw, s.mh).webp({ quality: 92, effort: 6 }).toFile(mobPath);
    const mStat = fs.statSync(mobPath);

    console.log(`  ✅ ${s.name}.webp  ${(dStat.size/1024).toFixed(1)} KB  |  ${s.mname}.webp  ${(mStat.size/1024).toFixed(1)} KB`);
  }

  console.log('\n✅ All 12 wallpapers generated successfully!');
}

generateAll().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
