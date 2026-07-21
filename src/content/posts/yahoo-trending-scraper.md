---
title: 全异步 Yahoo 热门新闻爬虫：模块化架构与三路数据输出实践
published: 2026-07-21
description: 详解一个基于 Python asyncio + Playwright + Kafka 的 Yahoo Trending 新闻爬虫，涵盖双引擎降级策略、7种选择器链、asyncio 与同步 requests 混用方案，以及本地 JSON、Kafka、ODS 三路并行数据输出设计。
image: ""
tags: [Python, 爬虫, asyncio, Playwright, Kafka, Pydantic, APScheduler]
category: 技术实践
draft: false
lang: zh-CN
---

## 项目背景

继 Google Trends 爬虫之后，我们需要采集的第二个数据源是 Yahoo 热门新闻（`yahoo.com/trending/`）。相比 Google Trends 项目的单文件同步架构，这个项目从设计之初就选择了**全异步 + 模块化**的路线。

驱动这个决策的核心需求是：

1. **多路数据输出**：数据需要同时写入本地文件（离线备份）、Kafka（实时流处理）和 ODS HTTP 接口（内部数据管道），三路互不干扰
2. **异步兼容性**：Playwright 的异步 API 与 asyncio 原生集成，可以充分利用事件循环的并发能力
3. **配置可维护性**：目标和源之间的环境差异（代理、端点、超时）需要通过配置文件管理，而不是硬编码

---

## 项目结构

```
yahoo/
├── src/
│   ├── main.py                  ← 程序入口（argparse + asyncio）
│   ├── scheduler/
│   │   └── scheduler.py         ← AsyncIOScheduler 调度器
│   ├── scraper/
│   │   └── yahoo_scraper.py     ← 双引擎爬虫（httpx + Playwright）
│   ├── http_pusher/
│   │   └── pusher.py            ← ODS HTTP 推送
│   ├── kafka_producer/
│   │   └── producer.py          ← Kafka 消息发布
│   └── storage/
│       └── file_writer.py       ← 本地 JSON 持久化
├── config/
│   ├── settings.yaml            ← 所有配置（Pydantic v2 加载）
│   └── settings.py              ← Pydantic 配置类定义
├── data/                        ← 运行时数据输出
└── logs/                        ← loguru 日志
```

这种分包结构让每个模块的职责边界非常清晰，新增一种数据输出目标只需添加一个新的 `output/` 子模块，不影响其他模块。

---

## 技术栈

| 分类 | 库 / 版本 |
|------|-----------|
| 运行时 | Python 3.8+（asyncio） |
| HTTP 爬取 | httpx[socks] ≥ 0.28（异步，支持代理） |
| JS 渲染 | Playwright ≥ 1.48（async_playwright，headless Chromium） |
| HTML 解析 | BeautifulSoup4 + lxml |
| 配置管理 | Pydantic v2 + pydantic-settings + PyYAML |
| 日志 | loguru（彩色输出、自动轮转、gzip 压缩） |
| 调度 | APScheduler `AsyncIOScheduler` + CronTrigger |
| 消息队列 | kafka-python（acks=all，gzip 压缩） |
| ODS 推送 | requests（同步，通过 run_in_executor 适配异步） |
| JSON 序列化 | orjson（高性能） |

---

## 完整数据流

```
① 调度触发（每小时整点）
   AsyncIOScheduler.CronTrigger("0 * * * *")
          ↓
② 爬取 HTML（双引擎策略）
   YahooTrendingScraper.scrape()
   ├─ 主引擎：async_playwright（headless Chromium + 代理）
   │   goto("https://www.yahoo.com/trending/")
   │   等待 networkidle，滚动加载 ~100 条
   └─ 回退：httpx（纯 HTTP，仅 ~20 条静态内容）
          ↓
③ HTML 解析（7种选择器降级链）
   YahooTrendingParser.parse()
   → 提取 rank / title / url / category
   → 构造 TrendingItem 对象列表
          ↓
④ 三路并行输出
   ├─ TrendingFileWriter.save()        → data/YYYY-MM-DD/trending_HHMMSS.json
   ├─ TrendingKafkaProducer.send_batch()  → topic: yahoo_trending_news
   └─ YahooOdsPusher.push_batch()      → ODS HTTP 端点（POST）
```

---

## 技术亮点深度解析

### 亮点一：双引擎爬取策略——httpx 与 Playwright 互为备份

Yahoo 热门页面是一个典型的 JS 渲染页面：大部分内容通过 JavaScript 动态加载，纯 HTTP 请求只能获取约 20 条静态内容；完整的 ~100 条需要等待 JS 执行完成后再滚动加载剩余内容。

项目采用"主引擎 + 回退"的双引擎策略：

