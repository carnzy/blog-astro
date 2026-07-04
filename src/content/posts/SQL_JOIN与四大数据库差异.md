---
title: SQL_JOIN与四大数据库差异
published: 2026-07-04
description: ''
image: ''
tags: []
category: ''
draft: false
lang: ''
---
# SQL 表连接类型 & 四大数据库 + SQLite + MongoDB + Redis

> 覆盖 Oracle / MySQL / SQL Server / PostgreSQL / SQLite / MongoDB / Redis

---

## 一、表间连接（JOIN）类型与区别

### 1. INNER JOIN（内连接）

```sql
SELECT * FROM A INNER JOIN B ON A.id = B.a_id;
```

只返回**两表都匹配**的行。不匹配的行直接被丢弃。

### 2. LEFT JOIN / LEFT OUTER JOIN（左外连接）

```sql
SELECT * FROM A LEFT JOIN B ON A.id = B.a_id;
```

返回左表**全部行**，右表无匹配时填充 NULL。

### 3. RIGHT JOIN / RIGHT OUTER JOIN（右外连接）

```sql
SELECT * FROM A RIGHT JOIN B ON A.id = B.a_id;
```

返回右表**全部行**，左表无匹配时填充 NULL。实际开发中**很少用**，用 LEFT JOIN 调换表顺序即可等价。

### 4. FULL OUTER JOIN（全外连接）

```sql
SELECT * FROM A FULL OUTER JOIN B ON A.id = B.a_id;
```

返回两表**所有行**，任一侧无匹配都填 NULL。相当于 `LEFT JOIN UNION RIGHT JOIN`。

> ⚠️ **MySQL 不原生支持 FULL OUTER JOIN**，需用 `LEFT JOIN UNION RIGHT JOIN` 模拟。

### 5. CROSS JOIN（笛卡尔积）

```sql
SELECT * FROM A CROSS JOIN B;
```

不加 ON 条件，返回 M×N 行。等价于 `SELECT * FROM A, B`。

### 6. SELF JOIN（自连接）

不是独立语法，表和自己 JOIN：

```sql
SELECT e.name, m.name AS manager
FROM emp e JOIN emp m ON e.mgr_id = m.id;
```

### 7. NATURAL JOIN（自然连接）

```sql
SELECT * FROM A NATURAL JOIN B;
```

自动按**同名字段**等值连接，不显式写 ON。**生产环境不推荐**，字段名变化会导致意外结果。

### 8. LATERAL JOIN（横向子查询）⭐ PostgreSQL

```sql
-- PG 特有：子查询可以引用左侧表的列
SELECT u.name, o.order_date
FROM users u
CROSS JOIN LATERAL (
    SELECT * FROM orders WHERE user_id = u.id ORDER BY order_date DESC LIMIT 3
) o;
```

Oracle 12c+ 和 SQL Server 也支持（叫 `CROSS APPLY` / `OUTER APPLY`），MySQL 8.0.14+ 支持。**PostgreSQL 是最早推广 LATERAL 的。**

### 9. 五种数据库的 JOIN 支持对比

| JOIN 类型 | Oracle | MySQL | SQL Server | PostgreSQL | SQLite |
|---|---|---|---|---|---|
| INNER JOIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| LEFT JOIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| RIGHT JOIN | ✅ | ✅ | ✅ | ✅ | ✅ (3.33.0+) |
| FULL OUTER JOIN | ✅ | ❌ (需模拟) | ✅ | ✅ | ✅ (3.39.0+) |
| CROSS JOIN | ✅ | ✅ | ✅ | ✅ | ✅ |
| NATURAL JOIN | ✅ | ✅ | ❌ | ✅ | ✅ |
| LATERAL / APPLY | ✅ (12c+) | ✅ (8.0.14+) | ✅ (APPLY) | ✅ ⭐ | ❌ |
| `(+)` 旧式外连接 | ✅ | ❌ | ❌ | ❌ | ❌ |

Oracle 特有 `(+)` 语法（旧式）：

```sql
-- Oracle 旧式左连接（(+) 在右表侧 = 左连接）
SELECT * FROM A, B WHERE A.id = B.a_id(+);
```

---

## 二、执行顺序速查

```
书写顺序：                               执行顺序：
SELECT [DISTINCT] ...            8       FROM ...             1
FROM ...                         1       ON ...               2
JOIN ... ON ...                  2       JOIN ...             3
WHERE ...                        3       WHERE ...            4
GROUP BY ...                     4       GROUP BY ...         5
HAVING ...                       5       HAVING ...           6
ORDER BY ...                     6       SELECT ...           7
LIMIT / OFFSET ...               7       DISTINCT ...         8
                                         ORDER BY ...         9
                                         LIMIT / OFFSET ...   10
```

