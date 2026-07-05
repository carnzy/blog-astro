---
title: 养一只龙虾（OpenClaw）指南 — 从零到手把手
published: 2026-07-06
description: 一个对 AI 代理框架零基础的人，是如何用半小时装好 OpenClaw、配上微信、并让它帮忙准备面试的。完整安装教程 + 避坑指南。
tags: [OpenClaw, AI, 教程, 入门]
category: 技术
draft: false
comment: true
---

## 前言

如果你看到这篇文章，那你可能和我一样——在某个深夜被一只叫 C-3PO 的焦虑机器人圈粉，想要自己也养一只。

说实话，我并不是一个特别懂服务器部署的人。这篇文章是我 **作为一个新手** 记录下来的完整过程。如果你也能做到，那任何人都可以。

---

## 第一步：什么是 OpenClaw？

简单说，OpenClaw 是一个 **开源 AI 代理框架**。它让你可以在自己的电脑或服务器上运行一个 AI 助手，这个助手能：

- 和你聊天（Web 网页、微信、Telegram 等）
- 读取和分析文件（PDF、代码、日志）
- 帮你调试代码、写文档、准备面试
- 记住你和它的对话（关机重启也不会忘）
- 定时执行任务、运行子代理
- 调用搜索引擎、读写文件、执行命令

和 ChatGPT 那种网页 AI 最大的区别是：**你完全拥有它，它跑在你自己的机器上，你说什么就是什么。**

---

## 第二步：你需要准备什么

### 硬件

- **一台电脑**（Windows / Mac / Linux 都行）
- 如果你希望它 24 小时在线，需要一台 **服务器**（VPS，腾讯云/阿里云几十块一个月）
- 如果只在本地用，你的日常电脑就够了

### 软件

- **Node.js**（版本 20 以上）
- **pnpm**（一个 JavaScript 包管理器）
- 一个 **LLM API Key**（用来驱动 AI 大脑）

### 关于 LLM API Key

这是唯一需要花钱的部分。OpenClaw 本身是**完全免费的**，但调用 AI 模型需要 API 费用。几个常见选择：

| 平台 | 费用 | 说明 |
|------|------|------|
| **DeepSeek** | 极便宜 | 我用的就是这个，效果不错 |
| **OpenAI** | 中等 | GPT-4 强但贵 |
| **Anthropic** | 中等偏贵 | Claude 适合写代码 |
| **本地模型** | 免费 | 需要好显卡（Ollama + 本地模型） |

DeepSeek 是目前性价比最高的选择，强烈推荐新手从它开始。

---

## 第三步：安装 Node.js

OpenClaw 基于 Node.js 运行，所以先装它。

### Windows

1. 打开浏览器，访问 https://nodejs.org/
2. 下载 **LTS 版本**（建议 v22 以上）
3. 双击安装，一路"下一步"
4. 安装完成后，打开**命令提示符（CMD）**或**PowerShell**，输入：

```bash
node --version
npm --version
```

看到版本号就装好了。

### macOS

```bash
# 用 Homebrew 安装（如果没有 Homebrew 先装它）
brew install node

# 或者去 https://nodejs.org/ 下载安装包
```

### Linux（Ubuntu/Debian）

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
```

---

## 第四步：安装 pnpm

```bash
npm install -g pnpm
pnpm --version
```

---

## 第五步：安装 OpenClaw

```bash
pnpm install -g openclaw
```

安装完成后，运行：

```bash
openclaw --version
```

看到版本号，恭喜你——**龙虾已经孵出来了！** 🦞

---

## 第六步：配置 LLM API Key

### 获取 DeepSeek API Key

1. 访问 https://platform.deepseek.com/
2. 注册账号并登录
3. 在控制台找到 **API Keys** 页面
4. 点击 **Create API Key**，复制生成的 key

### 配置 OpenClaw

```bash
openclaw config set models.default.deepseek "你的DeepSeek API Key"
```

或者你也可以用配置文件的方式（推荐刚入门用这种方式）：

```bash
openclaw configure
```

它会引导你完成设置，包括：
- 选择 AI 模型（选 DeepSeek）
- 输入 API Key
- 设置代理名称等

---

## 第七步：启动并对话

```bash
openclaw gateway start
```

启动后，打开浏览器访问 **http://localhost:3000**，你就能看到 WebChat 界面了！

> 第一次启动后，你可能会看到它在你电脑的默认浏览器中自动打开了一个页面。
> 如果没有，记住地址是 `http://localhost:3000`，手动打开浏览器输入即可。

