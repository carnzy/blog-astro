/**
 * 生成极客风格 SVG 壁纸脚本
 * 生成 6 张桌面壁纸 + 6 张移动壁纸
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR_DESKTOP = path.join(__dirname, '..', 'src', 'assets', 'images', 'DesktopWallpaper');
const OUTPUT_DIR_MOBILE = path.join(__dirname, '..', 'src', 'assets', 'images', 'MobileWallpaper');

// 确保目录存在
[OUTPUT_DIR_DESKTOP, OUTPUT_DIR_MOBILE].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * 生成极客风 SVG 壁纸
 * @param {number} width
 * @param {number} height
 * @param {string} primaryColor - 主色调
 * @param {string} accentColor - 强调色
 * @param {string} pattern - 图案类型: 'code' | 'circuit' | 'matrix' | 'network' | 'terminal' | 'hex'
 * @returns {string} SVG content
 */
function generateGeekSVG(width, height, primaryColor, accentColor, pattern) {
  const patterns = {
    code: `<defs>
      <pattern id="code" patternUnits="userSpaceOnUse" width="200" height="300">
        ${generateCodeLines(accentColor)}
      </pattern>
    </defs>
    <rect width="${width}" height="${height}" fill="${primaryColor}"/>
    <rect width="${width}" height="${height}" fill="url(#code)" opacity="0.15"/>
    <rect width="${width}" height="${height}" fill="url(#vignette)" opacity="0.4"/>`,

    circuit: `<defs>
      ${generateCircuitPattern(width, height, accentColor)}
      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.3"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${primaryColor}"/>
    <rect width="${width}" height="${height}" fill="url(#circuit)" opacity="0.12"/>
    <rect width="${width}" height="${height}" fill="url(#vignette)"/>`,

    matrix: `<defs>
      <pattern id="matrix" patternUnits="userSpaceOnUse" width="100" height="120">
        ${generateMatrixChars(accentColor)}
      </pattern>
      <radialGradient id="vignette" cx="50%" cy="30%" r="80%">
        <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.08"/>
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.5"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${primaryColor}"/>
    <rect width="${width}" height="${height}" fill="url(#matrix)" opacity="0.2"/>
    <rect width="${width}" height="${height}" fill="url(#vignette)"/>`,

    network: `<defs>
      ${generateNetworkPattern(width, height, accentColor)}
      <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
        <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.03"/>
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.3"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${primaryColor}"/>
    <rect width="${width}" height="${height}" fill="url(#network)" opacity="0.15"/>
    <rect width="${width}" height="${height}" fill="url(#vignette)"/>`,

    terminal: `<defs>
      <linearGradient id="termGlow" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primaryColor}" stop-opacity="0"/>
        <stop offset="50%" stop-color="${accentColor}" stop-opacity="0.1"/>
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="vignette" cx="50%" cy="50%" r="70%">
        <stop offset="0%" stop-color="transparent"/>
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.4"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${primaryColor}"/>
    <rect width="${width}" height="${height}" fill="url(#termGlow)"/>
    ${generateTerminalLines(width, height, accentColor)}
    <rect width="${width}" height="${height}" fill="url(#vignette)"/>`,

    hex: `<defs>
      ${generateHexPattern(accentColor)}
      <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
        <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.05"/>
        <stop offset="100%" stop-color="${primaryColor}" stop-opacity="0.3"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="${primaryColor}"/>
    <rect width="${width}" height="${height}" fill="url(#hex)" opacity="0.12"/>
    <rect width="${width}" height="${height}" fill="url(#vignette)"/>`
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${patterns[pattern]}
</svg>`;
}

function generateCodeLines(color) {
  const chars = 'const let var function return if else for while class import export new try catch throw null undefined true false map filter reduce push pop log error warn';
  const lines = [];
  for (let i = 0; i < 20; i++) {
    const x = 5 + Math.random() * 180;
    const y = 5 + i * 14;
    const len = 30 + Math.random() * 120;
    lines.push(`<text x="${x}" y="${y}" fill="${color}" font-family="monospace" font-size="8" opacity="0.3">${chars.substring(0, Math.floor(len / 4)).replace(/\s/g, ' ')}</text>`);
  }
  return lines.join('\n        ');
}

function generateMatrixChars(color) {
  const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
  const lines = [];
  for (let col = 0; col < 6; col++) {
    for (let row = 0; row < 8; row++) {
      const ch = chars[Math.floor(Math.random() * chars.length)];
      lines.push(`<text x="${5 + col * 18}" y="${10 + row * 15}" fill="${color}" font-family="monospace" font-size="10" opacity="${0.1 + Math.random() * 0.3}">${ch}</text>`);
    }
  }
  return lines.join('\n        ');
}

function generateCircuitPattern(w, h, color) {
  return `<pattern id="circuit" patternUnits="userSpaceOnUse" width="${Math.floor(w/3)}" height="${Math.floor(h/2)}">
      <g fill="none" stroke="${color}" stroke-width="0.5" opacity="0.4">
        ${generateCircuitLines(Math.floor(w/3), Math.floor(h/2))}
      </g>
    </pattern>`;
}

function generateCircuitLines(w, h) {
  const lines = [];
  const nodes = [
    {x: 10, y: 10}, {x: w-10, y: 10}, {x: w/2, y: 20},
    {x: 15, y: h-10}, {x: w-15, y: h-10}, {x: w/3, y: h/2},
    {x: w*2/3, y: h/2}, {x: w/2, y: h-20}
  ];
  for (let i = 0; i < nodes.length; i++) {
    if (i + 1 < nodes.length) {
      lines.push(`<line x1="${nodes[i].x}" y1="${nodes[i].y}" x2="${nodes[i+1].x}" y2="${nodes[i+1].y}"/>`);
    }
    // 添加节点圆点
    lines.push(`<circle cx="${nodes[i].x}" cy="${nodes[i].y}" r="2" fill="${color}" opacity="0.6"/>`);
  }
  // 添加一些小节点
  for (let i = 0; i < 8; i++) {
    const x = 10 + Math.random() * (w - 20);
    const y = 10 + Math.random() * (h - 20);
    lines.push(`<circle cx="${x}" cy="${y}" r="1" fill="${color}" opacity="0.3"/>`);
  }
  return lines.join('\n          ');
}

function generateNetworkPattern(w, h, color) {
  const nodes = [];
  for (let i = 0; i < 15; i++) {
    nodes.push({x: 5 + Math.random() * (w - 10), y: 5 + Math.random() * (h - 10)});
  }
  let result = `<pattern id="network" patternUnits="userSpaceOnUse" width="${w}" height="${h}">
      <g fill="none" stroke="${color}" stroke-width="0.3" opacity="0.5">`;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = Math.sqrt((nodes[i].x - nodes[j].x) ** 2 + (nodes[i].y - nodes[j].y) ** 2);
      if (dist < 70) {
        result += `\n        <line x1="${nodes[i].x}" y1="${nodes[i].y}" x2="${nodes[j].x}" y2="${nodes[j].y}"/>`;
      }
    }
  }
  result += '\n      </g>\n      <g fill="' + color + '">';
  for (const node of nodes) {
    result += `\n        <circle cx="${node.x}" cy="${node.y}" r="1.5" opacity="0.6"/>`;
  }
  result += '\n      </g>\n    </pattern>';
  return result;
}

function generateTerminalLines(w, h, color) {
  const commands = [
    '$ npm install geek-mode', '$ git push origin main', '$ cargo build --release',
    '$ python3 train_ai.py', '> Initializing neural network...', '> Loading model weights...',
    '$ docker compose up -d', '> Connecting to database...', '> Deploying to production...',
    '$ curl -X POST /api/deploy', '$ kubectl get pods', '> All systems operational.',
    '$ ssh -i key.pem root@server', '$ systemctl status nginx', '> CPU: 23% | RAM: 1.8G/8G',
    '$ deno run --allow-net server.ts', '> WebSocket connection established.',
    '$ make && make install', '$ tail -f /var/log/syslog',
    '> [INFO] Build successful. 🚀', '$ sudo systemctl restart', '> Ready to accept connections.'
  ];
  let result = '';
  const startY = 30;
  for (let i = 0; i < 22; i++) {
    const y = startY + i * 18;
    const cmd = commands[i % commands.length];
    if (i < 20) {
      result += `<text x="15" y="${y}" fill="${color}" font-family="monospace" font-size="9" opacity="0.2">${cmd}</text>\n    `;
    }
  }
  return result;
}

function generateHexPattern(color) {
  const size = 60;
  const h = size * Math.sqrt(3);
  return `<pattern id="hex" patternUnits="userSpaceOnUse" width="${size * 3}" height="${h * 2}">
      <g fill="none" stroke="${color}" stroke-width="0.8" opacity="0.3">
        <polygon points="${size/2},0 ${size},${h/4} ${size},${h*3/4} ${size/2},${h} 0,${h*3/4} 0,${h/4}"/>
        <polygon points="${size*1.5},${h/4} ${size*2},0 ${size*2.5},${h/4} ${size*2.5},${h*3/4} ${size*2},${h} ${size*1.5},${h*3/4}"/>
        <polygon points="${size},${h} ${size*1.5},${h*5/4} ${size*2},${h} ${size*2},${h*3/4} ${size*1.5},${h/2} ${size},${h*3/4}"/>
      </g>
    </pattern>`;
}

// 配置：6种不同配色和风格的桌面壁纸
const desktopConfigs = [
  { color: '#0a0e27', accent: '#00d4ff', pattern: 'code', name: 'd1' },
  { color: '#0d1117', accent: '#58a6ff', pattern: 'circuit', name: 'd2' },
  { color: '#0a0a0a', accent: '#00ff41', pattern: 'matrix', name: 'd3' },
  { color: '#0f172a', accent: '#818cf8', pattern: 'network', name: 'd4' },
  { color: '#1a0a2e', accent: '#ff6b9d', pattern: 'terminal', name: 'd5' },
  { color: '#0a0f1e', accent: '#f0c040', pattern: 'hex', name: 'd6' },
];

// 移动端壁纸配置（更紧凑的比例）
const mobileConfigs = [
  { color: '#0a0e27', accent: '#00d4ff', pattern: 'code', name: 'm1' },
  { color: '#0d1117', accent: '#58a6ff', pattern: 'network', name: 'm2' },
  { color: '#0a0a0a', accent: '#00ff41', pattern: 'matrix', name: 'm3' },
  { color: '#0f172a', accent: '#818cf8', pattern: 'circuit', name: 'm4' },
  { color: '#1a0a2e', accent: '#ff6b9d', pattern: 'terminal', name: 'm5' },
  { color: '#0a0f1e', accent: '#f0c040', pattern: 'hex', name: 'm6' },
];

// 生成桌面壁纸
console.log('⚙️ 生成极客风桌面壁纸...');
for (const cfg of desktopConfigs) {
  const svg = generateGeekSVG(1920, 1080, cfg.color, cfg.accent, cfg.pattern);
  const filePath = path.join(OUTPUT_DIR_DESKTOP, `${cfg.name}.svg`);
  fs.writeFileSync(filePath, svg);
  console.log(`  ✅ ${cfg.name}.svg - ${cfg.pattern} (${cfg.color})`);
}

// 生成移动壁纸
console.log('⚙️ 生成极客风移动端壁纸...');
for (const cfg of mobileConfigs) {
  const svg = generateGeekSVG(390, 844, cfg.color, cfg.accent, cfg.pattern);
  const filePath = path.join(OUTPUT_DIR_MOBILE, `${cfg.name}.svg`);
  fs.writeFileSync(filePath, svg);
  console.log(`  ✅ ${cfg.name}.svg - ${cfg.pattern} (${cfg.color})`);
}

console.log('\n🎉 极客风壁纸生成完成！共 12 张');
console.log('📁 桌面壁纸: src/assets/images/DesktopWallpaper/');
console.log('📁 移动壁纸: src/assets/images/MobileWallpaper/');
console.log('\n⚠️ 注意：需要将 backgroundWallpaper.ts 中的图片扩展名从 .avif 改为 .svg');