> WHERE 不能用 SELECT 别名（别名在第 7 步才产生）；ORDER BY 可以用别名（在第 9 步执行）。

---

## 三、Oracle / MySQL / SQL Server / PostgreSQL 关键差异

### 1. 分页查询

| 数据库 | 写法 |
|---|---|
| **Oracle** (12c 前) | `SELECT * FROM (SELECT ROWNUM rn, t.* FROM (...) t WHERE ROWNUM <= 20) WHERE rn > 10` |
| **Oracle** (12c+) | `SELECT * FROM t OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY` |
| **MySQL** | `SELECT * FROM t LIMIT 10 OFFSET 10` |
| **SQL Server** (2012+) | `SELECT * FROM t ORDER BY id OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY` |
| **SQL Server** (旧) | `SELECT TOP 10 * FROM t WHERE id NOT IN (SELECT TOP 10 id FROM t)` |
| **PostgreSQL** | `SELECT * FROM t LIMIT 10 OFFSET 10`（与 MySQL 相同） |

### 2. 字符串拼接

| 数据库 | 运算符/函数 |
|---|---|
| **Oracle** | `\|\|` 或 `CONCAT(a, b)`（只2个参数） |
| **MySQL** | `CONCAT(a, b, c)` |
| **SQL Server** | `+` 或 `CONCAT(a, b, c)` |
| **PostgreSQL** | `\|\|` 或 `CONCAT(a, b, c)` |

```sql
-- Oracle / PostgreSQL
SELECT first_name || ' ' || last_name FROM emp;

-- MySQL / SQL Server
SELECT CONCAT(first_name, ' ', last_name) FROM emp;
```

### 3. 日期函数

| 操作 | Oracle | MySQL | SQL Server | PostgreSQL |
|---|---|---|---|---|
| 当前时间 | `SYSDATE` | `NOW()` | `GETDATE()` | `NOW()` / `CURRENT_TIMESTAMP` |
| 当前日期 | `TRUNC(SYSDATE)` | `CURDATE()` | `CAST(GETDATE() AS DATE)` | `CURRENT_DATE` |
| 日期格式化 | `TO_CHAR(d, 'YYYY-MM-DD')` | `DATE_FORMAT(d, '%Y-%m-%d')` | `FORMAT(d, 'yyyy-MM-dd')` | `TO_CHAR(d, 'YYYY-MM-DD')` |
| 字符串转日期 | `TO_DATE('2026-01-01', 'YYYY-MM-DD')` | `STR_TO_DATE('2026-01-01', '%Y-%m-%d')` | `CAST('2026-01-01' AS DATE)` | `TO_DATE('2026-01-01', 'YYYY-MM-DD')` 或 `'2026-01-01'::DATE` |
| 日期加减天 | `d + 1` | `DATE_ADD(d, INTERVAL 1 DAY)` | `DATEADD(DAY, 1, d)` | `d + INTERVAL '1 day'` 或 `d + 1` |
| 日期加减月 | `ADD_MONTHS(d, 1)` | `DATE_ADD(d, INTERVAL 1 MONTH)` | `DATEADD(MONTH, 1, d)` | `d + INTERVAL '1 month'` |
| 日期差（天数） | `d1 - d2` | `DATEDIFF(d1, d2)` | `DATEDIFF(DAY, d2, d1)` | `d1 - d2` |
| 取年月日 | `EXTRACT(YEAR FROM d)` | `YEAR(d)` | `YEAR(d)` | `EXTRACT(YEAR FROM d)` 或 `DATE_PART('year', d)` |

> PostgreSQL 日期运算最接近标准 SQL，`d - d` 直接得到天数（interval 类型）。

### 4. 空值处理

| 数据库 | 专属函数 | 通用函数 |
|---|---|---|
| **Oracle** | `NVL(col, default)` | `COALESCE(...)` |
| **MySQL** | `IFNULL(col, default)` | `COALESCE(...)` |
| **SQL Server** | `ISNULL(col, default)` | `COALESCE(...)` |
| **PostgreSQL** | — | `COALESCE(...)` |

四者都支持 `COALESCE`（ANSI 标准），可传多个参数返回第一个非空值：

```sql
SELECT COALESCE(mobile, phone, '无联系方式') FROM users;
```

### 5. 字符串函数差异

