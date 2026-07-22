---
title: 从零构建 Google Trends 爬虫 API：单文件架构的工程实践
published: 2026-07-21
description: 详解一个基于 Flask + Playwright 的 Google Trends 热搜数据采集服务，涵盖双解析策略降级、指数退避重试、Pending 离线缓存、假成功防御等生产级工程实践。
image: ""
tags: [Python, 爬虫, Playwright, Flask, APScheduler, 数据采集]
category: 技术实践
draft: false
lang: zh-CN
---

## 项目背景

在数据运营场景中，实时获取 Google Trends 热搜榜单是一项高频需求。官方没有公开稳定的数据接口，这意味着我们需要自己动手爬取。

这个项目的目标是：**将 Google Trends 的热搜数据采集能力封装成一个可对外调用的 REST API 服务**，支持 US、TW、JP、PH 四个地区，自动每小时定时采集，并将数据推送到内部 ODS（Operational Data Store）数据管道，同时提供 MySQL 持久化备份。

整个项目只有一个文件：`google_trends_api.py`，约 1900 行代码。这种单文件架构在小型数据服务中有其独特价值——部署简单、依赖清晰、便于运维。

---

## 技术栈一览

| 分类 | 库 / 版本 |
|------|-----------|
| Web 框架 | Flask 3.1.0 |
| 浏览器自动化 | Playwright 1.49.0（headless Chromium） |
| 数据库 | mysql-connector-python 9.1.0 |
| HTTP 客户端 | requests 2.32.3 |
| 定时调度 | APScheduler（BackgroundScheduler + CronTrigger） |
| 日志 | Python 内置 logging（rotating file + stderr） |

---

## API 接口设计

服务默认监听 `http://0.0.0.0:5050`，提供以下四个端点：

```
POST /api/crawl?geo=US&hours=4&max_retries=3   → 单地区爬取
POST /api/crawl/all                             → 全部配置地区批量爬取
GET  /api/status                                → 上次爬取汇总（健康检查）
GET  /api/trends?geo=US&limit=100               → 查询已存储趋势数据
```

调用示例：

```bash
# 爬取美国地区过去 4 小时热搜
curl -X POST "http://localhost:5050/api/crawl?geo=US&hours=4"

# 一键批量爬取所有配置地区
curl -X POST "http://localhost:5050/api/crawl/all"

# 查看健康状态
curl "http://localhost:5050/api/status"
```

成功响应结构：

```json
{
  "success": true,
  "geo": "US",
  "items_fetched": 140,
  "rows_saved": 140,
  "push_result": {
    "total": 140,
    "pushed": 140,
    "failed": 0
  }
}
```

---

## 数据采集流程

整个采集链路分为六个阶段：

```
① HTTP 请求触发
   POST /api/crawl?geo=US&hours=4
          ↓
② 参数校验
   geo 是否在 {US, TW, JP, PH}
   hours 是否在 {4, 24}
   max_retries 是否在 0~10
          ↓
③ 浏览器爬取（Playwright headless Chromium）
   访问 trends.google.com.hk/trending?geo=US&hours=24
   等待 tr[data-row-id] 渲染完成
   滚动加载（最多 30 次，连续 3 轮无新增则停止）
   逐行提取 inner_text
          ↓
④ 数据构建（_build_row）
   MD5(url|gather_time_ms|rank|title) → mid
   MD5(domain without www)            → site_id
   MD5(mid + site_id)                 → 复合主键 id
   生成 34 字段标准行
          ↓
⑤ ODS 推送（push_to_server_api）
   先重试历史失败文件 (_flush_pending_rows)
   按 BATCH_SIZE=50 分批 POST 到 ODS 端点
   校验业务层响应（防假成功）
   失败时写入 pending_push/google_trends/
          ↓
⑥ MySQL 持久化（可选）
   INSERT IGNORE → google_trends.trending_searches
```

---

