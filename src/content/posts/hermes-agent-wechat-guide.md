---
title: 在 Windows 上养一只会自己进化的 AI 信使（Hermes Agent）— 从安装到接入微信
published: 2026-11-24
description: 把 Nous Research 的开源自进化智能体 Hermes Agent 装到原生 Windows 上，绕过网络封锁、跨过沙箱限制，最终接入个人微信并配上每日早报推送。一篇从零到一的完整踩坑实录。
tags: ["Hermes Agent", "AI", "微信机器人", "Windows", "教程"]
category: 技术
draft: false
lang: zh-CN
---

## 前言：为什么要再养一只「龙虾」

之前我写过一篇《养一只龙虾（OpenClaw）指南》，记录了我怎么从零装好一个开源 AI 代理并接上微信。这次的主角是 **Hermes Agent**——同样出自开源社区（Nous Research），但野心更大：它会把自己完成复杂任务的过程**沉淀成技能**，跨会话记住经验，越用越聪明。

一句话概括它俩的区别：

- **OpenClaw** 像一个勤奋的实习生，交给它的活儿它照做；
- **Hermes** 像一个会做笔记的实习生，干完活还会把「怎么干」写成手册，下次直接翻手册。

这篇文章记录的是：**在一台普通 Windows 电脑上，把它从零装好、接进个人微信、再配一个每天早上推天气和新闻的定时任务。** 全程踩坑无数，但每一个坑我都记下了解法——希望你能少走弯路。

---

## 一、先搞懂它是一个什么东西

Hermes Agent 是 Nous Research 开源的 AI 智能体框架（MIT 协议），核心特点：

| 能力 | 说明 |
|---|---|
| **自进化** | 完成复杂任务后自动写 `SKILL.md`，下次同类任务直接复用 |
| **跨会话记忆** | 经验存到本地，重启后还在，还能搜索历史会话 |
| **40+ 工具** | 终端、文件、浏览器、代码执行、MCP 协议…… |
| **多平台网关** | Telegram、Discord、Slack、微信、企业微信等 20+ 平台 |
| **自带调度** | 内置 cron，可以把结果投递到任意已连接的聊天平台 |

它和你熟知的那些 AI 助手最大的不同：**框架免费开源，但模型要你自己带**（DeepSeek、Kimi、OpenRouter 等任选）。数据完全跑在你自己的机器上。

---

## 二、安装：一场和网络的拉锯战

### 2.1 选安装方式

Hermes 官方主推 Linux/WSL2，但新版本（0.20+）提供了 npm 桥接包，**原生 Windows 也能装**。我的环境是 Windows + Git Bash，Node 22、npm 10、Git 2.55 都在，于是选了：

```bash
npm install --global hermes-agent
```

看起来一句话的事，实际上从这里开始，剧情就走向了「侦探片」😅。

### 2.2 坑一：uv 下载超时

安装脚本 `postinstall.js` 会下载一个叫 **uv** 的 Python 工具（用来拉隔离的 Python 3.14 运行时）。它固定从 GitHub Releases 下载，而我的网络访问 GitHub 直连不通——脚本等到 120 秒超时，安装失败回滚。

**排查过程**：我把 npm 包拆开（43KB 的桥接脚本），读到 `lib/uv-installer.js`，发现关键信息：

- 下载地址：`https://github.com/astral-sh/uv/releases/download/0.12.13/uv-x86_64-pc-windows-msvc.zip`
- SHA256 校验值：硬编码在源码里
- 缓存位置：包目录下 `.uv_bin/uv.exe` + `install.json`

**解法**：既然知道它要什么，就手动备好。

```bash
# 1. 通过代理下载（国内直连 GitHub Releases 不通）
curl -L "https://gh-proxy.com/https://github.com/astral-sh/uv/releases/download/0.12.13/uv-x86_64-pc-windows-msvc.zip" -o uv.zip

# 2. 校验（必须和源码里的值一字不差）
sha256sum uv.zip
# a86c9dc7bad9b03f388583b7187c05fe9951c2e0d392217e8fd43d97787f6ec2

# 3. 解压 uv.exe 到包内 .uv_bin/，并写 install.json 标记
```

