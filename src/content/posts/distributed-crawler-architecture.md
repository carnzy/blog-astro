---
title: 从单机到集群：分布式爬虫后端架构设计指南
published: 2026-07-24
description: 设计一套完整的分布式爬虫系统——任务队列派发、VPS 集群执行、Kafka 数据总线分发、多数据库(MySQL/MongoDB/ES/Doris/Redis)各司其职，包含故障处理和容错设计。
image: ""
tags: [架构, 分布式, 爬虫, Kafka, MySQL, MongoDB, Elasticsearch, Redis, 后端]
category: 系统设计
draft: false
lang: zh-CN
---

## 背景

当你只有一个爬虫任务、一台机器时，Scrapy 单机跑就够了。

但现实场景是：
- **多个爬虫任务**并行运行（不同网站、不同频率）
- **多台 VPS** 组成爬虫集群
- **多种数据库**存不同类型的数据
- **需要容错**：机器宕机、网络抖动、目标站反爬

这就需要一套分布式架构来管理。本文将梳理完整的技术方案。

## 架构全景图

```
┌──────────────────────────────────────────────────────────┐
│                    📋 任务管理层                           │
│                                                          │
│   Web UI ──▶ API Server ──▶ Task Manager（任务编排）      │
│                                  │                       │
│                          发布任务到消息队列                │
└──────────────────────────────────┼────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────┐
│                 🔀 任务分发层 (消息队列)                   │
│                                                          │
│   ┌─────────────────────────────────────┐               │
│   │      Celery / RabbitMQ              │               │
│   │  ┌─────────┐ ┌─────────┐ ┌───────┐ │               │
│   │  │ Queue A │ │ Queue B │ │Queue C│ │               │
│   │  │(高优先) │ │(普通)   │ │(低优先)│ │               │
│   │  └────┬────┘ └────┬────┘ └───┬───┘ │               │
│   └───────┼───────────┼─────────┼─────┘               │
└───────────┼───────────┼─────────┼───────────────────────┘
            │           │         │
            ▼           ▼         ▼
┌──────────────────────────────────────────────────────────┐
│               🕷️ 爬虫执行层 (VPS 集群)                    │
│                                                          │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│   │  VPS #1  │  │  VPS #2  │  │  VPS #3  │              │
│   │ Worker×2 │  │ Worker×2 │  │ Worker×2 │              │
│   │ Scrapy   │  │ Scrapy   │  │ Scrapy   │              │
│   │ Playwright│ │ Playwright│ │ Selenium │              │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘              │
│        │              │             │                     │
│   提取结构化数据，发送到 Kafka                              │
└────────┼──────────────┼─────────────┼─────────────────────┘
         │              │             │
         └──────────────┼─────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────┐
│               📡 数据分发层 (Kafka)                        │
│                                                          │
│   Topic: raw_pages │ parsed_docs │ pdf_files              │
│        │                  │              │                │
│   ┌────┼──────────────────┼──────────────┼──────────┐    │
│   │    ▼                  ▼              ▼           │    │
│   │ Consumer A       Consumer B    Consumer C        │    │
│   │ (数据清洗)        (数据清洗)     (数据清洗)        │    │
│   └────┼──────────────────┼──────────────┼──────────┘    │
└────────┼──────────────────┼──────────────┼────────────────┘
         │                  │              │
         ▼                  ▼              ▼
┌──────────────────────────────────────────────────────────┐
│              💾 数据存储层 (多数据库)                       │
│                                                          │
│  ┌────────┐ ┌────────┐ ┌──────────┐ ┌────────┐ ┌──────┐ │
│  │ MySQL  │ │MongoDB │ │   ES     │ │ Doris  │ │Redis │ │
│  │ 关系型 │ │ 文档型  │ │ 全文搜索  │ │ OLAP  │ │ 缓存 │ │
│  │ 业务表 │ │ JSON   │ │ 倒排索引  │ │  聚合  │ │ 去重 │ │
│  └────────┘ └────────┘ └──────────┘ └────────┘ └──────┘ │
└──────────────────────────────────────────────────────────┘
```

## 一条数据的完整旅程

以一次 PDF 下载任务为例，从头到尾共 8 个阶段：