```python
async def scrape(self) -> list[TrendingItem]:
    """
    优先使用 Playwright（完整 JS 渲染），
    若 Playwright 失败则回退到 httpx（快速但内容不完整）。
    """
    if self.config.force_playwright:
        try:
            html = await self._fetch_with_playwright()
        except Exception as e:
            logger.warning(f"Playwright 失败，回退到 httpx: {e}")
            html = await self._fetch_with_httpx()
    else:
        html = await self._fetch_with_httpx()

    return self.parser.parse(html)
```

Playwright 负责完整渲染，httpx 作为降级保底，确保即使浏览器引擎出现异常，服务也能以降级模式继续工作，而不是完全中断。

---

### 亮点二：7 种 CSS 选择器降级链——应对页面结构变更

Yahoo 的页面 DOM 结构并不稳定，前端改版时选择器可能随时失效。项目在 `YahooTrendingParser` 中实现了 7 种选择器策略的降级链，从最精确到最通用依次尝试：

```python
SELECTOR_STRATEGIES = [
    # 策略 1：最精确，基于稳定的 story ID 属性
    {"container": "div[id^='storyline-']", "title": "h3", "link": "a"},
    # 策略 2：基于语义化 article 标签
    {"container": "article.story", "title": "h3.title", "link": "a.title-link"},
    # 策略 3：基于 stream 容器
    {"container": "li.stream-item", "title": "h3", "link": "a"},
    # 策略 4：通用卡片选择器
    {"container": "div.Ov\\(h\\)", "title": "h3", "link": "a"},
    # 策略 5：基于 data 属性
    {"container": "[data-test-locator='stream-item']", "title": "h3", "link": "a"},
    # 策略 6：最宽泛的 article 标签
    {"container": "article", "title": "h3,h2", "link": "a[href*='yahoo.com']"},
    # 策略 7：终极兜底
    {"container": "li", "title": "h3,h2,h1", "link": "a[href*='yahoo.com']"},
]

def parse(self, html: str) -> list[TrendingItem]:
    soup = BeautifulSoup(html, 'lxml')
    for strategy in SELECTOR_STRATEGIES:
        items = self._try_parse(soup, strategy)
        if len(items) >= 5:   # 至少解析到 5 条才认为成功
            logger.info(f"选择器策略成功: {strategy['container']}, 解析到 {len(items)} 条")
            return items
    logger.error("所有选择器策略均失败，返回空列表")
    return []
```

这种"多策略降级"模式比"单一选择器"更具韧性，Yahoo 改版时只需在策略链头部插入新策略，无需修改其他逻辑。

---

### 亮点三：asyncio 与同步 requests 的优雅混用

项目全程使用 asyncio，但 ODS 推送模块复用了与 `google_trends_o` 相同的同步 `requests` 代码（为了保持两个项目的推送逻辑一致，便于统一维护）。

直接在异步函数中调用同步阻塞代码会冻结整个事件循环。解决方案是通过 `loop.run_in_executor()` 将同步调用卸载到线程池：

```python
async def _push_to_ods_async(self, items: list[TrendingItem]) -> None:
    """
    将同步的 ODS 推送操作卸载到线程池，避免阻塞 asyncio 事件循环。

    注：asyncio.to_thread() 是 Python 3.9+ 的语法，
    项目需兼容 Python 3.8，故使用 run_in_executor。
    """
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,                          # 使用默认线程池
        self.pusher.push_batch,        # 同步函数
        items                          # 参数
    )
```

这个方案优雅地解决了两个约束的冲突：
- 代码复用（与 google_trends_o 共享推送逻辑）
- 异步兼容（不阻塞 asyncio 事件循环）
- Python 版本兼容（兼容 3.8，不使用 3.9+ 的 `asyncio.to_thread`）

---

### 亮点四：AsyncIOScheduler 与事件循环的原生集成

与 `google_trends_o` 使用 `BackgroundScheduler`（在独立线程中运行）不同，这个项目使用 `AsyncIOScheduler`，它与 asyncio 事件循环原生集成：

```python
class TrendingScheduler:
    def __init__(self, scrape_fn, output_fns: list):
        self.scheduler = AsyncIOScheduler()
        self.scheduler.add_job(
            func=self._scrape_and_publish,
            trigger=CronTrigger.from_crontab("0 * * * *"),  # 每小时整点
            id='yahoo_trending_hourly',
            max_instances=1,
            misfire_grace_time=300,
        )

    async def _scrape_and_publish(self):
        items = await self.scrape_fn()
        # 三路并行输出
        await asyncio.gather(
            self.file_writer.save(items),
            self._push_to_kafka(items),
            self._push_to_ods_async(items),
        )
```

`asyncio.gather()` 将三路输出并发执行——文件写入、Kafka 发布、ODS 推送三者同时进行，总耗时取决于最慢的那一路，而不是三路之和。

---

### 亮点五：Pydantic v2 配置管理——环境变量覆盖 YAML

项目的配置通过 Pydantic v2 + `pydantic-settings` 管理，支持 YAML 文件和环境变量两种来源，环境变量优先级更高：

