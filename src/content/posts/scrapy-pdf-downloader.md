---
title: 用 Scrapy 批量下载网站 PDF：从 14 个索引页到 3176 份文件
published: 2026-07-24
description: 从多个 HTML 索引页面出发，递归爬取目标域名下的所有 PDF 文件，最终下载 3176 个 PDF（1.8GB）。详解 Scrapy 爬虫设计思路、Content-Type 过滤、非 HTML 扩展名跳过、JOBDIR 持久化等实战技巧。
image: ""
tags: [Python, Scrapy, 爬虫, PDF, 数据采集]
category: 技术实践
draft: false
lang: zh-CN
---

## 需求背景

手头有一个 txt 文件，里面是 14 个目标网站的索引页面 URL。这些页面本身不是 PDF，而是**含大量 PDF 链接的索引页面**。目标是把它们背后的所有 PDF 文件全部下载到本地。

## 为什么选 Scrapy

| 需求 | Scrapy 内置方案 | 自己写 requests 循环 |
|------|:---:|:---:|
| 异步并发 | Twisted 异步引擎 | 需手动 asyncio + aiohttp |
| URL 去重 | `RFPDupeFilter` 自动过滤 | 需自维护 Set/Bloom |
| 递归爬取 | `start_urls` → `yield Request` | 需自写 BFS/DFS |
| 重试机制 | `RETRY_TIMES=3` 自动重试 | 需自己写装饰器 |
| 速率控制 | `DOWNLOAD_DELAY` + `AUTOTHROTTLE` | 需手动 sleep |
| 中断恢复 | `JOBDIR` 持久化队列 | 需自建断点续传 |
| 域名过滤 | `OffsiteMiddleware` 自动拦截 | 需每个请求检查 |

**结论：Scrapy 不是一个简单的 HTTP 库，而是一个爬虫框架。框架帮你处理了 90% 的工程细节，你只写业务逻辑。**

## 爬虫设计

### 整体思路

```
14 个起始 URL
     │
     ▼
parse() — 解析 HTML，提取所有 <a href="...">
     │
     ├── .pdf 结尾 ──→ save_pdf() 直接下载
     │
     ├── 非 HTML 扩展名 (.jpg/.css/.js等) ──→ 跳过
     │
     └── 其他 HTML ──→ parse() 递归（最大深度 5 层）
```

### 核心代码

```python
class PdfSpider(scrapy.Spider):
    name = "pdf_spider"
    allowed_domains = [...]  # 目标域名白名单

    # 跳过这些非 HTML 扩展名，避免无效请求和解析异常
    NON_HTML_EXTENSIONS = {
        ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg",
        ".css", ".js", ".zip", ".doc", ".docx", ".mp3", ".mp4",
    }

    def parse(self, response):
        # ① Content-Type 检查：非 HTML 直接跳过
        content_type = response.headers.get("Content-Type", b"").decode("utf-8")
        if "text/html" not in content_type:
            if "application/pdf" in content_type:
                return self.save_pdf(response)  # 意外 PDF 也保存
            return

        # ② 提取所有链接
        links = response.css("a::attr(href)").getall()

        for link in links:
            absolute_url = urljoin(response.url, link)

            if absolute_url.lower().endswith(".pdf"):
                yield Request(absolute_url, callback=self.save_pdf)
            else:
                ext = os.path.splitext(urlparse(absolute_url).path)[1]
                if ext not in self.NON_HTML_EXTENSIONS:
                    yield Request(absolute_url, callback=self.parse)

    def save_pdf(self, response):
        filename = self._get_filename(response.url)
        with open(f"output_dir/{filename}", "wb") as f:
            f.write(response.body)
```

### 关键配置

```python
# settings.py
CONCURRENT_REQUESTS = 4            # 全局并发
CONCURRENT_REQUESTS_PER_DOMAIN = 2 # 每个域名最多 2 并发
DOWNLOAD_DELAY = 1                 # 请求间隔 1 秒（尊重服务器）
RANDOMIZE_DOWNLOAD_DELAY = True    # 随机化延迟
RETRY_TIMES = 3                    # 失败自动重试 3 次
DEPTH_LIMIT = 5                    # 最大递归深度
DOWNLOAD_TIMEOUT = 60              # 60 秒超时
```

## 踩坑记录

### 坑 1：`NotSupported: Response content isn't text`

**现象**：爬虫运行一段时间后大量报错。

**原因**：某些 URL 返回的是二进制（PDF、图片），但被 `parse()` 当作 HTML 调用了 `response.css()`。

**解决**：在 `parse()` 开头检查 `Content-Type` header，非 HTML 直接跳过。

### 坑 2：无意义请求过多

**现象**：爬虫在下载 `.jpg`、`.css` 等无用资源。

**原因**：没有在链接层面过滤非 HTML 资源的扩展名。

**解决**：添加 `NON_HTML_EXTENSIONS` 集合，在生成新 Request 前过滤掉。

### 坑 3：同名文件冲突

**现象**：不同目录下有同名 PDF（如多个站点都有 `01a.pdf`）。

**解决**：写入前检查文件是否存在，存在则追加 `_1`、`_2` 后缀。

## 运行结果

| 指标 | 数值 |
|------|------|
| 下载 PDF 数量 | **3,176** |
| 总文件大小 | **1.8 GB** |
| 爬取页面数 | 7,847 |
| 成功响应 | 7,802 |
| 运行时长 | ~10 小时 |
| 平均速度 | ~50 页/分钟 |
| 403 错误 | 332（被拒页面，不影响下载） |
| 最大递归深度 | 5 层 |

## 项目结构

```
project/
├── urls.txt                      ← 起始 URL 列表
├── pdf_downloader/               ← Scrapy 项目
│   ├── scrapy.cfg
│   └── pdf_downloader/
│       ├── settings.py           ← 全局配置
│       └── spiders/
│           └── pdf_spider.py     ← 爬虫核心逻辑（唯一手写文件）
├── crawl_jobdir/                 ← JOBDIR 持久化队列
├── scrapy_log.txt                ← 运行日志
└── *.pdf                         ← 下载的所有 PDF
```

## 总结

这个任务的本质是**从一个种子集合出发，沿着链接图做受限遍历**。Scrapy 用 5 个内置中间件（Offsite、Depth、Retry、Redirect、UserAgent）和 20 行配置覆盖了所有工程细节，你只需要在 `parse()` 和 `save_pdf()` 两个回调里写业务逻辑。这就是"框架"和"库"的区别。
