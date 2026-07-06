/**
 * 博客发布 GUI 服务器
 *
 * 启动本地 HTTP 服务，提供图形化管理界面
 * 用法: node scripts/gui-server.js
 * 然后打开 http://localhost:3456
 */

import http from "http";
import fs from "fs";
import path from "path";
import { spawn, execSync } from "child_process";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const blogDir = path.resolve(__dirname, "..");
const postsDir = path.join(blogDir, "src/content/posts");
const guiDir = path.join(__dirname, "gui");
const PORT = 3456;

// ====== 工具函数 ======

function getDateTime() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function slugify(title) {
  return title
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "untitled";
}

function getCurrentBranch() {
  try {
    return execSync("git branch --show-current", {
      encoding: "utf-8",
      cwd: blogDir,
    }).trim();
  } catch {
    return "master";
  }
}

/**
 * 写入 frontmatter（修复 gray-matter 把 published 日期加引号的问题）
 *
 * gray-matter 的 stringify() 会把所有字符串值加 YAML 引号：
 *   published: '2026-07-04'  ← Astro z.date() 无法识别
 * 但 Astro 的 content schema 要求无引号的日期：
 *   published: 2026-07-04     ← 正确格式
 *
 * 此函数在 stringify 之后用正则去掉 published 字段的引号。
 */
