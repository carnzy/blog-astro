---
title: Go 错误处理的 8 个反模式（学习整理）
published: 2026-07-08
description: 整理自 Go语言中文网 polarisxu 的文章。盘点 Go 里 8 个"看起来在处理、其实在埋雷"的错误处理写法，并给出正确姿势。
image: ""
tags:
  - Go
  - 错误处理
  - 学习笔记
category: Go
draft: false
lang: zh-CN
sourceLink: "https://mp.weixin.qq.com/s/bqrE50wTJeDn2D6bCRqhbQ"
author: polarisxu
licenseName: ""
licenseUrl: ""
---

> 本文是学习整理，原文出自 **Go语言中文网 · polarisxu** 的《Go 错误处理的 8 个反模式：那些你以为是最佳实践、其实是坑的写法》，原文链接：<https://mp.weixin.qq.com/s/bqrE50wTJeDn2D6bCRqhbQ>。代码与结论归原作者所有，这里只做重述与笔记化。

先放一段"看起来没问题"的代码：

```go
func processOrder(order *Order) error {
    if err := validateOrder(order); err != nil {
        return errors.New("validate failed: " + err.Error())
    }
    if err := checkInventory(order); err != nil {
        return errors.New("inventory failed: " + err.Error())
    }
    if err := chargePayment(order); err != nil {
        return errors.New("payment failed: " + err.Error())
    }
    if err := sendEmail(order); err != nil {
        log.Printf("email failed: %v", err) // 注意，只是 log
    }
    return nil
}
```

这段代码藏着好几个坑。`if err != nil` 看着啰嗦，但它强制你"显式面对每一个错误"。问题恰恰出在"显式"上——你必须自己想清楚怎么处理，于是就出现了大量"看起来在处理、其实在埋雷"的反模式。

下面整理 8 个最常见的。

## 一、直接吞错：`_ = doSomething()`

### 现象

```go
func init() {
    _ = loadConfig() // 不在乎失败
}

func handle() {
    _ = conn.Write(data) // 网络错误不重要
}
```

### 为什么是坑

**沉默 = 事故。**

- `loadConfig()` 失败：进程带着错配置启动，可能几小时后才崩。
- `conn.Write` 失败：客户端根本没收到响应，而你毫无知觉。

更糟的是，**静默失败在单测里查不出来**——测试只检查"返回值"，不检查"是否真的成功了"。

### 正确写法

**要么处理，要么返回。**

```go
// 选项 1：明确返回错误
func init() error {
    return loadConfig()
}

// 选项 2：处理（记录 + 告警）
func handle() {
    if err := conn.Write(data); err != nil {
        log.Error("write failed", "err", err, "conn", conn.RemoteAddr())
        metrics.WriteFailures.Inc()
    }
}
```

永远别写 `_ = someErrorReturningFunc()`。

## 二、错误信息泄露敏感数据

### 现象

```go
func login(username, password string) error {
    user, err := db.Query("SELECT * FROM users WHERE name = ?", username)
    if err != nil {
        return fmt.Errorf("query failed: user=%s password=%s err=%w",
            username, password, err)
    }
    if !checkPassword(user, password) {
        return fmt.Errorf("password mismatch for user=%s with hashed=%s",
            username, user.PasswordHash)
    }
    return nil
}
```

### 为什么是坑

**错误信息会进日志，日志会泄露。**

- 直接泄露：密码原文。
- 间接泄露：用户是否存在（攻击者据此知道哪些用户名有效）。
- 哈希泄露：让彩虹表攻击更容易。

真实事故：某公司把整个用户库的密码哈希写进了 panic 的 stack trace，因为某条 recover 路径里写了 `log.Printf("err: %+v", err)`。

### 正确写法

```go
func login(username, password string) error {
    user, err := db.Query("SELECT * FROM users WHERE name = ?", username)
    if err != nil {
        return fmt.Errorf("login query failed: %w", err) // 不带任何敏感信息
    }
    if user == nil {
        return errors.New("invalid credentials") // 不区分"用户不存在"还是"密码错"
    }
    if !checkPassword(user, password) {
        return errors.New("invalid credentials")
    }
    return nil
}
```