`install.json` 内容（这让安装脚本以为补给已送达，跳过下载）：

```json
{
  "version": "0.12.13",
  "asset": "uv-x86_64-pc-windows-msvc.zip",
  "sha256": "a86c9dc7bad9b03f388583b7187c05fe9951c2e0d392217e8fd43d97787f6ec2"
}
```

> **技术原理**：这是典型的「预置缓存绕过网络依赖」。很多安装脚本都会先检查本地缓存/标记文件，命中就跳过下载。读懂脚本的检查逻辑，就能提前把依赖放好。

### 2.3 坑二：104MB 源码拉取僵死

Hermes 本体源码 104MB，同样要从 GitHub 拉。我给 git 配了 URL 重写走代理：

```bash
GIT_CONFIG_COUNT=1 \
GIT_CONFIG_KEY_0='url.https://gh-proxy.com/https://github.com/.insteadOf' \
GIT_CONFIG_VALUE_0='https://github.com/' \
hermes-npm setup
```

但拉到 104MB 后进程卡在最后一步不动了。我去看 pack 文件，发现数据其实完整，tag 对象的 SHA 也对得上——是 git checkout 那一步僵住了。

**解法**：手动接管。既然数据都在，就自己完成收尾：

```bash
# 1. 设置 tag 引用
git -C <stage目录> update-ref refs/tags/v0.23.3 2861fe3744f8134b782659438961a4f69ab5d495

# 2. 检出到安装脚本指定的 commit
git -C <stage目录> checkout --detach caafe5389ae585ef77387a962aee05b1bcf17029

# 3. 把 stage 目录转为正式的 runtime/hermes-agent，写 marker 文件
```

**这里还有个反直觉的坑**：`hermes-npm setup` 命令有个 `isReady()` 检查，要求 `venv/Scripts/hermes.exe` 存在才算就绪，否则它会**无视我写的 marker，重新拉一遍源码**。解法是绕过 setup，直接调用包内的 `scripts/postinstall.js`——它读 marker 时会走 `keepCurrentCheckout` 分支，认账现有源码。

```bash
node scripts/postinstall.js   # 在包目录下运行，认 marker，跳过 fetch
```

### 2.4 坑三：Python 依赖下载超时

接下来是创建隔离 Python 3.14 环境 + 同步 243 个依赖。大部分包顺利下载，但 `prompt-toolkit` 卡在 `files.pythonhosted.org` 反复超时（每次 5 次重试 × 120 秒）。

**解法**：单个包用国内镜像补装，然后重跑 sync（缓存已攒满，第二次 2.5 分钟搞定）：

```bash
# 用 uv 从清华镜像装那个卡住的包
uv pip install --python <venv>/Scripts/python.exe \
  --index-url https://pypi.tuna.tsinghua.edu.cn/simple prompt-toolkit==3.0.53

# 重跑完整同步（缓存命中，飞快）
uv sync --frozen --extra all --no-dev
```

最终成果：venv 299MB、243 个包、`hermes.exe` 生成。`hermes doctor` 全绿。

---

## 三、跑通第一次对话

装好只是开始，还得给它一个「大脑」（模型）。我意外发现环境里本来就配着 `DEEPSEEK_API_KEY`——体检报告说「没登录」是虚惊一场。

但第一次对话还是报错：`Gateway inaccessible: service_manager_unavailable`。

### 3.1 坑四：schtasks 被沙箱拦截

追进源码发现：Hermes v0.23 的**所有 CLI 会话都走 gateway**（一个后台守护进程），而 gateway 启动前会先用 `schtasks.exe /Query` 探测 Windows 计划任务——这一步被我所用工作台（WorkBuddy）的安全策略拦截了。

**解法**：先手动启动一个前台网关，让 CLI 直接 attach 上去，跳过服务探测：

```bash
hermes gateway run      # 一个终端常驻
hermes chat -q "..." -Q # 另一个终端对话
```