## 技术亮点深度解析

### 亮点一：双解析策略——从 RPC 拦截到 DOM 爬取的降级演进

Google Trends 的数据获取方式并非一成不变。最初，趋势数据通过 Google 内部 `batchexecute` RPC 接口以 JSON 形式传输，可以通过拦截网络响应中的 `DqDTgb` sentinel 字符串来解析原始数据：

```python
def _parse_trend_response(raw_text: str) -> list[dict]:
    """解析 batchexecute RPC 响应中的趋势数据（旧版 Google 接口）"""
    sentinel = 'DqDTgb'
    idx = raw_text.find(sentinel)
    if idx == -1:
        return []
    # 截取 JSON 载荷并反序列化
    ...
```

然而，Google 将趋势数据页面迁移为纯 DOM 渲染后，这条路径失效了。项目随即切换为 DOM 滚动爬取策略，通过 `tr[data-row-id]` 选择器直接读取渲染后的 HTML 元素：

```python
def _parse_dom_row(row_element) -> dict | None:
    """解析 DOM 渲染的热搜行（新版 Google Trends 页面）"""
    title = row_element.query_selector('div.title-and-articles > div.title')
    searches = row_element.query_selector('div.search-count-title')
    ...
```

两套解析器均保留在代码中。这体现了一种重要的工程思维：**不要因为主路径工作正常就删掉备用路径**，因为外部平台的接口随时可能再次变更。

---

### 亮点二：主动防御"假成功"问题

这是生产系统中非常容易踩的坑：HTTP 状态码 200 并不代表业务成功。ODS 端点有时会在数据校验失败时依然返回 HTTP 200，但响应体中 `code` 不等于 `"200"`。

项目实现了 `_evaluate_push_response()` 进行业务层的二次校验：

```python
def _evaluate_push_response(response_json: dict, batch_size: int) -> tuple[bool, str]:
    """
    在 HTTP 200 之上再校验 ODS 业务层响应。
    ODS 在数据校验失败时仍返回 HTTP 200，必须检查业务字段。
    """
    code = str(response_json.get('code', ''))
    success_flag = response_json.get('success', False)

    if code == '200' or success_flag is True:
        return True, 'ok'

    msg = response_json.get('msg') or response_json.get('message', '未知业务错误')
    return False, f"ODS 业务层拒绝: code={code}, msg={msg}"
```

双层校验（HTTP 状态码 + 业务码）确保了数据不会因"假成功"而静默丢失。

---

### 亮点三：Pending 离线缓存——轻量级本地消息队列

当 ODS 网络不可达时（如服务器维护、网络抖动），如果直接丢弃失败批次，数据就永久丢失了。项目设计了一套"本地文件缓存 + 下次重推"机制：

**写入缓存（推送失败时）：**

```python
def _save_pending_rows(rows: list[dict]) -> None:
    """将推送失败的数据行持久化到本地 pending 目录"""
    _PENDING_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
    fpath = _PENDING_DIR / f'pending_{ts}.json'
    fpath.write_text(json.dumps(rows, ensure_ascii=False), encoding='utf-8')
```

**重推历史缓存（每次推送前优先执行）：**

```python
def _flush_pending_rows(_skip_flush: bool = False) -> None:
    """重推 pending 目录中所有历史失败文件，成功后删除文件。
    _skip_flush=True 防止递归调用导致无限循环。
    """
    if _skip_flush:
        return
    for fpath in sorted(_PENDING_DIR.glob('pending_*.json')):
        rows = json.loads(fpath.read_text(encoding='utf-8'))
        ok, _ = push_to_server_api(rows, _skip_flush=True)
        if ok:
            fpath.unlink()   # 推送成功，删除缓存文件
```

这本质上是一个基于文件系统的轻量级消息队列，在没有 MQ 基础设施的环境下实现了数据零丢失保障。值得注意的是 `_skip_flush=True` 参数，它防止了"重推时再次调用重推"产生的递归死循环。