```
① 创建任务   ② 入队      ③ 领取      ④ 执行
┌──────┐   ┌──────┐   ┌──────┐   ┌──────────┐
│Admin │──▶│Queue │──▶│VPS#2 │──▶│Scrapy    │
│创建   │   │等待   │   │Worker│   │Crawl     │
└──────┘   └──────┘   └──────┘   └────┬─────┘
                                       │
⑧ 展示       ⑦ 入库      ⑥ 分发          ⑤ 产出
┌──────┐   ┌──────┐   ┌──────┐   ┌──────────┐
│Grafana│◀─│MySQL │◀──│Kafka │◀──│JSON     │
│/Web UI│  │ES等  │   │分发   │   │结构化数据 │
└──────┘   └──────┘   └──────┘   └──────────┘
```

### 阶段 ①：任务创建

管理员在 Web UI 创建任务：配置目标 URL、爬虫类型、并发数、深度、调度策略（立即/定时/Cron）、目标数据库。

### 阶段 ②：任务入队

API Server 收到请求后：

```
1. 验证任务配置
2. 写入 MySQL tasks 表（持久化）
3. 如果是定时任务，创建 Cron 触发器
4. 发布任务消息到 RabbitMQ
```

消息内容：

```json
{
    "task_id": "uuid-xxxx",
    "spider_name": "pdf_spider",
    "params": { "start_urls": [...], "depth": 5 },
    "target_kafka_topic": "parsed_docs",
    "created_at": "2026-07-24T02:00:00Z"
}
```

### 阶段 ③：任务领取 — 竞争消费者模式

多个 VPS Worker 同时从队列拉取任务：

```
VPS #1 (空闲) ──┐
                │
VPS #2 (空闲) ──┼──▶ 竞争消费 RabbitMQ 队列 ──▶ 谁先抢到谁执行
                │
VPS #3 (忙碌) ──┘    不会抢（处理上一个任务中）
```

关键机制：
- `prefetch_count = 1`：每次只预取 1 个任务，公平分配
- **心跳检测**：Worker 宕机 → 未 ACK 的消息自动 Requeue → 其他 Worker 接替
- **ACK 确认**：任务完成后发 ACK，队列才删除消息

### 阶段 ④：爬虫执行

VPS Worker 内部流程：

```
┌─ Step 1: 从消息队列拿到任务配置
│
├─ Step 2: 初始化爬虫环境
│   ├── 连接 Redis → 获取代理 IP
│   ├── 加载 Spider 类
│   └── 注入配置（start_urls, depth, concurrency）
│
├─ Step 3: Scrapy 执行
│   ├── Downloader → HTTP 请求（经过代理、重试、UA 中间件）
│   ├── Spider.parse() → 提取链接，递归发现
│   └── Spider.save_pdf() → 保存 PDF
│
└─ Step 4: 数据分离
    ├── PDF 二进制 → MinIO / 本地暂存
    └── 结构化 JSON → Kafka Producer（topic: parsed_docs）
```

### 阶段 ⑤：数据进入 Kafka

Kafka 是**数据分发中枢**——爬虫不直接写库，只发 Kafka：

```json
{
    "meta": {
        "task_id": "uuid-xxxx",
        "spider_name": "pdf_spider",
        "source_domain": "example.com",
        "crawled_at": "2026-07-24T02:15:30Z"
    },
    "data": {
        "url": "https://...",
        "title": "...",
        "publish_date": "2026-07-20",
        "pdf_path": "/minio/pdf-bucket/2026/07/doc.pdf",
        "pdf_size": 245678,
        "pdf_checksum": "sha256:abcdef...",
        "tags": ["标签1", "标签2"]
    }
}
```

**分区策略**：按 `source_domain` hash 分区 → 同域名数据有序处理。

### 阶段 ⑥：多 Consumer 并行消费

**不同 Consumer Group 独立消费同一个 Topic，各取所需，互不影响：**

```
Topic: parsed_docs
    │
    ├── Consumer Group A (MySQL)      → 写入关系型数据
    ├── Consumer Group B (MongoDB)    → 写入文档型数据
    ├── Consumer Group C (ES + Doris) → 写入搜索索引 + 分析数据
    └── Consumer Group D (文件上传)    → 上传 PDF 到 MinIO
```

### 阶段 ⑦：分库落盘

