---
title: Scrapy 架构深度解析：每个文件在框架中扮演什么角色
published: 2026-07-24
description: 以 PDF 批量下载项目为实例，逐文件拆解 Scrapy 项目结构（settings.py、spider、middlewares、pipelines、items），解释引擎-调度器-下载器-爬虫-管道五层架构的协作原理。
image: ""
tags: [Python, Scrapy, 架构, 框架设计, 中间件]
category: 技术原理
draft: false
lang: zh-CN
---

## 前言

上手 Scrapy 最快的方式是 `scrapy startproject` 然后 `scrapy genspider`。但生成的那一堆文件——`settings.py`、`middlewares.py`、`pipelines.py`、`items.py`——到底是干什么的？为什么需要这么多文件？

本文以一个真实的 PDF 批量下载项目为例，逐文件拆解 Scrapy 的项目结构，讲清楚每个文件在框架中的角色和调用时机。

## Scrapy 五层架构

在讲具体文件之前，先理解 Scrapy 的整体架构：

```
┌──────────────────────────────────────────────────────┐
│                   Scrapy Engine（引擎）                │
│          控制所有组件之间的数据流，触发事件处理          │
└────┬──────────┬─────────────┬───────────┬────────────┘
     │          │             │           │
     ▼          ▼             ▼           ▼
┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐
│Scheduler│ │Downloader│ │ Spiders  │ │Item Pipeline │
│（调度器） │ │（下载器） │ │（爬虫）   │ │（项目管道）   │
└─────────┘ └─────────┘ └──────────┘ └──────────────┘
                  │
                  ▼
           ┌──────────────┐
           │  Middlewares  │ ← 可插拔的钩子链
           │  （中间件）    │
           └──────────────┘
```

### 一个请求的完整生命周期

```
1. Spider 产生 Request
       │
       ▼
2. Engine 把 Request 交给 Scheduler 排队
       │
       ▼
3. Scheduler 按策略出队，交还给 Engine
       │
       ▼
4. Engine 把 Request 发给 Downloader
       │  ┌─── Downloader Middlewares（处理请求头、代理、重试等）
       │  └─── 实际发起 HTTP 请求
       ▼
5. Downloader 返回 Response
       │
       ▼
6. Engine 把 Response 发回 Spider
       │  └─── Spider 的 parse() / save_pdf() 被回调
       │       产出的新 Request → 回到步骤 1（递归循环）
       │       产出的 PDF 文件 → 写入磁盘
       ▼
7. 循环直到没有新 Request
```

## 逐文件拆解

### 1. `scrapy.cfg` — 入口标识

```ini
[settings]
default = pdf_downloader.settings

[deploy]
project = pdf_downloader
```

**角色：告诉 scrapy 命令行"这是项目根目录，settings 在哪"。**

- 执行 `scrapy crawl pdf_spider` 时，框架首先读这个文件定位配置模块
- `[deploy]` 段用于 `scrapyd` 远程部署
- **类比**：就像 `package.json` 之于 Node.js 项目

### 2. `settings.py` — 依赖注入容器

```python
BOT_NAME = "pdf_downloader"
SPIDER_MODULES = ["pdf_downloader.spiders"]
DOWNLOAD_DELAY = 1
CONCURRENT_REQUESTS = 4
DEPTH_LIMIT = 5
RETRY_TIMES = 3
```

**角色：全局参数注入点，每个组件初始化时都从这里读取自己的配置。**

| 配置项 | 被哪个组件读取 | 作用 |
|--------|:---:|---|
| `USER_AGENT` | Downloader | 设置 HTTP 请求头 |
| `DOWNLOAD_DELAY` | Downloader | 控制请求速率 |
| `CONCURRENT_REQUESTS` | Engine → Downloader | 控制并发数 |
| `DEPTH_LIMIT` | Engine → Scheduler | 限制递归深度 |
| `RETRY_TIMES` | RetryMiddleware | 失败重试次数 |
| `LOG_FILE` | Logging 系统 | 日志输出路径 |

没有 `settings.py`，所有配置回退到 Scrapy 默认值：单域名并发 8、无延迟、无深度限制——在爬取别人服务器时这是危险的。

### 3. `spiders/pdf_spider.py` — 唯一手写的核心

```python
class PdfSpider(scrapy.Spider):
    name = "pdf_spider"                         # ① 注册标识
    allowed_domains = ["example.com", ...]       # ② 域名白名单
    start_urls = ["https://...", ...]           # ③ 起始入口

    def parse(self, response):                  # ④ HTML 解析回调
        ...
        yield Request(url, callback=self.parse) # 递归
        yield Request(url, callback=self.save_pdf)  # 下载

    def save_pdf(self, response):               # ⑤ PDF 保存回调
        ...
```

#### 3.1 `name` — 爬虫注册标识

`scrapy crawl pdf_spider` → 命令行扫描 `SPIDER_MODULES` 包下所有类 → 找到 `name == "pdf_spider"` → 实例化启动。

#### 3.2 `allowed_domains` — 安全护栏