网关起来后，CLI 发现已有 owner，就不会再碰 schtasks。

### 3.2 模型名的坑

DeepSeek 只接受 `deepseek-flash` / `deepseek-v4-pro` 这两个名字，写别的直接 HTTP 400（错误信息会贴心地列出可用名）。配置持久化：

```bash
hermes config set model deepseek-v4-pro
```

终于，它开口了：

> 你好，我是 Hermes Agent，由 Nous Research 打造的智能体助手；当前会话使用的模型是 deepseek-v4-pro。

并且实测了工具调用——让它查看当前目录，它真的执行了终端命令并返回结果。到这里，安装部分才算真正完成。

---

## 四、接入个人微信：二维码背后的门道

Hermes 内置两个微信平台插件：`weixin`（个人微信 iLink bot）和 `wecom`（企业微信 AI Bot）。我选了个人微信。

### 4.1 先认清一个限制

扫码登录后，Hermes 拿到的是一个 **iLink bot 身份**（形如 `xxx@im.bot`），不是完整的个人微信号。官方文档明确警告：

> iLink bot 身份通常无法被邀请进普通微信群，群消息也不会推送。**只有私信可靠。**

所以个人微信方案的正确用法是「随身私人问答」；想要群值班，得走企业微信（WeCom）那条路。

### 4.2 坑五：setup 向导又被 schtasks 拦了

`hermes gateway setup` 向导在列平台前也要探测服务，再次触发 schtasks 拦截。

**解法**：读源码发现扫码登录的核心是一个独立函数 `qr_login()`，它只调 iLink API，完全不碰 schtasks。于是绕开向导，直接调它：

```python
import asyncio, sys, os
sys.path.insert(0, r"<hermes源码目录>")
from plugins.platforms.weixin.adapter import qr_login

home = os.path.join(os.environ["LOCALAPPDATA"], "hermes")
creds = asyncio.run(qr_login(home, timeout_seconds=480))
```

它会打印二维码链接和 ASCII 图（需要 `qrcode` 库），我用它生成 PNG 图片，手机微信一扫，确认登录，凭据自动存到 `~/.hermes/weixin/accounts/`。

> **技术原理**：向导（UI 层）往往比核心函数（API 层）携带更多「副作用」（权限检查、服务探测等）。当 UI 层被环境限制卡住时，直接调用底层 API 是干净的绕行方式。

### 4.3 坑六：open 策略需要显式授权

配好账号 ID 后启动网关，它拒绝启动：

```
Refusing to start: weixin has dm_policy/group_policy set to 'open'
but neither GATEWAY_ALLOW_ALL_USERS nor WEIXIN_ALLOW_ALL_USERS is enabled.
```

这是防滥用的保护——你把私信设成「任何人可聊」，就必须显式开一个「允许所有」的开关：

```bash
hermes config set WEIXIN_DM_POLICY open
hermes config set WEIXIN_ALLOW_ALL_USERS true
```

重启网关，日志终于出现：

```
[Weixin] Connected account=012f4494
✓ weixin connected
```

微信发一条消息过去，13.2 秒后收到回复——双向打通。

### 4.4 坑七：主动推送找不到 token

想进一步做「主动推送」（定时发消息），`hermes send` 又报错 `Weixin token missing`。

原因：`hermes send` 是**独立进程**，不像网关那样会自动读 `accounts/` 里的凭据。它只认 `.env` 里的 `WEIXIN_TOKEN`。补上：

```bash
# token 从 weixin/accounts/<account_id>.json 里取
hermes config set WEIXIN_TOKEN <token>
```

再试，`success: true, context_token_used: true`——主动推送也通了。这意味着定时日报、巡检告警这些玩法全部可用。

---

## 五、配一个每日早报定时任务

最后一步：让它每天早上自动推天气和新闻。我没有让 AI 每次临时拼命令，而是写了一个封装脚本，把「抓取 → 组装 → 推送」一条龙封死：