| 操作 | Oracle | MySQL | SQL Server | PostgreSQL |
|---|---|---|---|---|
| 子串 | `SUBSTR(s, pos, len)` | `SUBSTRING(s, pos, len)` | `SUBSTRING(s, pos, len)` | `SUBSTRING(s, pos, len)` 或 `SUBSTR(s, pos, len)` |
| 长度 | `LENGTH(s)` | `CHAR_LENGTH(s)` | `LEN(s)` | `LENGTH(s)` 或 `CHAR_LENGTH(s)` |
| 大小写 | `UPPER`/`LOWER` | `UPPER`/`LOWER` | `UPPER`/`LOWER` | `UPPER`/`LOWER` |
| 去空格 | `TRIM(s)` | `TRIM(s)` | `TRIM(s)` | `TRIM(s)` |
| 左补齐 | `LPAD(s, n, '0')` | `LPAD(s, n, '0')` | `RIGHT('000'+s, n)` | `LPAD(s, n, '0')` |
| 查找位置 | `INSTR(s, sub)` | `INSTR(s, sub)` / `LOCATE(sub, s)` | `CHARINDEX(sub, s)` | `POSITION(sub IN s)` / `STRPOS(s, sub)` |
| 替换 | `REPLACE(s, old, new)` | `REPLACE(s, old, new)` | `REPLACE(s, old, new)` | `REPLACE(s, old, new)` |
| 正则匹配 | `REGEXP_LIKE(s, pat)` | `s REGEXP pat` | ❌ (需 CLR) | `s ~ pat` ⭐ |
| 正则替换 | `REGEXP_REPLACE(s, pat, repl)` | `REGEXP_REPLACE(s, pat, repl)` (8.0+) | ❌ | `REGEXP_REPLACE(s, pat, repl)` ⭐ |

### 6. 自增列 / 序列

| 数据库 | 方式 |
|---|---|
| **Oracle** (旧) | `CREATE SEQUENCE seq_name;` 插入时用 `seq_name.NEXTVAL` |
| **Oracle** (12c+) | `id NUMBER GENERATED BY DEFAULT AS IDENTITY` |
| **MySQL** | `id INT AUTO_INCREMENT PRIMARY KEY` |
| **SQL Server** | `id INT IDENTITY(1,1) PRIMARY KEY` |
| **PostgreSQL** | `id SERIAL PRIMARY KEY` 或 `id INT GENERATED BY DEFAULT AS IDENTITY`（PG 10+） |
| **SQLite** | `id INTEGER PRIMARY KEY`（自动成为 rowid 别名，自增） |

### 7. 取前 N 条

| 数据库 | 语法 |
|---|---|
| **Oracle** | `WHERE ROWNUM <= 10` 或 `FETCH FIRST 10 ROWS ONLY` |
| **MySQL** | `LIMIT 10` |
| **SQL Server** | `SELECT TOP 10 * FROM t` |
| **PostgreSQL** | `LIMIT 10` |

### 8. 判断分支

| 数据库 | 专属语法 |
|---|---|
| **Oracle** | `DECODE(col, v1, r1, v2, r2, default)` |
| **MySQL** | `IF(cond, true_val, false_val)` |
| **SQL Server** | `IIF(cond, true_val, false_val)` |
| **PostgreSQL** | `CASE WHEN`（无专属语法，标准 SQL） |

全部支持 `CASE WHEN ... THEN ... ELSE ... END`。

### 9. 数据类型差异

| 场景 | Oracle | MySQL | SQL Server | PostgreSQL |
|---|---|---|---|---|
| 变长字符串 | `VARCHAR2(n)` | `VARCHAR(n)` | `VARCHAR(n)` / `NVARCHAR(n)` | `VARCHAR(n)` 或 `TEXT` |
| 整数 | `NUMBER(10)` | `INT` / `BIGINT` | `INT` / `BIGINT` | `INT` / `BIGINT` / `SMALLINT` |
| 小数 | `NUMBER(p,s)` | `DECIMAL(p,s)` | `DECIMAL(p,s)` | `DECIMAL(p,s)` / `NUMERIC(p,s)` |
| 大文本 | `CLOB` | `TEXT` / `LONGTEXT` | `VARCHAR(MAX)` | `TEXT`（无长度限制） |
| 二进制 | `BLOB` | `BLOB` | `VARBINARY(MAX)` | `BYTEA` |
| 布尔 | ❌（用 NUMBER(1)） | `TINYINT(1)` / `BOOLEAN` | `BIT` | `BOOLEAN` ✅ 原生支持 |
| JSON | ❌ (12c 前) / `JSON` (21c+) | `JSON` (5.7+) | `JSON` (2016+) | `JSON` / `JSONB` ⭐ |
| 数组 | ❌ | ❌ | ❌ | `INT[]` / `TEXT[]` ⭐ 原生数组 |
| UUID | ❌ | ❌ | `UNIQUEIDENTIFIER` | `UUID` ⭐ 原生支持 |
| IP 地址 | ❌ | ❌ | ❌ | `INET` ⭐ 原生支持 |