这不是你自己手动检查的。Scrapy 内置的 **OffsiteMiddleware** 会**在框架层面**拦截不在白名单内的请求：

```python
# Scrapy 内部伪代码
class OffsiteMiddleware:
    def process_spider_output(self, result, spider):
        for request in result:
            if not matches(request.url, spider.allowed_domains):
                continue  # ← 丢弃，根本不会发出去
            yield request
```

#### 3.3 `parse()` — 回调驱动的递归核心

Scrapy 是**回调驱动**的异步模型：

```
start_urls
  │  callback=parse
  ▼
parse() 发现 HTML 链接 → Request(url, callback=parse)    ← 递归
parse() 发现 PDF 链接  → Request(url, callback=save_pdf) ← 终结点
```

每个 `Response` 到达时，框架回调对应的 callback 方法。这就是一个**树状遍历**——从根节点出发，自动沿 HTML 链接展开。

### 4. `middlewares.py` — 可插拔钩子链

```python
# 自定义中间件（本任务未使用）
class PdfDownloaderDownloaderMiddleware:
    def process_request(self, request, spider):
        # Request 发出前
        return None  # None = 继续传递

    def process_response(self, request, response, spider):
        # Response 返回后
        return response
```

**Scrapy 自带中间件才是主角**——本任务一行自定义中间件没写，全靠内置：

| 内置中间件 | 类型 | 自动做了什么 |
|-----------|------|-------------|
| `RetryMiddleware` | Downloader | 503 → 自动重试 3 次 |
| `RedirectMiddleware` | Downloader | 301 → 自动跟随到新 URL |
| `UserAgentMiddleware` | Downloader | 附加 `USER_AGENT` header |
| `HttpCompressionMiddleware` | Downloader | 自动解压 gzip/deflate |
| `OffsiteMiddleware` | Spider | 过滤 `allowed_domains` 外的请求 |
| `DepthMiddleware` | Spider | 超过 `DEPTH_LIMIT` 的请求直接丢弃 |
| `HttpErrorMiddleware` | Spider | 处理 4xx/5xx 错误 |

**请求流经 Downloader Middleware 的顺序：**

```
Request: Engine → (DM1 → DM2 → DM3) → 互联网
Response: 互联网 → (DM1 ← DM2 ← DM3) → Engine → Spider
```

### 5. `pipelines.py` — 数据处理管道

```python
class PdfDownloaderPipeline:
    def process_item(self, item, spider):
        return item  # 默认透传
```

**角色：Spider 产出 Item 后的后处理器链。**

每个 Item 依次经过所有启用的 Pipeline：

```
Spider yield Item → Pipeline A → Pipeline B → Pipeline C → 最终存储
```

本任务没有用 Pipeline，因为在 `save_pdf()` 里直接 `open().write()` 写文件更直观。如果改用 `FilesPipeline`，可以让框架统一处理下载、重命名、去重。

### 6. `items.py` — 结构化数据容器

```python
class PdfDownloaderItem(scrapy.Item):
    pass  # 本任务未使用
```

**角色：带字段类型声明的字典。**

典型用法是定义字段后在 `parse()` 中 `yield PdfItem(...)`，Item 经过 Pipeline 链处理后写入数据库。本任务因为不涉及"结构化存储"，所以没有用 Item。

## 各文件协作全景

```
scrapy crawl pdf_spider
        │
        ▼
┌─ scrapy.cfg ──────────────── 找到 settings 位置
        │
        ▼
┌─ settings.py ─────────────── 注入全局参数
        │
        ▼
┌─ Engine 启动 ─────────────── 初始化 Scheduler + Downloader
        │
        ▼
┌─ pdf_spider.py ───────────── 业务逻辑
│   ├── start_requests()          14 个初始 Request
│   ├── parse()                   解析 HTML，递归
│   └── save_pdf()                保存 PDF
        │
   每个 Request 经过 ↓
        │
┌─ middlewares.py (内置) ────── Offsite → Depth → Retry → Redirect
        │
        ▼
┌─ Downloader ───────────────── 实际 HTTP 请求
        │
        ▼
┌─ Response → Spider callback ── 循环直到没有新 URL
        │
        ▼
┌─ crawl_jobdir/ ────────────── 中断恢复
```

## 总结

| 文件 | 角色 | 本任务用了没 |
|------|------|:---:|
| `scrapy.cfg` | 入口标识 | ✅ |
| `settings.py` | 依赖注入容器（全局参数） | ✅ 配置 10+ 项 |
| `pdf_spider.py` | 核心业务逻辑 | ✅ 唯一手写 |
| `middlewares.py` | 拦截器链（内置足够） | 内置自动运行 |
| `pipelines.py` | 后处理器链 | ❌ 直接写文件 |
| `items.py` | 结构化数据模型 | ❌ 不需要入库 |

关键认知：**我只写了一个文件（spider），其余能力全是框架内置中间件免费提供的。** 框架不等于库——框架接管了控制流，你只在指定的回调点插入业务逻辑。