**错误信息只说"发生了什么"，不说"细节是什么"。**

## 三、用 panic 处理业务错误

### 现象

```go
func processOrder(order *Order) {
    if order.Total < 0 {
        panic("invalid order total") // "快速失败"
    }
    // ...
}

// 调用方
defer func() {
    if r := recover(); r != nil {
        log.Println("recovered:", r)
    }
}()
processOrder(order)
```

### 为什么是坑

**panic 是给"不可恢复的错误"用的，不是给"业务校验失败"用的。**

业务错误（参数无效、库存不足、支付超时）都是**预期内的失败**，应该用 `error` 返回，交给调用者决定怎么处理。

panic 只该用于：

- 数组越界（这是 bug）
- nil 指针解引用（这是 bug）
- 主动 `panic("invariant violated")`（程序员的断言）

把业务错误用 panic 处理会导致：性能下降（栈展开开销）、调试困难、跨 goroutine 时 panic 无法 recover。

### 正确写法

```go
func processOrder(order *Order) error {
    if order.Total < 0 {
        return fmt.Errorf("invalid order total: %d", order.Total)
    }
    // ...
    return nil
}

// 调用方
if err := processOrder(order); err != nil {
    log.Error("process order failed", "err", err, "order_id", order.ID)
    return err
}
```

## 四、用 string 比较错误

### 现象

```go
if err.Error() == "file not found" {
    // 处理文件不存在
}

if strings.Contains(err.Error(), "connection refused") {
    // 重试
}
```

### 为什么是坑

**字符串比较是典型的"魔法字符串"反模式。**

- 错误信息一旦改动，这段代码就失效。
- 不同语言版本的错误信息可能不同。
- 嵌套错误里子错误的信息会被截断。

### 正确写法

**用 `errors.Is` / `errors.As`**（Go 1.13+）。

```go
// errors.Is：值比较
if errors.Is(err, os.ErrNotExist) {
    // 处理文件不存在
}

// errors.As：类型比较
var netErr *net.OpError
if errors.As(err, &netErr) {
    // 处理网络错误
}
```

标准库提供"哨兵错误"和"错误类型"，本来就是为了让你别去比字符串。

## 五、自定义错误却忘了实现 Is/As

### 现象

```go
type APIError struct {
    Code int
    Msg  string
}

// 只实现了 Error()，没实现 Is()
func (e *APIError) Error() string {
    return fmt.Sprintf("api error %d: %s", e.Code, e.Msg)
}

// 调用方希望 APIError{Code: 429} 能匹配 ErrAPIRateLimit
if errors.Is(err, ErrAPIRateLimit) {
    // ...
}
```

### 为什么是坑

如果不实现 `Is` 方法，调用方用 `errors.Is` 比对时，只能靠"指针相等"或"类型+值相等"判断。而经过 `%w` 层层 wrap 之后的错误，需要 `Is` 方法才能正确穿透。

### 正确写法

```go
func (e *APIError) Error() string {
    return fmt.Sprintf("api error %d: %s", e.Code, e.Msg)
}

func (e *APIError) Is(target error) bool {
    t, ok := target.(*APIError)
    if !ok {
        return false
    }
    return e.Code == t.Code // 按业务码匹配
}
```

**自定义 error 类型，要么实现 Is/As，要么明确"不支持 wrap 比对"。**

## 六、同一个错误 log 两遍

### 现象

```go
func handle() error {
    if err := doSomething(); err != nil {
        log.Error("doSomething failed", "err", err)        // 第 1 次 log
        return fmt.Errorf("doSomething failed: %w", err)
    }
    return nil
}

// 调用方
if err := handle(); err != nil {
    log.Error("handle failed", "err", err)                // 第 2 次 log（同一个 err）
}
```

### 为什么是坑

**同一个错误被 log 两遍**，日志搜索、错误聚合、告警去重全乱套。生产环境常见这种场景：某个错误一秒被 log 几万次，磁盘爆满，告警也疲劳了。