> PostgreSQL 在数据类型丰富度上碾压其他三者，`JSONB`（二进制 JSON，支持索引）、原生数组、布尔、UUID、网络地址类型是其突出优势。

### 10. 库/表结构查询

| 操作 | Oracle | MySQL | SQL Server | PostgreSQL |
|---|---|---|---|---|
| 查所有表 | `SELECT * FROM USER_TABLES` | `SHOW TABLES` | `SELECT * FROM INFORMATION_SCHEMA.TABLES` | `\dt` (psql) 或 `SELECT * FROM information_schema.tables` |
| 查表结构 | `DESC tablename` | `DESC tablename` | `sp_columns tablename` | `\d tablename` (psql) |
| 查所有库 | `SELECT * FROM V$DATABASE` | `SHOW DATABASES` | `SELECT * FROM sys.databases` | `\l` (psql) 或 `SELECT * FROM pg_database` |

### 11. DUAL 表

| 数据库 | 是否需要 |
|---|---|
| **Oracle** | 必写 `FROM DUAL` |
| **MySQL** | 不需要 |
| **SQL Server** | 不需要 |
| **PostgreSQL** | 不需要 |

```sql
-- 只有 Oracle 要这样写
SELECT 1 + 1 FROM DUAL;

-- 其他数据库直接
SELECT 1 + 1;
```

### 12. 存储过程语言

| 数据库 | 语言 | 特点 |
|---|---|---|
| Oracle | PL/SQL | 最成熟的企业级过程语言 |
| MySQL | SQL/PSM 风格 | 功能较简单，5.7+ 逐步完善 |
| SQL Server | T-SQL | 集成度高，与 .NET 生态紧密 |
| PostgreSQL | PL/pgSQL | 最接近 Oracle PL/SQL，还支持 Python、Perl、JavaScript 等 |

### 13. PostgreSQL 独有特性 ⭐

| 特性 | 说明 |
|---|---|
| `RETURNING` | `DELETE FROM t WHERE id = 1 RETURNING *;` 删的同时返回被删行 |
| `ON CONFLICT` (UPSERT) | `INSERT INTO t VALUES (...) ON CONFLICT (id) DO UPDATE SET ...` |
| `CTE` + `WITH` | 从 8.4 即支持，MySQL 8.0 才有，SQL Server 2005 就有 |
| `DISTINCT ON` | `SELECT DISTINCT ON (dept_id) * FROM emp ORDER BY dept_id, salary DESC;` 每组取第一行 |
| `::` 类型转换 | `'123'::INT` 简洁的类型转换语法 |
| `GENERATE_SERIES` | `SELECT GENERATE_SERIES(1, 100);` 快速生成连续数字/日期 |
| 窗口函数 | 支持最早（8.4），实现最完整 |
| `EXPLAIN ANALYZE` | 执行计划 + 实际耗时，SQL 调优利器 |
| `ILIKE` | 大小写不敏感的 LIKE（Oracle/MySQL/SQL Server 都没有原生等价物） |
| 全文搜索 | 内置 `tsvector` / `tsquery`，无需额外引擎 |
| 表继承 | 原生支持表继承（面向对象的表设计） |

---

## 四、SQLite 是关系型数据库吗？

**是的，SQLite 是正宗的轻量级关系型数据库。** 它满足 RDBMS 的核心标准：支持 SQL、ACID 事务、表关系（JOIN）、索引、触发器等。

### SQLite 和其他四个的区别

| 维度 | Oracle/MySQL/SQL Server/PG | SQLite |
|---|---|---|
| 架构 | **客户端-服务器**（独立进程监听端口） | **嵌入式**（一个 .c 文件编译进你的程序，无独立进程） |
| 安装 | 要装服务端，配置端口、用户 | 零安装，一个几百 KB 的库文件 |
| 数据存储 | 数据文件和程序分离 | 整个库 = 一个 `.db` 文件 |
| 并发 | 多用户并发读写 | 写串行（整个库写锁），读可并发（WAL 模式） |
| 适用场景 | Web 后台、企业系统 | App 本地存储、浏览器（Chrome/微信）、嵌入式设备、原型开发 |
| 网络访问 | TCP 端口，远程连接 | 没有网络协议，只能本进程访问 |
| 类型系统 | 静态类型（列有固定类型） | **灵活类型**（一个列的值可以是 INT，下一行可以是 TEXT） |

### SQLite 语法与常见差异