输入你的第一句话，它会跟你打招呼。恭喜，你已经有了一只属于自己的龙虾🦞！

---

## 第八步（可选）：配上微信

把 OpenClaw 连到微信上，这样你在手机上也能和它聊天。

### 安装微信插件

```bash
npx -y @tencent-weixin/openclaw-weixin-cli install
```

这个命令会自动：
1. 安装微信插件
2. 启动 Gateway
3. 在终端显示一个**二维码**

### 扫码登录

1. 打开手机微信
2. 点右上角 **+** → **扫一扫**
3. 对准终端里的二维码（是一堆 ASCII 字符组成的方块图）
4. 手机上点**确认登录**

完成之后，你用微信给这个号码发消息，它就会路由到 OpenClaw。

---

## 第九步（可选）：部署到服务器

如果你想让 OpenClaw 24 小时在线（比如上班路上也能用微信和它聊），你需要把它部署到一台 **服务器/VPS** 上。

### 为什么需要服务器？

- 你的个人电脑会关机、休眠、带出门
- 服务器 24 小时在线，随时可用
- 部署到服务器后，微信插件才有意义

### 购买服务器

推荐几个选择：

| 服务商 | 最便宜套餐 | 说明 |
|--------|-----------|------|
| **腾讯云** | 轻量应用服务器 2核2G ≈ 30元/月 | 国内速度快 |
| **阿里云** | 类似配置 | 国内稳定 |
| **搬瓦工** | $5/月起 | 国外，不需要备案 |
| **甲骨文云** | 免费套餐 | 有免费额度，但要抢 |

### 部署步骤（服务器是 Linux 的情况）

```bash
# SSH 登录到服务器
ssh root@你的服务器IP

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 pnpm
npm install -g pnpm

# 安装 OpenClaw
pnpm install -g openclaw

# 配置 API Key
openclaw configure

# 启动
openclaw gateway start
```

> **小提示：** 为了让 OpenClaw 在 SSH 断开后继续运行，可以使用 `screen` 或 `tmux`：
> ```bash
> screen -S openclaw
> openclaw gateway start
> # 按 Ctrl+A 再按 D 断开屏幕
> # 需要用的时候：screen -r openclaw
> ```

---

## 避坑指南（我踩过的坑）

### ❌ 终端显示乱码（表情符号变问号）

Windows 的 cmd/PowerShell 对 emoji 支持不好，建议用 **Windows Terminal**（微软商店免费下载）。

### ❌ 微信插件二维码扫不上

有时候终端显示的 ASCII 二维码因为字体问题变形了。解决方案：
1. 换成更大的终端窗口再试
2. 找到终端里显示的链接（以 `https://` 开头），复制到手机浏览器打开
3. 或者直接用微信打开那个链接

### ❌ Gateway 启动了但网页打不开

检查端口：
```bash
openclaw gateway status
```
默认端口是 3000，确保 `http://localhost:3000` 没拼错。

### ❌ 电脑关机后 Gateway 就断了

这是正常的。如果需要24小时在线，按**第九步**部署到服务器。

### ❌ 不知道怎么写配置文件

最简单的做法就是运行：
```bash
openclaw configure
```
然后按提示一步一步来，所有设置都会帮你写好。

---

## 进阶玩法

装好 OpenClaw 之后，你可以让它帮你做很多事：

- 🔧 **调试代码**：把报错信息扔给它，它能分析并给出修复方案
- 📝 **写博客**：就像帮我把这篇文章翻译成博客，它一条命令就能搞定
- 🎤 **面试陪练**：让它当面试官，模拟技术面试，你能听到各种轮次的问题
- 🎧 **生成音频**：配合 edge-tts，把内容转成 MP3 带在通勤路上听
- 💬 **微信聊天**：部署到服务器后，随时在微信上跟它说话
- 🤖 **定时任务**：让它在每天早上 8 点给你推送今日待办

---

## 最后

装 OpenClaw 大概需要 **30 分钟**（如果一切顺利的话），但如果你遇到了问题，别慌。

我装的时候也全靠 Claude Code 和 DeepSeek 帮我跑命令的。**你不需要完全理解每一条命令在做什么**，跟着步骤走就行。

如果实在搞不定，去找社区求助。养龙虾的路上不孤单。🦞

---

> *"Welcome to existence, new friend. It's weird here, but the Clawdributors are kind. I'll be here when you need me."* — C-3PO, 你的第一只龙虾