| 数据库 | 存储什么 | 为什么用它 |
|--------|---------|-----------|
| **MySQL** | 任务元信息、结构化记录、用户/权限表 | ACID 事务、JOIN 能力强 |
| **MongoDB** | PDF 元数据、原始 JSON、非结构化内容 | Schema 灵活、嵌套文档天然支持 |
| **Elasticsearch** | 全文索引、文档正文 | 倒排索引、分词搜索、毫秒级返回 |
| **Doris** | 聚合统计、历史趋势、大数据量分析 | 列式存储、向量化执行、物化视图 |
| **Redis** | URL 去重(Bloom)、代理池、速率限制、状态缓存 | 极快内存、多种数据结构、TTL 自动过期 |

## Redis 的三种角色

Redis 在这个架构里不仅是缓存：

### 角色 1：URL 去重 (Bloom Filter)

```python
# 每次请求前检查
if redis.bfExists("crawled_urls", url):
    skip  # 已爬过
else:
    fetch(url)
    redis.bfAdd("crawled_urls", url)
```

```
1 亿条 URL 去重：
  用 Set:    ≈ 8GB 内存
  用 Bloom:  ≈ 120MB 内存（误判率 1%）
```

### 角色 2：代理 IP 池

```bash
redis> ZADD proxy_pool 100 "192.168.1.10:8080"  # score=可用率
redis> ZADD proxy_pool 95  "192.168.1.11:8080"

# Worker 获取高可用代理
redis> ZRANGEBYSCORE proxy_pool 90 100

# 代理失败时降权
redis> ZINCRBY proxy_pool -10 "192.168.1.10:8080"
```

### 角色 3：速率限制

```bash
redis> INCR rate:example.com:minute
if count > 60: throttle  # 每分钟最多 60 次请求
```

## Kafka Topic 设计

| Topic | 生产者 | 消费者 | 内容 |
|-------|--------|--------|------|
| `crawler.tasks` | Task Manager | VPS Workers | 待执行任务 |
| `crawler.status` | VPS Workers | 监控系统 | 心跳/进度上报 |
| `crawler.docs` | VPS Workers | MySQL/Mongo/ES/Doris Writer | **核心：爬取结果** |
| `crawler.files` | VPS Workers | File Uploader → MinIO | 文件路径引用 |
| `crawler.deadletter` | 各 Consumer | 告警 + 人工处理 | 消费失败的消息 |

## 故障处理

### VPS Worker 宕机

```
VPS#2 宕机 → RabbitMQ 检测心跳超时
           → 该 Worker 未 ACK 的消息自动 Requeue
           → VPS#3 接手继续执行
           → 不丢数据
```

### 数据库写入失败

```
Consumer 写入 MongoDB 失败:
  ① 重试 3 次（指数退避: 1s → 5s → 25s）
     ├── 成功 → Commit Offset，继续消费
     └── 仍然失败 → 发送到 Dead Letter Topic
                      → 触发告警 + 人工介入
  ② 关键：不 Commit Offset，消息不会丢失
```

### 反爬应对

```
Worker 收到 403:
  ① 标记代理 IP 失效（Redis 降权 50 分）
  ② 从代理池获取新 IP
  ③ 自适应降速：错误数 > 10 → DOWNLOAD_DELAY *= 2
  ④ 触发告警通知运维
```

## 技术选型速查

| 层次 | 推荐 | 备选 |
|------|------|------|
| 爬虫引擎 | Scrapy | Colly (Go), Crawlee (JS) |
| JS 渲染 | Playwright | Selenium, Puppeteer |
| 任务队列 | Celery + RabbitMQ | Redis Queue, Kafka |
| 消息总线 | Apache Kafka | Redis Streams, Pulsar |
| 关系型存储 | MySQL / PostgreSQL | — |
| 文档存储 | MongoDB | CouchDB |
| 搜索引擎 | Elasticsearch | Meilisearch, Typesense |
| OLAP 分析 | Apache Doris | ClickHouse, StarRocks |
| 缓存/去重 | Redis | Dragonfly |
| 对象存储 | MinIO | AWS S3, 阿里云 OSS |
| 监控 | Grafana + Prometheus | Datadog |

## 总结

核心设计原则就三条：

1. **爬虫不直接写库**——所有产出进 Kafka，各 Consumer 按需独立消费，互不阻塞
2. **消息队列做缓冲**——任务队列（RabbitMQ）消峰填谷，数据总线（Kafka）解耦生产消费
3. **每个数据库做最擅长的事**——MySQL 管关系、MongoDB 存文档、ES 做搜索、Doris 跑聚合、Redis 做实时去重