```sql
-- 分页：和 MySQL/PG 一样
SELECT * FROM t LIMIT 10 OFFSET 5;

-- 字符串拼接：用 ||（和 Oracle/PG 一样）
SELECT first_name || ' ' || last_name FROM emp;

-- 当前时间
SELECT DATETIME('now');          -- 字符串格式
SELECT STRFTIME('%Y-%m-%d', 'now');

-- 自增主键（特殊规则）
CREATE TABLE t (
    id INTEGER PRIMARY KEY,   -- 自动成为 rowid 别名，传 NULL 时自增
    name TEXT
);

-- 不支持 RIGHT JOIN / FULL OUTER JOIN（部分版本）
-- 不支持 ALTER COLUMN（只能 ALTER TABLE ADD COLUMN / RENAME TABLE / RENAME COLUMN）
-- 没有存储过程
-- 没有用户/权限管理
-- 不支持 GRANT / REVOKE
```

### SQLite 类型亲和性（Type Affinity）

这是 SQLite 最特别的地方——**列的类型只是"建议"，不是强制**：

```sql
CREATE TABLE t (age INT);
INSERT INTO t VALUES ('hello');  -- ✅ 不会报错！存的就是字符串 'hello'
```

五种亲和类型：`TEXT`、`NUMERIC`、`INTEGER`、`REAL`、`BLOB`。INT 列建议存整数，但不强制。

---

## 五、MongoDB（文档数据库）

### MongoDB 是关系型数据库吗？

**不是。** MongoDB 是 **NoSQL 文档型数据库**。核心差异：

| 维度 | 关系型 (MySQL/PG/Oracle) | MongoDB |
|---|---|---|
| 数据模型 | 表 → 行 → 列 | 集合(Collection) → 文档(Document) → 字段(Field) |
| 存储格式 | 行的固定列 | BSON（二进制 JSON），文档结构自由 |
| Schema | 强 Schema（每列有固定类型） | 无 Schema / 灵活 Schema |
| 关联方式 | JOIN（连接查询） | 嵌套文档 或 `$lookup`（聚合管道） |
| 查询语言 | SQL | MQL（MongoDB Query Language），JSON 风格 |
| 事务 | ACID，成熟 | 4.0+ 支持多文档 ACID 事务 |
| 横向扩展 | 分库分表复杂 | 原生分片（Sharding），天然分布式 |

### 数据模型对比

```
关系型：
┌─────────────┐     ┌─────────────┐
│   users     │     │   orders    │
├─────────────┤     ├─────────────┤
│ id (PK)     │←───│ user_id (FK)│
│ name        │     │ amount      │
│ email       │     │ created_at  │
└─────────────┘     └─────────────┘

MongoDB（嵌套）：
{
  _id: ObjectId("..."),
  name: "张三",
  email: "zhang@example.com",
  orders: [                  ← 订单直接嵌套在用户文档里
    { amount: 99.9, created_at: ISODate("2026-01-01") },
    { amount: 50.0, created_at: ISODate("2026-03-15") }
  ]
}
```

MongoDB 的设计哲学：**关联数据嵌在一起，一次查询拿到全部**，避免 JOIN。

### "MongoDB 怎么 JOIN？"

MongoDB **没有 SQL 里的 JOIN 语法**，但有两种替代方案：

**方案一：嵌套文档（推荐，设计时就嵌进去）**

```javascript
// 查用户时订单一起出来，不需要 JOIN
db.users.findOne({ name: "张三" });
// 返回: { name: "张三", ..., orders: [{...}, {...}] }
```

**方案二：`$lookup`（聚合管道，类似 LEFT JOIN）**

```javascript
// 两个独立集合，运行时关联（MongoDB 3.2+）
db.users.aggregate([
  {
    $lookup: {
      from: "orders",
      localField: "_id",
      foreignField: "user_id",
      as: "orders"
    }
  }
]);
```

> ⚠️ `$lookup` 性能和真正的 JOIN 不可比——它是为"偶尔用"设计的，不是为频繁关联设计的。MongoDB 的核心思路是**用嵌入替代关联**。

### 常用 MQL 速览