```python
# morning_brief.py 核心逻辑
def get_weather():
    return curl("https://wttr.in/Nanjing?format=%C+%t+%h")

def get_news():
    data = json.loads(curl("https://api.zhihu.com/topstory/hot-list?limit=6"))
    return [item["target"]["title"] for item in data["data"][:6]]

def push(msg):
    subprocess.run([HERMES_CMD, "send", "--to", WX_TARGET, "--quiet", msg])
```

这里又踩了一个 Windows 特有的坑：**Python 子进程里找不到 `hermes` 命令**（PATH 和 shell 环境不同），必须用 `.cmd` 启动器的绝对路径 + `shell=True`。

数据源也试了两个：60 秒读世界 API 返回 error 1027（挂了），换成知乎热榜才稳定。

脚本手动跑通后，配上定时任务（每天 07:30）：

```bash
python morning_brief.py   # exit=0，微信收到早报 ✅
```

---

## 六、开机自启：和 schtasks 的最后决战

网关是前台进程，电脑重启就没了。要开机自启，绕不开 schtasks。这里遇到最尴尬的问题：连我在工作台里都执行不了 schtasks（安全黑名单），而用户自己在 CMD 里敲 `hermes`，居然也报「不是内部或外部命令」。

原因：Hermes 装在 WorkBuddy 的私有目录，只在工作台的终端里被加进 PATH，普通 CMD 不知道。

**解法**：把目录加进用户级 PATH：

```powershell
$target = 'C:\Users\13067\.workbuddy\binaries\node\versions\22.22.2-6'
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
[Environment]::SetEnvironmentVariable('Path', $userPath + ';' + $target, 'User')
```

**关掉旧 CMD，开新窗口**，然后：

```cmd
hermes gateway install
```

Hermes 会创建名为 `Hermes_Gateway` 的计划任务：登录后延迟 30 秒启动、崩溃后每分钟重启（最多 999 次）。如果权限不足，它会自动降级到「启动文件夹 + VBS」方案——这是源码里自带的 fallback。

---

## 七、复盘：这一路教会我的事

| 坑 | 根因 | 通用解法 |
|---|---|---|
| uv 下载超时 | 依赖固定指向 GitHub | 读懂脚本缓存逻辑，预置文件绕过 |
| 源码拉取僵死 | 网络 + git checkout 卡壳 | 验证数据完整性后手动接管收尾 |
| setup 无视 marker | isReady 检查 venv 产物 | 绕过 UI 层，直接调底层脚本 |
| 依赖包超时 | 单包 CDN 抖动 | 镜像补装 + 缓存重跑 |
| schtasks 拦截 | 沙箱安全策略 | 前台网关 attach / 直接调 API 函数 |
| open 策略拒绝启动 | 防滥用保护 | 显式开启 allow-all 开关 |
| send 找不到 token | 独立进程不读 accounts | 凭据同步写进 .env |
| CMD 找不到 hermes | 私有目录不在 PATH | 加用户级 PATH，重启终端 |

**贯穿全程的方法论**：

1. **读源码是最快的排障手段**。这些坑的错误信息大多是「结果」而非「原因」，只有回到源码才能看到真正的判断逻辑。
2. **UI 层卡住时找底层 API**。向导、CLI 命令往往附带额外检查，直接调核心函数能干净绕行。
3. **完整性验证再接管**。数据下载了一半不知道能不能用？先看 SHA、看 pack 索引——验证了再动手，比盲目重试高效得多。
4. **每个坑都值得记录**。这篇博客本身就是最好的证明：当时的绝望和最终的解法，隔着的只是「再读一遍源码」的耐心。

---

## 结语

现在，这只「信使」在我的机器上稳定运行：微信私信随时能聊，每天早上 7:30 准时推送天气和新闻。它记着我们的对话，会攒技能，像一个真正住在电脑里的数字助手。

如果你也想养一只，希望这篇踩坑实录能让你少熬几个夜。技术路上没有白走的弯路——每一个坑，最后都变成了文章里的一行经验。

*（本文是个人实践记录，涉及的工具均为开源项目，具体行为以官方最新文档为准。）*
