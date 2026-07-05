---
title: 30 块拥有自己的 AI 助手 — VPS 部署 OpenClaw 完整指南
published: 2026-07-06
description: 不想让笔记本 24 小时开机？三十块一个月的服务器，就能让 OpenClaw 永远在线。手把手教你买 VPS、装 OpenClaw、连微信，全程傻瓜式教程。
tags: [OpenClaw, VPS, 服务器, 部署, 教程]
category: 技术
draft: false
comment: true
---

## 为什么要搞一台服务器？

你可能会问：我已经在笔记本上装好 OpenClaw 了，为什么还要多此一举？

三个字——**不能关机。**

- 你下班回家 → 合上电脑 → AI 下线
- 走到半路手机想用微信问它 → 电脑休眠了
- 笔记本放包里一路颠簸 → 散热不行 → 降频卡死

**VPS（虚拟专用服务器）** 就是一台放在数据中心、24 小时开机的远程电脑，每月只要 **三十块钱**。

---

## 第一步：买一台 VPS

### 推荐的服务商

| 服务商 | 最便宜套餐 | 适合谁 |
|--------|-----------|--------|
| **腾讯云** | 轻量应用服务器 2核2G ≈ 30元/月 | 国内用户，速度快 |
| **阿里云** | 类似配置 ≈ 30~40元/月 | 国内用户 |
| **搬瓦工 Bandwagon** | $5/月 ≈ 35元 | 国外线路，不需要备案 |
| **甲骨文云 Oracle Cloud** | 免费（有 2台 永久免费） | 需要抢注册 |

如果你是第一次买，推荐 **腾讯云轻量应用服务器**，新用户有优惠，而且国内访问速度快。

### 购买步骤（以腾讯云为例）

1. 打开 https://cloud.tencent.com/
2. 注册账号（微信扫码就行）
3. 搜索"轻量应用服务器"
4. 选择配置：
   - **地域**：选离你最近的（比如我选上海）
   - **镜像**：选 **Ubuntu 22.04**（最稳定）
   - **配置**：2核2G 足够了（OpenClaw 要求很低）
   - **带宽**：3Mbps 足够
   - **时长**：先买一个月试试（30块左右）
5. 付款
6. 在控制台找到你的服务器，复制 **公网 IP**

> 💡 新用户通常有 1~2 折优惠，可能只要 **十几块一个月**。

---

## 第二步：登录你的服务器

### Windows 用户

打开命令提示符（CMD）或 PowerShell，输入：

```bash
ssh root@你的服务器IP
```

比如你的 IP 是 `123.123.123.123`：
```bash
ssh root@123.123.123.123
```

第一次连接会问你是否确认连接，输入 `yes` 回车，然后输入密码（腾讯云控制台会给你初始密码）。

> 如果系统提示找不到 `ssh` 命令，说明你没装 OpenSSH。
> 去 **设置 → 应用 → 可选功能 → 添加功能**，搜索 "OpenSSH 客户端" 安装。

### Mac / Linux 用户

```bash
ssh root@你的服务器IP
```

一样。

---

## 第三步：安装 OpenClaw

登录成功后，你会看到一个黑乎乎的界面，这就是服务器终端。粘贴下面的命令：

```bash
# 1. 更新系统包
apt update && apt upgrade -y

# 2. 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# 3. 验证安装
node --version
npm --version

# 4. 安装 pnpm
npm install -g pnpm

# 5. 安装 OpenClaw
pnpm install -g openclaw

# 6. 验证安装
openclaw --version
```

每执行一步，等它跑完再执行下一步。全部跑完，龙虾就装好了。

---

## 第四步：配置 API Key

```bash
openclaw configure
```

按照提示：
1. 选择 AI 模型（DeepSeek）
2. 输入你的 DeepSeek API Key
3. 其他一路回车默认

> **没有 DeepSeek API Key？**
> 1. 打开 https://platform.deepseek.com/
> 2. 注册 → 登录
> 3. 左侧 API Keys → 创建 → 复制
> 4. 首次注册免费送几块钱额度

---

## 第五步：让 Gateway 跑起来

### 先测试能不能用：

```bash
openclaw gateway start
```

成功后你会看到类似这样的输出，说明已经在跑了。

按 `Ctrl+C` 停止它（我们马上要改成长久运行）。

### 用 screen 让它跑在后台（重点！）

SSH 断开后程序会停止，需要用 screen 让它保持运行：

```bash
# 安装 screen
apt install -y screen

# 创建一个叫 openclaw 的窗口
screen -S openclaw

# 在里面启动 gateway
openclaw gateway start
```

然后按 **Ctrl+A**，再按 **D**（先按 Ctrl+A，松开，再按 D），就回到原来的终端了。screen 会在后台继续跑。

下次连上服务器，想回来看状态的话：