```javascript
// ===== 插入 =====
db.users.insertOne({ name: "张三", age: 25, tags: ["Java", "Python"] });
db.users.insertMany([{...}, {...}]);

// ===== 查询（等价 SQL 在注释） =====
db.users.find({ name: "张三" });
// SELECT * FROM users WHERE name = '张三';

db.users.find({ age: { $gt: 20, $lt: 30 } });
// SELECT * FROM users WHERE age > 20 AND age < 30;

db.users.find({ $or: [{ age: { $lt: 20 } }, { age: { $gt: 60 } }] });
// SELECT * FROM users WHERE age < 20 OR age > 60;

db.users.find({ tags: "Java" });  // 数组包含查询
// SELECT * FROM users WHERE 'Java' IN tags;

db.users.find({}, { name: 1, age: 1, _id: 0 });  // 投影（选列）
// SELECT name, age FROM users;

// ===== 分页 =====
db.users.find().skip(10).limit(10);
// SELECT * FROM users LIMIT 10 OFFSET 10;

// ===== 排序 =====
db.users.find().sort({ age: -1 });  // -1 降序，1 升序
// SELECT * FROM users ORDER BY age DESC;

// ===== 聚合 =====
db.orders.aggregate([
  { $group: { _id: "$user_id", total: { $sum: "$amount" } } },
  { $match: { total: { $gt: 1000 } } },
  { $sort: { total: -1 } }
]);
// SELECT user_id, SUM(amount) AS total
// FROM orders
// GROUP BY user_id
// HAVING SUM(amount) > 1000
// ORDER BY total DESC;

// ===== 更新 =====
db.users.updateOne(
  { name: "张三" },
  { $set: { age: 26 }, $push: { tags: "Go" } }
);

// ===== 删除 =====
db.users.deleteMany({ age: { $lt: 18 } });

// ===== 索引 =====
db.users.createIndex({ name: 1 });  // 单字段索引
db.users.createIndex({ name: 1, age: -1 });  // 复合索引
db.users.createIndex({ name: "text" });  // 文本索引
```

### MongoDB 操作符速查

| SQL 操作符 | MongoDB 操作符 |
|---|---|
| `=` | `{ field: value }` |
| `!=` / `<>` | `{ field: { $ne: value } }` |
| `>` | `$gt` |
| `>=` | `$gte` |
| `<` | `$lt` |
| `<=` | `$lte` |
| `IN (...)` | `{ field: { $in: [v1, v2] } }` |
| `NOT IN` | `$nin` |
| `AND` | 多个条件逗号分隔，或用 `$and` |
| `OR` | `$or: [{...}, {...}]` |
| `NOT` | `$not` |
| `LIKE '%xx%'` | `{ field: /xx/ }`（正则） |
| `IS NULL` | `{ field: null }` |
| `EXISTS` (子查询) | `$lookup`（聚合） |
| `COUNT` | `.count()` 或 `{ $count: "..." }` |
| `SUM` | `$sum` |
| `AVG` | `$avg` |
| `GROUP BY` | `$group` |
| `ORDER BY` | `.sort()` |
| `LIMIT` | `.limit()` |
| `DISTINCT` | `.distinct()` 或 `$group` |

### MongoDB 适合什么？

| 场景 | 说明 |
|---|---|
| ✅ 日志存储 | 文档结构灵活，写入快 |
| ✅ 爬虫数据 | 不同网站字段不同，Schema 随意 |
| ✅ 用户画像 | 标签/属性随意增减，嵌套方便 |
| ✅ IoT / 时序 | 设备上报数据，天然时间序列 |
| ✅ 内容管理 | 文章/评论/点赞嵌套在一条文档 |
| ❌ 复杂关联查询 | 多表 JOIN、报表、BI——用 SQL 数据库 |
| ❌ 强事务场景 | 银行转账——MongoDB 事务是后来加的，不如 SQL 成熟 |
| ❌ 需要约束保证数据完整性的场景 | 无外键约束，数据一致性靠应用层保证 |

---

## 六、Redis（键值 + 数据结构服务器）

### Redis 是关系型数据库吗？

**不是。** Redis 和 SQL、MongoDB 完全不同类——它是**内存数据结构服务器**，本质上是个**超快的键值存储**。

| 维度 | 关系型 (MySQL 等) | Redis |
|---|---|---|
| 数据模型 | 表 → 行 → 列 | Key → Value（键值对） |
| 存储位置 | 磁盘（内存做缓存） | **内存为主**（可选持久化到磁盘） |
| 数据结构 | 表（二维） | String / Hash / List / Set / Sorted Set / Stream / ... |
| 查询方式 | SQL（声明式） | 命令式（`GET key`、`HGET key field`...） |
| JOIN | ✅ 核心能力 | ❌ **完全没有表关联的概念** |
| Schema | 强 Schema | 无 Schema |
| 速度 | 毫秒级 | **微秒级**（内存 + 单线程） |
| 持久化 | 默认持久 | 可持久化（RDB 快照 / AOF 日志），但可完全关掉 |
| 典型用途 | 持久存储 | 缓存 / 会话 / 队列 / 计数器 / 排行榜 |

### Redis 数据结构 & 命令速查

#### 1. String（字符串）— 最基本

```bash
SET user:1:name "张三"
GET user:1:name              # "张三"
SET counter 100
INCR counter                 # 101（原子自增）
INCRBY counter 10            # 111
SETEX session:token 3600 "user_id=1"   # 带过期时间的 key
```