---

### 亮点四：指数退避重试 + 上限封顶

网络请求和浏览器操作都可能因为瞬时故障失败。项目使用指数退避算法控制重试间隔：

```python
def with_retry(fn, max_retries: int = 3, base_delay: float = 10.0):
    """
    带指数退避的重试包装器。
    等待时间序列：10s → 20s → 40s → 80s（上限 120s）
    """
    for attempt in range(1, max_retries + 2):
        try:
            return fn()
        except Exception as e:
            if attempt > max_retries:
                raise
            delay = min(base_delay * (2 ** (attempt - 1)), 120.0)
            logger.warning(f"第 {attempt} 次失败，{delay:.0f}s 后重试: {e}")
            time.sleep(delay)
```

上限封顶（120s）防止了在长时间网络中断时等待时间无限增长，避免任务积压。

---

### 亮点五：MD5 复合主键防碰撞设计

数据库主键的设计直接影响数据是否会重复。项目的主键生成路径如下：

```python
def _build_row(item: dict, geo: str, gather_time_ms: int, rank: int) -> dict:
    # Step 1：将 url + 时间戳 + rank + 标题 纳入 mid 生成
    # 关键：必须包含 rank 和 title，否则同一毫秒内多行会产生相同 mid
    mid_src = f"{item['url']}|{gather_time_ms}|{rank}|{item['title']}"
    mid = hashlib.md5(mid_src.encode()).hexdigest()

    # Step 2：对域名做归一化后生成 site_id
    domain = re.sub(r'^www\.', '', urlparse(item['url']).netloc)
    site_id = hashlib.md5(domain.encode()).hexdigest()

    # Step 3：复合主键
    row_id = hashlib.md5(f"{mid}{site_id}".encode()).hexdigest()

    return {"id": row_id, "mid": mid, "site_id": site_id, ...}
```

注释中明确记录了设计决策的原因：**如果 mid 不包含 rank 和 title，同一批次的多条记录会在同一毫秒内生成完全相同的 mid，导致 ODS 服务端去重后大量数据静默丢失**。这是一个从真实 Bug 中提炼的关键设计。

---

### 亮点六：APScheduler 内置兜底调度

服务默认是"请求驱动"的，但同时内置了 APScheduler 每小时自动触发一次全量爬取作为兜底：

```python
def _init_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        func=_scheduled_crawl_all,
        trigger=CronTrigger(minute=0),   # 每小时整点
        id='crawl_all_hourly',
        max_instances=1,                 # 防止任务重叠
        misfire_grace_time=300,          # 5分钟内补执行
        replace_existing=True,
    )
    scheduler.start()
```

`max_instances=1` 确保即使上一次爬取还没结束，也不会启动第二个并发实例；`misfire_grace_time=300` 表示如果在触发时刻系统繁忙，5 分钟内仍会补执行一次，而不是直接跳过。

---

## 部署方式

项目提供了多种部署选项：

**直接运行：**
```bash
pip install -r requirements.txt
playwright install chromium
python google_trends_api.py
```

**Docker 部署：**
```bash
docker-compose up -d
```

**Windows 任务计划（开机自启）：**
```powershell
powershell -ExecutionPolicy Bypass -File register_task.ps1
```

---

## 总结

这个项目展示了如何在"单文件"约束下构建一个生产可用的数据采集服务：

- **双解析器降级**确保外部平台接口变更后能快速切换，不中断服务
- **假成功防御**在 HTTP 层之上增加业务层校验，消灭静默数据丢失
- **Pending 文件缓存**以最小的工程成本实现了数据零丢失的本地消息队列
- **MD5 复合主键**从真实 Bug 经验出发，在设计阶段就杜绝了主键碰撞问题

这些经验不只适用于 Google Trends 爬虫，对任何需要与第三方平台对接、可靠推送数据的场景都有参考价值。