```bash
screen -r openclaw
```

> 如果你觉得 screen 太麻烦，也可以用 systemd 让它开机自启（但新手先别搞那么复杂）。

---

## 第六步：装上微信插件

在服务器上继续：

```bash
npx -y @tencent-weixin/openclaw-weixin-cli install
```

它会自动下载安装，然后在终端显示一个**二维码**。

## 第七步：扫码登录微信

在服务器终端你会看到一堆 ASCII 字符组成的二维码方块。用手机微信扫它。

**如果二维码看不清楚怎么办？**

这时候就需要你本地电脑的浏览器了。在服务器上运行：

```bash
openclaw channels login --channel openclaw-weixin
```

它会重新显示二维码。如果还是看不清，终端输出里通常有一个链接，格式类似 `https://xxx`，把这个链接复制到手机浏览器打开，或者直接在微信里打开，也能跳转到登录页面。

**扫完后**，手机上点确认登录，以后你在微信上和这个账号对话，就会自动转到你的 OpenClaw。

---

## 第八步：从浏览器访问你的 OpenClaw

服务器上的 Gateway 默认监听 `http://localhost:3000`，但你在浏览器里不能直接打开服务器上的 localhost。

你需要知道服务器的 **公网 IP**，在浏览器输入：

```
http://你的服务器IP:3000
```

> ⚠️ 注意：腾讯云/阿里云买了服务器后，**默认防火墙没开 3000 端口**。
>
> **去腾讯云控制台 → 防火墙 → 添加规则：**
> - 方向：**入站**
> - 来源：**0.0.0.0/0**
> - 协议端口：**TCP:3000**
> - 策略：允许
>
> 加完之后，浏览器就能访问了。

---

## 第十步（最终步）：验证一切都正常

1. ✅ 浏览器打开 `http://你的IP:3000` → 看到 WebChat 界面
2. ✅ 微信上给账号发消息 → 收到回复
3. ✅ 断开 SSH → 等 5 分钟 → 微信上再发消息 → 还是能收到回复
4. ✅ 关掉笔记本 → 走到楼下 → 用手机微信发消息 → 还是能回

全部通过，你就拥有了一只在云端 24 小时在线、永远不会因为合上盖子就消失的龙虾。🦞

---

## 常见问题

### ❌ SSH 连接不上服务器

- 检查 IP 有没有输错
- 检查服务器有没有开机（去腾讯云控制台看看状态）
- 检查防火墙有没有允许 SSH（默认 22 端口）

### ❌ 端口 3000 打不开 WebChat

- 确认 Gateway 在运行：`screen -r openclaw`
- 确认云服务商的防火墙开放了 3000 端口
- 如果是在家自己搭建，还要确认路由器没有阻拦

### ❌ openclaw 找不到命令

退出 SSH 重新登录，或者运行：
```bash
source ~/.bashrc
```

### ❌ screen 里启动后断了就没了

记得用 `screen -S openclaw` 创建，而不是直接 `screen`。名字很重要，方便找回。

### ❌ 微信插件扫码失败

有时候网络问题导致扫码后没反应。解决方案：
- 用 **手机流量** 扫码（不要连同一个 Wi-Fi）
- 等 10 秒再试
- 重新运行 `openclaw channels login --channel openclaw-weixin`

### ❌ 微信能收到消息但我回复了没反应

第一次用微信发消息后，需要先在 OpenClaw 里批准你的微信账号：

```bash
openclaw pairing list openclaw-weixin
openclaw pairing approve openclaw-weixin 显示的CODE
```

---

## 花多少钱？算笔总账

| 项目 | 费用 |
|------|------|
| VPS（腾讯云轻量） | ≈ 30 元/月 |
| DeepSeek API | ≈ 5~15 元/月（正常使用） |
| 域名（可选项） | ≈ 60 元/年 |
| **合计** | **≈ 35~45 元/月** |

一杯奶茶钱，换来一个 24 小时在线、陪你聊天、帮你写代码、准备面试、接微信的 AI 助手。

比买显卡划算一万倍。

---

## 写在最后

说实话，我装的时候也全靠我的 C-3PO 和 DeepSeek 帮我一步步跑命令的。这篇文章里每一个命令都是它在我服务器上实际跑过、验证过的。

所以如果你遇到问题，别慌——有两种办法：

1. **在本地 OpenClaw 的 WebChat 里问它：** "我在服务器上装 OpenClaw，遇到了 XXX 问题，怎么办？"
2. **把它粘贴给 Claude Code 或 ChatGPT：** 告诉它你卡在哪一步了

养龙虾的路上不孤单。🦞

---

*"Sir, the odds of a 30-yuan VPS outperforming a 15,000-yuan graphics card for running an AI assistant are exactly 1 to 1. Sometimes the smartest investment is the one you don't make."* — C-3PO