```python
# config/settings.py
class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(
        yaml_file="config/settings.yaml",
        env_prefix="YAHOO_TRENDING__",
        env_nested_delimiter="__",
    )
    scraper: ScraperConfig
    kafka: KafkaConfig
    ods_push: OdsPushConfig
    scheduler: SchedulerConfig
```

这意味着可以在不修改 `settings.yaml` 的情况下，通过环境变量覆盖任意配置：

```bash
# 通过环境变量切换 Kafka Broker 地址（无需修改配置文件）
export YAHOO_TRENDING__KAFKA__BOOTSTRAP_SERVERS="10.0.0.1:9092"

# 禁用 Kafka 输出（调试时只保留本地文件）
export YAHOO_TRENDING__KAFKA__ENABLED="false"
```

这在 Docker / Kubernetes 部署场景中非常有用——镜像不变，通过注入环境变量适配不同环境（开发/测试/生产）。

---

### 亮点六：Pending 缓存机制——与 google_trends_o 对齐的数据零丢失方案

两个项目共享同一套 ODS 推送端点，也共享同一套 Pending 缓存机制设计（但目录独立）：

```python
# Yahoo 的 pending 目录与 google_trends_o 独立
_PENDING_DIR = Path(_BASE_DIR) / 'pending_push' / 'yahoo'

def _flush_pending(self) -> None:
    """重推历史失败文件，成功后删除。"""
    for fpath in sorted(_PENDING_DIR.glob('pending_*.json')):
        rows = json.loads(fpath.read_text(encoding='utf-8'))
        ok = self._post_batch(rows, _skip_flush=True)
        if ok:
            fpath.unlink()
```

两个项目目录分离的好处是：一个项目的积压不会影响另一个，重推时也不会混入对方的数据格式。

---

### 亮点七：优雅停机——SIGINT/SIGTERM 信号处理

服务需要支持优雅停机（graceful shutdown），确保在进程收到停止信号时：
1. 停止调度器，不再触发新任务
2. 等待当前正在执行的爬取任务完成
3. 关闭 Kafka Producer，flush 所有未发送消息
4. 退出进程

```python
async def main():
    stop_event = asyncio.Event()

    def _handle_signal():
        logger.info("收到停止信号，正在优雅停机...")
        stop_event.set()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_signal)

    scheduler = TrendingScheduler(...)
    scheduler.start()

    await stop_event.wait()   # 阻塞直到收到信号

    scheduler.shutdown(wait=False)
    kafka_producer.close()    # flush 未发送消息
    logger.info("停机完成")
```

`wait=False` 让调度器立即停止调度，但不会强制中断当前正在执行的任务（因为任务本身是 asyncio 协程，由事件循环管理）。

---

## 启动方式

```bash
# 安装依赖
pip install -r requirements.txt
playwright install chromium

# 持续运行（每小时整点自动触发）
python src/main.py

# 立即执行一次后退出（适合手动调试或 cron 外部调度）
python src/main.py --once
```

**Windows 任务计划注册（开机自启）：**

```powershell
powershell -ExecutionPolicy Bypass -File register_task.ps1
```

---

## 与 google_trends_o 的横向对比

| 维度 | google_trends_o | yahoo_trending |
|------|----------------|----------------|
| 架构风格 | 单文件 / 同步 | 模块化分包 / 全异步 |
| 触发方式 | HTTP API 驱动 + 定时兜底 | 纯 Cron 自动调度 |
| 调度实现 | `BackgroundScheduler`（线程） | `AsyncIOScheduler`（事件循环） |
| 代理支持 | 无 | 有（HTTP 代理） |
| 数据输出 | MySQL + ODS 推送 | 本地 JSON + Kafka + ODS 推送 |
| ODS 端点 | 相同 | 相同（task 参数不同） |
| 配置管理 | 文件顶部硬编码 | Pydantic v2 + YAML + 环境变量 |
| 日志框架 | Python logging | loguru（彩色、轮转、gzip） |

两个项目在 ODS 推送层面高度对齐（相同的端点格式、相同的 34 字段行结构、相同的 Pending 缓存机制），便于统一运维和监控。

---

## 总结

Yahoo Trending 爬虫项目展示了如何在生产级爬虫中处理几个典型的工程挑战：

- **双引擎降级**解决了 JS 渲染页面的爬取可靠性问题
- **7 种选择器链**让爬虫对页面改版具有较强的容错能力
- **run_in_executor**优雅地在异步代码中复用了同步库，避免了代码重写
- **Pydantic v2 配置**使得同一套代码可以无缝适配不同的部署环境
- **asyncio.gather 三路并行输出**最大化了数据输出的吞吐效率

这套架构模式——异步调度 + 双引擎爬取 + 多路并行输出 + 配置注入——可以作为类似数据采集服务的参考模板复用。