> 等价 SQL 概念：`SELECT value FROM kv WHERE key = 'xxx'`，但没有表。

#### 2. Hash（哈希表）— 存对象

```bash
HSET user:1 name "张三" age 25 email "zhang@qq.com"
HGET user:1 name             # "张三"
HGETALL user:1               # 全部字段
HINCRBY user:1 age 1         # age = 26
```

> 等价概念：一条用户记录。但 Redis Hash 不能 JOIN，不能 WHERE 搜索字段。

#### 3. List（列表）— 队列/栈

```bash
LPUSH queue:tasks "task1" "task2"   # 左边入队
RPOP queue:tasks                     # 右边出队 → "task1"（FIFO 队列）
LLEN queue:tasks                     # 长度
LRANGE queue:tasks 0 -1              # 取全部元素
```

#### 4. Set（集合）— 去重、交并差

```bash
SADD user:1:tags "Java" "Python" "Go"
SADD user:2:tags "Java" "C++"
SINTER user:1:tags user:2:tags     # 交集 → ["Java"]（共同标签）
SUNION user:1:tags user:2:tags     # 并集
SDIFF user:1:tags user:2:tags      # 差集 → 1有2没有的
SISMEMBER user:1:tags "Java"       # 是否存在 → 1
```

#### 5. Sorted Set（有序集合）— 排行榜

```bash
ZADD leaderboard 100 "张三" 85 "李四" 92 "王五"
ZRANGE leaderboard 0 -1 WITHSCORES    # 按分数升序
ZREVRANGE leaderboard 0 2 WITHSCORES  # Top 3
ZRANK leaderboard "张三"              # 排名（升序）
ZINCRBY leaderboard 5 "张三"          # 加 5 分
```

> 排行榜实时更新，毫秒级响应——SQL 数据库做这个很吃力。

#### 6. Stream（流）— 消息队列（Redis 5.0+）

```bash
XADD mystream * field1 value1 field2 value2
XREAD COUNT 2 STREAMS mystream 0
```

#### 7. Geo（地理位置）— 附近的人

```bash
GEOADD cities 116.40 39.90 "北京" 121.47 31.23 "上海"
GEORADIUS cities 116.40 39.90 500 km   # 北京 500km 内的城市
GEODIST cities "北京" "上海" km        # 两地距离
```

### Redis 没有表，怎么查数据？

Redis 的核心设计：**用 Key 的设计来组织数据，而不是用表。**

```bash
# Key 命名约定来模拟"表"
user:1001:name     → "张三"
user:1001:email    → "zhang@qq.com"
user:1001:orders   → [101, 102, 103]  (List)

order:101:amount   → "99.9"
order:101:status   → "paid"

# 查用户信息 = 多次 GET / HGETALL
# 没有 "SELECT * FROM users WHERE age > 20"
# 如果要范围查询，需要用 Sorted Set 或其他结构提前建好索引
```

> ⚠️ Redis **不能按值查询**（不能"找所有 age > 20 的用户"），除非你在写入时就维护好了索引结构（比如用 Sorted Set 把年龄当 score）。

### Redis 典型应用场景

| 场景 | 用到的结构 | 为什么用 Redis |
|---|---|---|
| 缓存 | String / Hash | 比 MySQL 快 100-1000 倍，减轻 DB 压力 |
| 分布式 Session | String + 过期 | 多台服务器共享登录态 |
| 计数器（点赞/阅读量） | String + INCR | 原子操作，无需事务 |
| 排行榜 | Sorted Set | `ZADD` + `ZREVRANGE` 天然就是排行榜 |
| 消息队列 | List / Stream | 简单可靠，无需额外装 RabbitMQ |
| 分布式锁 | String + SETNX | 单线程模型天然适合做锁 |
| 好友关注/共同好友 | Set | `SINTER` 求交集天然就是共同关注 |
| 限流 | String + 过期 | `INCR` + `EXPIRE` 实现滑动窗口 |
| 附近的人 | Geo | `GEORADIUS` 直接按距离查询 |
| 签到/BitMap | Bitmap (String 的位操作) | 一个 bit 存一天的签到状态，极省内存 |

### Redis 和 MongoDB 对比