### 正确写法

**错误只 log 一次**——要么在源头 log，要么在最外层 log，二选一。

```go
// 方案 1：源头 log
func handle() error {
    if err := doSomething(); err != nil {
        log.Error("doSomething failed", "err", err) // 只 log 一次
        return err                                 // 不再 wrap
    }
    return nil
}

// 方案 2：最外层 log
func handle() error {
    if err := doSomething(); err != nil {
        return fmt.Errorf("doSomething failed: %w", err) // wrap 但不 log
    }
    return nil
}

// 调用方统一 log
if err := handle(); err != nil {
    log.Error("handle failed", "err", err)
}
```

**中间层只 wrap，不 log；只有最外层或源头才 log。**

## 七、wrap 错误用 `%v` 而不是 `%w`

### 现象

```go
if err != nil {
    return fmt.Errorf("operation failed: %v", err) // %v 而不是 %w
}
```

### 为什么是坑

`%v` 格式化之后，错误**链路被打断**。调用方再用 `errors.Is(err, os.ErrNotExist)` 检查时会返回 `false`。

这是 Go 1.13 之后最容易踩的坑——`%w` 早就引入了，很多人却没改习惯。

### 正确写法

```go
if err != nil {
    return fmt.Errorf("operation failed: %w", err) // %w 保留链路
}
```

**默认 wrap 都用 `%w`，除非你是故意想"切断链路"。**

## 八、recover 把 panic 悄悄吞掉

### 现象

```go
func handle() {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("recovered: %v", r) // 只是 log
        }
    }()
    process()
}
```

### 为什么是坑

`recover` 的目的是**让程序能继续运行**，但如果 recover 之后既不重新 panic、也不返回 error，你就是**把 bug 藏起来了**。

真实事故：某服务 panic 后被 recover 吞掉，进程没崩，但后续所有请求都返回空数据。运维看监控以为"流量掉了"，其实是"全错了"。

### 正确写法

**recover 之后必须做点什么。**

```go
// 选项 1：转成 error 返回
func handle() (err error) {
    defer func() {
        if r := recover(); r != nil {
            err = fmt.Errorf("panic recovered: %v", r)
        }
    }()
    process()
    return nil
}

// 选项 2：记录 + 告警
func handle() {
    defer func() {
        if r := recover(); r != nil {
            stack := debug.Stack()
            log.Error("PANIC", "panic", r, "stack", stack)
            metrics.PanicCount.Inc()
            alerting.Send("panic", r, stack) // 告警值班
        }
    }()
    process()
}
```

**recover 永远不是"让它消失"，而是"把它转换"——要么转成 error 返回，要么转成告警通知。**

## 总结

Go 的错误处理看着"啰嗦"，其实是为了**强制你思考"如果失败了怎么办"**。

这 8 个反模式，浓缩成一句话：

> **错误要么处理，要么传递。绝不沉默，绝不双 log，绝不拿 panic 当 error 用。**

记住 4 条核心原则：

1. **错误只 log 一次**（源头或最外层，二选一）。
2. **wrap 错误用 `%w`**（Go 1.13+ 默认）。
3. **比对错误用 `errors.Is` / `errors.As`**（别比 string）。
4. **敏感信息不进 error**（密码、token、密钥）。

下次再看到 `_ = doSomething()` 或者 `panic("xxx")`，就该警觉了。

**错误处理不是"`if err != nil` 就完事"，而是"`if err != nil` 然后呢？"**

---

**参考资料：**

1. Working with Errors in Go 1.13: <https://go.dev/blog/go1.13-errors>
2. errors 包文档: <https://pkg.go.dev/errors>
3. Effective Go - Errors: <https://go.dev/doc/effective_go#errors>
4. Go Code Review Comments - Errors: <https://github.com/golang/go/wiki/CodeReviewComments#errors>
5. Uber Go Style Guide - Errors: <https://github.com/uber-go/guide/blob/master/style.md>