function writeFixedFrontmatter(filePath, parsed, newData) {
  let result = matter.stringify(parsed?.content || "", newData);
  // 去掉 published 字段值的引号，确保 YAML 日期格式
  result = result.replace(
    /^published:\s*['"]?(\d{4}-\d{2}-\d{2})['"]?\s*$/m,
    "published: $1"
  );
  fs.writeFileSync(filePath, result);
}

function parseJSONBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function sendJSON(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

// ====== MIME 类型 ======

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// ====== 静态文件服务 ======

function serveStatic(req, res) {
  let filePath;
  if (req.url === "/" || req.url === "/index.html") {
    filePath = path.join(guiDir, "index.html");
  } else {
    filePath = path.join(guiDir, req.url);
  }

  // 安全检查：防止路径穿越
  if (!filePath.startsWith(guiDir)) {
    sendJSON(res, 403, { error: "Forbidden" });
    return;
  }

  if (!fs.existsSync(filePath)) {
    sendJSON(res, 404, { error: "Not found" });
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "Content-Type": contentType });
  res.end(content);
}

// ====== 列出已有文章 ======

function listPosts() {
  if (!fs.existsSync(postsDir)) return [];
  return fs
    .readdirSync(postsDir)
    .filter((f) => /\.(md|mdx)$/i.test(f))
    .map((f) => {
      const raw = fs.readFileSync(path.join(postsDir, f), "utf-8");
      const parsed = matter(raw);
      return {
        filename: f,
        title: parsed.data.title || f,
        published: parsed.data.published || "",
        draft: parsed.data.draft ?? false,
        tags: parsed.data.tags || [],
      };
    })
    .sort((a, b) => {
      const da = String(a.published || "");
      const db = String(b.published || "");
      return db.localeCompare(da);
    });
}

// ====== 流式发布 ======

function streamPublish(req, res) {
  parseJSONBody(req)
    .then((body) => {
      // SSE 响应头
      res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });

      const emit = (data) => {
        res.write(JSON.stringify(data) + "\n");
      };

      const run = async () => {
        try {
          let mdFile;

          // ====== 步骤1: 确定 md 文件 ======
          if (body.mode === "create") {
            // 创建新文章
            const title = body.title || "未命名";
            const slug = slugify(title);
            const fileName = `${slug}.md`;
            const targetPath = path.join(postsDir, fileName);

            if (fs.existsSync(targetPath)) {
              emit({ type: "error", message: `文件已存在: ${fileName}` });
              return;
            }

            const tags = body.tags
              ? body.tags.split(",").map((t) => t.trim()).filter(Boolean)
              : [];
            const frontmatter = [
              "---",
              `title: ${title}`,
              `published: ${getDateTime()}`,
              `description: "${body.description || ""}"`,
              `image: "${body.image || ""}"`,
              `tags: [${tags.map((t) => `"${t}"`).join(", ")}]`,
              `category: "${body.category || ""}"`,
              `draft: ${body.draft !== false}`,
              `lang: "${body.lang || ""}"`,
              "---",
              "",
              body.content || "开始写作...",
              "",
            ].join("\n");

            if (!fs.existsSync(postsDir)) {
              fs.mkdirSync(postsDir, { recursive: true });
            }
            fs.writeFileSync(targetPath, frontmatter, "utf-8");
            emit({ type: "log", message: `📝 新文章已创建: ${fileName}` });
            mdFile = targetPath;
          } else if (body.uploadedFileName && body.uploadedContent !== undefined) {
            // 浏览器上传模式：内容已在浏览器端读取，服务端直接写入
            const fileName = body.uploadedFileName;
            const dest = path.join(postsDir, fileName);

            if (!fs.existsSync(postsDir)) {
              fs.mkdirSync(postsDir, { recursive: true });
            }
            fs.writeFileSync(dest, body.uploadedContent, "utf-8");
            emit({ type: "log", message: `📋 已写入: ${fileName}` });

            // 确保 frontmatter
            const raw = body.uploadedContent;
            const parsed = matter(raw);
            if (!parsed.data.title || !parsed.data.published) {
              const newData = {
                title: parsed.data.title || path.basename(dest, ".md"),
                published: parsed.data.published || getDateTime(),
                description: parsed.data.description || "",
                image: parsed.data.image || "",
                tags: parsed.data.tags || [],
                category: parsed.data.category || "",
                draft: parsed.data.draft ?? false,
                lang: parsed.data.lang || "",
              };
              writeFixedFrontmatter(dest, parsed, newData);
              emit({ type: "log", message: "✅ Frontmatter 已补全" });
            }
            mdFile = dest;
          } else if (body.filePath) {
            // 使用已有文件
            const srcPath = body.filePath;
            if (!fs.existsSync(srcPath)) {
              emit({ type: "error", message: `文件不存在: ${srcPath}` });
              return;
            }

            const dest = path.join(postsDir, path.basename(srcPath));
            fs.copyFileSync(srcPath, dest);
            emit({ type: "log", message: `📋 已复制: ${path.basename(dest)}` });

            // 确保 frontmatter
            const raw = fs.readFileSync(dest, "utf-8");
            const parsed = matter(raw);
            if (!parsed.data.title || !parsed.data.published) {
              const newData = {
                title: parsed.data.title || path.basename(dest, ".md"),
                published: parsed.data.published || getDateTime(),
                description: parsed.data.description || "",
                image: parsed.data.image || "",
                tags: parsed.data.tags || [],
                category: parsed.data.category || "",
                draft: parsed.data.draft ?? false,
                lang: parsed.data.lang || "",
              };
              writeFixedFrontmatter(dest, parsed, newData);
              emit({ type: "log", message: "✅ Frontmatter 已补全" });
            }
            mdFile = dest;
          } else {
            emit({ type: "error", message: "请提供文章标题或文件路径" });
            return;
          }

          mdFile = path.resolve(mdFile);
          const relativePost = path.relative(blogDir, mdFile).replace(/\\/g, "/");

          // ====== 步骤2: 构建 ======
          emit({ type: "phase", message: "🔨 构建静态站点..." });
          emit({ type: "log", message: "运行 pnpm build..." });

          const buildProc = spawn("pnpm", ["build"], {
            cwd: blogDir,
            shell: true,
            stdio: "pipe",
          });

          buildProc.stdout.on("data", (data) => {
            const lines = data.toString().split("\n").filter(Boolean);
            for (const line of lines) {
              emit({ type: "log", message: line });
            }
          });

          buildProc.stderr.on("data", (data) => {
            const lines = data.toString().split("\n").filter(Boolean);
            for (const line of lines) {
              // Astro 的构建输出经常走到 stderr（ANSI 转义码），不是真正的错误
              emit({ type: "log", message: line });
            }
          });

          const buildCode = await new Promise((resolve) => {
            buildProc.on("close", resolve);
          });

          if (buildCode !== 0) {
            emit({ type: "error", message: `构建失败 (exit code: ${buildCode})` });
            return;
          }
          emit({ type: "log", message: "✅ 构建完成" });

          // ====== 步骤3: 日常模式 — 也输出 git 操作提示 ======
          if (body.action === "build-only") {
            emit({ type: "complete", message: "✅ 构建完成，dist/ 已更新", url: null });
            return;
          }

          // ====== 步骤4: Git 提交 ======
          const branch = getCurrentBranch();
          emit({ type: "phase", message: `📤 Git 提交并推送 (${branch})...` });

          // git add — 用 execSync 避免 spawn 在 Windows 上处理中文路径的兼容问题
          emit({ type: "log", message: `git add ${relativePost}` });
          try {
            execSync(`git add "${relativePost}"`, {
              cwd: blogDir,
              encoding: "utf-8",
              stdio: "pipe",
            });
          } catch (e) {
            emit({
              type: "error",
              message: `git add 失败:\n${e.stderr || e.message}`,
            });
            return;
          }

          // git commit
          const fileName = path.basename(mdFile);
          emit({ type: "log", message: `git commit -m "publish: ${fileName}"` });
          try {
            const commitOut = execSync(
              `git commit -m "publish: ${fileName}"`,
              { cwd: blogDir, encoding: "utf-8", stdio: "pipe" }
            );
            emit({ type: "log", message: commitOut.trim() || "已提交" });
          } catch (e) {
            const msg = (e.stderr || e.message || "").toString();
            if (msg.includes("nothing to commit")) {
              emit({ type: "log", message: "没有需要提交的变更" });
            } else {
              emit({ type: "error", message: `Git commit 失败:\n${msg}` });
              return;
            }
          }

          // git push
          // 本地分支可能是 master，但远程默认分支是 main（Cloudflare 监听 main）
          // 用 HEAD:main 确保推到正确的远程分支
          emit({ type: "log", message: "git push origin HEAD:main..." });
          try {
            const pushOut = execSync("git push origin HEAD:main", {
              cwd: blogDir,
              encoding: "utf-8",
              stdio: "pipe",
            });
            emit({ type: "log", message: pushOut.trim() });
          } catch (e) {
            emit({
              type: "error",
              message: `Git push 失败:\n${e.stderr || e.message}`,
            });
            return;
          }

          // ====== 完成 ======
          emit({
            type: "complete",
            message: "🎉 发布完成！等待 Cloudflare Pages 部署（约1-2分钟）",
            url: "https://fzy.it.com",
            post: relativePost,
          });
        } catch (err) {
          emit({ type: "error", message: err.message });
        } finally {
          res.end();
        }
      };

      run();
    })
    .catch((err) => {
      sendJSON(res, 400, { error: err.message });
    });
}