| 维度 | MongoDB | Redis |
|---|---|---|
| 定位 | 文档数据库（可替代 MySQL 做持久存储） | 内存缓存/数据结构服务器（一般不和 MySQL 互相替代） |
| 存储 | 磁盘为主，内存缓存热数据 | 内存为主，磁盘持久化是辅助 |
| 查询能力 | 丰富的查询（按字段、范围、正则、聚合） | 只能按 Key 查，不能按 Value 查 |
| 数据结构 | 一种：BSON 文档 | 多种：String/Hash/List/Set/SortedSet/Stream/Geo |
| 速度 | 毫秒级 | 微秒级 |
| 数据量 | TB 级 | 受内存限制（几十 GB 级别） |
| 持久性 | 高（默认写磁盘） | 可配置，极端情况下会丢数据 |
| JOIN | `$lookup` | ❌ |

---

## 七、总览：SQL vs MongoDB vs Redis

| 维度 | SQL 关系型 | MongoDB | Redis |
|---|---|---|---|
| 分类 | RDBMS | NoSQL 文档型 | NoSQL 键值型 |
| 数据模型 | 表(Table) → 行(Row) → 列(Column) | 集合(Collection) → 文档(Document) | Key → Value |
| 存储引擎 | 磁盘 B+Tree | 磁盘 B-Tree (WiredTiger) | 内存 |
| Schema | 强制（DDL 定义列） | 灵活（BSON 文档可不同） | 无 |
| 查询语言 | **SQL** | **MQL**（JSON 风格） | **命令**（GET/SET/HGET...） |
| 表关联 | **JOIN**（核心能力） | `$lookup`（弱，不推荐常用） | **完全没有** |
| 事务 | ACID（30年沉淀） | ACID（4.0+，多文档） | 有限（MULTI/EXEC 不是真正的 ACID） |
| 外键约束 | ✅ | ❌ | ❌ |
| 扩展方式 | 垂直扩展为主 / 分库分表 | 原生水平分片 | 集群/哨兵/分片 |
| 典型速度 | ~1-10ms | ~0.1-1ms | ~0.01-0.1ms（微秒级） |
| 典型数据量 | TB 级 | TB 级 | GB 级（受内存限制） |
| 持久化 | 默认持久 | 默认持久 | 可选（RDB/AOF） |
| 适用场景 | 业务数据、报表、ERP | 日志、爬虫、内容管理、IoT | 缓存、会话、队列、排行榜、计数器 |

---

## 八、一句话定位每个数据库

| 数据库 | 一句话 |
|---|---|
| **Oracle** | 银行/电信用的商业巨兽，语法最啰嗦但最强大 |
| **MySQL** | 互联网标配，轻快够用，分库分表生态成熟 |
| **SQL Server** | 微软全家桶成员，.NET 项目首选，SSMS 界面最好用 |
| **PostgreSQL** | 开源界的 Oracle，功能最全最标准，GIS/JSON/数组通吃 |
| **SQLite** | 全世界装机量最大的数据库（每台手机里都有），嵌入式之王 |
| **MongoDB** | JSON 文档存储，Schema 灵活，不想写 DDL 就用它 |
| **Redis** | 内存闪电侠，缓存/队列/排行榜一把梭，微秒级响应 |

---

## 九、面试考点速记

### SQL 通用

1. **LEFT JOIN vs INNER JOIN**：左连接保左表全量，内连接只保留交集。"查询所有部门及员工（含无员工的部门）"用 LEFT JOIN。
2. **WHERE 和 ON 在 LEFT JOIN 中的区别**：ON 是连接条件，WHERE 是最终结果过滤。LEFT JOIN 中把右表条件写 WHERE 会退化为内连接。
3. **FULL OUTER JOIN 在 MySQL 的替代**：`A LEFT JOIN B UNION A RIGHT JOIN B`。
4. **Oracle `(+)`** 是旧式外连接，不推荐使用。
5. **SQL 执行顺序**：`FROM → ON → JOIN → WHERE → GROUP BY → HAVING → SELECT → DISTINCT → ORDER BY → LIMIT`。

### 数据库选型

6. **PostgreSQL `::` 类型转换**、`RETURNING`、`DISTINCT ON`、`JSONB`、数组类型是最常见的"PG 特有"题。
7. **SQLite 是 RDBMS**，嵌入式、零配置、单文件、类型灵活。面试常问"和 MySQL 的区别"。
8. **MongoDB 不是关系型**，没有 JOIN（用嵌套或 `$lookup`），Schema 自由，BSON 文档存储。适合日志、爬虫、内容管理，不适合复杂关联和强事务。
9. **Redis 不是数据库**（是内存数据结构服务器），没有表、没有 SQL、没有 JOIN。用 Key 组织数据，数据结构丰富（String / Hash / List / Set / Sorted Set），微秒级响应。典型场景：缓存、排行榜、分布式锁、消息队列。
10. **三大类差异核心**：SQL 靠 JOIN 关联 → MongoDB 靠嵌套替代关联 → Redis 根本没有关联这个概念。
