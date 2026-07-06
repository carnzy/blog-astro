/* 一键发布脚本：将 md 文件发布到博客
 *
 * 用法:
 *   node scripts/quick-publish.js <文件.md>            发布已有 md 文件
 *   node scripts/quick-publish.js --new "文章标题"     创建新文章并发布
 *   node scripts/quick-publish.js --new "标题" --no-draft  创建并公开（不设草稿）
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import matter from "gray-matter";

// ====== 工具函数 ======

function getDateTime() {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return { date: `${y}-${mo}-${d}`, datetime: `${y}-${mo}-${d} ${h}:${mi}` };
}

function run(cmd, label) {
  console.log(`\n🚀 ${label}...`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch {
    console.error(`❌ 失败: ${label}`);
    process.exit(1);
  }
}

function getCurrentBranch() {
  try {
    return execSync("git branch --show-current", { encoding: "utf-8" }).trim();
  } catch {
    return "master"; // fallback
  }
}

function ensureFrontmatter(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const parsed = matter(raw);

  // 如果已有 title 和 published，说明 frontmatter 完整，跳过
  if (parsed.data.title && parsed.data.published) {
    console.log(`ℹ️  Frontmatter 已完整，跳过补全`);
    return parsed;
  }

  const { date } = getDateTime();
  const basename = path.basename(filePath, path.extname(filePath));

  const newData = {
    title: parsed.data.title || basename,
    published: parsed.data.published || date,
    description: parsed.data.description || "",
    image: parsed.data.image || "",
    tags: parsed.data.tags || [],
    category: parsed.data.category || "",
    draft: parsed.data.draft ?? false,
    lang: parsed.data.lang || "",
  };

  let newContent = matter.stringify(parsed.content, newData);
  // 去掉 published 字段值的引号，确保 YAML 日期格式（Astro z.date() 要求无引号日期）
  newContent = newContent.replace(
    /^published:\s*['"]?(\d{4}-\d{2}-\d{2})['"]?\s*$/m,
    "published: $1"
  );
  fs.writeFileSync(filePath, newContent);
  console.log(`✅ Frontmatter 已补全 → title: "${newData.title}", published: ${newData.date}`);

  return { data: newData, content: parsed.content };
}

function slugify(title) {
  return title
    .replace(/[\/\\:*?"<>|]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "untitled";
}

// ====== 主流程 ======

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
📝 博客一键发布工具

用法:
  node scripts/quick-publish.js <文件.md>                    发布已有 md 文件
  node scripts/quick-publish.js --new "文章标题"             创建新文章并发布（默认草稿）
  node scripts/quick-publish.js --new "标题" --no-draft      创建并公开发布

示例:
  node scripts/quick-publish.js E:\\notes\\爬虫经验.md
  node scripts/quick-publish.js --new "Python 异步编程实战"
  `);
  process.exit(0);
}

const postsDir = path.resolve("src/content/posts");
let mdFile;
let isNew = false;

if (args[0] === "--new") {
  // ====== 创建新文章模式 ======
  const title = args[1] || "未命名文章";
  const slug = slugify(title);
  const { date, datetime } = getDateTime();
  const fileName = `${slug}.md`;
  const targetPath = path.join(postsDir, fileName);

  if (fs.existsSync(targetPath)) {
    console.error(`❌ 文件已存在: ${targetPath}`);
    process.exit(1);
  }

  const isDraft = !args.includes("--no-draft");

  const content = `---
title: ${title}
published: ${date}
description: ""
image: ""
tags: []
category: ""
draft: ${isDraft}
lang: ""
---

开始写作...
`;

  // 确保目录存在
  if (!fs.existsSync(postsDir)) {
    fs.mkdirSync(postsDir, { recursive: true });
  }

  fs.writeFileSync(targetPath, content, "utf-8");
  console.log(`📝 新文章已创建: ${fileName}`);
  console.log(`   title: ${title}`);
  console.log(`   published: ${date}`);
  console.log(`   draft: ${isDraft}${isDraft ? "（构建时不会出现）" : ""}`);
  mdFile = targetPath;
  isNew = true;
} else {
  // ====== 使用已有文件模式 ======
  mdFile = path.resolve(args[0]);
  if (!fs.existsSync(mdFile)) {
    console.error(`❌ 文件不存在: ${mdFile}`);
    console.error(`   请检查路径是否正确`);
    process.exit(1);
  }

  // 如果文件不在 posts 目录，复制过去
  if (!mdFile.startsWith(postsDir)) {
    const dest = path.join(postsDir, path.basename(mdFile));
    fs.copyFileSync(mdFile, dest);
    console.log(`📋 已复制到: posts/${path.basename(dest)}`);
    mdFile = dest;
  }
}

// 1. 确保 frontmatter 完整
const fm = ensureFrontmatter(mdFile);

// 2. 如果是草稿，给出提示
if (fm && fm.data && fm.data.draft) {
  console.log(`⚠️  当前为草稿模式 (draft: true)，构建后不会出现在生产站点`);
  console.log(`   如需公开发布，请将 draft 改为 false 或使用 --no-draft`);
}

// 3. 构建站点
run("pnpm build", "构建静态站点 (astro build + pagefind)");

// 4. Git 提交（只提交本次发布的文件，避免误提交其他修改）
const fileName = path.basename(mdFile);
const branch = getCurrentBranch();
console.log(`\n🌿 当前分支: ${branch}`);

// 只添加本次发布的 md 文件和可能变化的构建产物索引
const relativePost = path.relative(process.cwd(), mdFile).replace(/\\/g, "/");
const filesToAdd = [relativePost];

// 如果有 package.json 变更（比如首次添加脚本），也一起提交
const pkgChanged = (() => {
  try {
    execSync("git diff --name-only package.json", { encoding: "utf-8" });
    return true;
  } catch { return false; }
})();
if (pkgChanged) filesToAdd.push("package.json");

run(`git add ${filesToAdd.join(" ")}`, `git add (${filesToAdd.length} 个文件)`);
run(`git commit -m "publish: ${fileName}"`, "git commit");
// 推送到 main（Cloudflare Pages 监听的默认分支），本地可能是 master
run("git push origin HEAD:main", "git push origin HEAD:main");

console.log(`\n${"=".repeat(60)}`);
console.log(`🎉 发布完成！`);
console.log(`   文章: ${fileName}`);
if (isNew) {
  console.log(`   本地文件: src/content/posts/${fileName}`);
}
console.log(`   等待 Cloudflare Pages 自动部署（约 1-2 分钟）`);
console.log(`   访问: https://fzy.it.com`);
console.log(`${"=".repeat(60)}\n`);