// ====== HTTP 路由 ======

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${PORT}`);

  // API 路由
  if (url.pathname === "/api/publish" && req.method === "POST") {
    streamPublish(req, res);
    return;
  }

  if (url.pathname === "/api/posts" && req.method === "GET") {
    sendJSON(res, 200, listPosts());
    return;
  }

  if (url.pathname === "/api/check-file" && req.method === "POST") {
    parseJSONBody(req)
      .then((body) => {
        const exists = fs.existsSync(body.filePath);
        const stats = exists ? fs.statSync(body.filePath) : null;
        sendJSON(res, 200, {
          exists,
          isFile: stats?.isFile() ?? false,
          size: stats?.size ?? 0,
          name: exists ? path.basename(body.filePath) : "",
        });
      })
      .catch(() => sendJSON(res, 400, { error: "Invalid request" }));
    return;
  }

  // 静态文件
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════╗
║       📝 博客发布管理面板                     ║
║                                              ║
║   本地地址: http://localhost:${PORT}              ║
║   按 Ctrl+C 停止服务                          ║
║                                              ║
║   功能:                                       ║
║   · 新建文章（含 frontmatter 生成）           ║
║   · 发布已有 .md 文件                        ║
║   · 实时构建日志                              ║
║   · 一键 Git 推送                             ║
╚══════════════════════════════════════════════╝
`);

  // 自动打开浏览器
  const platform = process.platform;
  const url = `http://localhost:${PORT}`;
  try {
    if (platform === "win32") {
      execSync(`start ${url}`, { shell: true });
    } else if (platform === "darwin") {
      execSync(`open ${url}`);
    } else {
      execSync(`xdg-open ${url}`);
    }
  } catch {
    // 静默失败，用户手动打开
  }
});
