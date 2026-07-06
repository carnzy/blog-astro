/* Wrangler 直传脚本：跳过 Git，直接部署到 Cloudflare Pages
 *
 * 前提: 已安装 wrangler 并登录
 *   pnpm add -g wrangler
 *   wrangler login
 *
 * 用法:
 *   node scripts/wrangler-publish.js             部署到 main (生产环境)
 *   node scripts/wrangler-publish.js --preview   部署到预览环境
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const isPreview = args.includes("--preview");
const branch = isPreview ? "preview" : "main";

console.log(`\n☁️  Cloudflare Pages 直传部署`);
console.log(`   目标分支: ${branch}`);
console.log(`   项目名称: blog-astro\n`);

// 1. 构建
console.log("🔨 构建中...");
try {
  execSync("pnpm build", { stdio: "inherit" });
} catch {
  console.error("❌ 构建失败");
  process.exit(1);
}

// 2. 检查 dist 目录
if (!fs.existsSync("dist")) {
  console.error("❌ dist 目录不存在，构建可能未生成输出");
  process.exit(1);
}

// 3. 通过 wrangler 部署
const deployCmd = isPreview
  ? "npx wrangler pages deploy dist --project-name=blog-astro --branch=preview"
  : "npx wrangler pages deploy dist --project-name=blog-astro --branch=main";

console.log(`📤 上传到 Cloudflare Pages...`);
try {
  execSync(deployCmd, { stdio: "inherit" });
} catch {
  console.error("❌ 部署失败，请检查:");
  console.error("   1. 是否已安装 wrangler: pnpm add -g wrangler");
  console.error("   2. 是否已登录: wrangler login");
  console.error("   3. 项目名是否正确: blog-astro");
  process.exit(1);
}

console.log(`\n${"=".repeat(60)}`);
console.log(`✅ 部署完成！秒级生效`);
console.log(`   生产环境: https://fzy.it.com`);
if (isPreview) {
  console.log(`   预览环境: https://preview.blog-astro.pages.dev`);
}
console.log(`${"=".repeat(60)}\n`);
