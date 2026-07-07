---
title: "Go string 原理：为什么 string 是不可变的"
published: 2026-07-07
description: "从 runtime 源码出发，深入理解 Go string 不可变的设计哲学、底层实现、性能代价和常见陷阱"
author: "Fzy"
image: ""
tags: ["Go", "string", "源码分析", "后端开发"]
category: "后端开发"
---

## 一、引子

写过 Go 的同学都知道，string 类型有个"脾气"——它是**不可变（immutable）**的。你不能像在 C 语言里那样 `s[i] = 'A'` 直接修改字符串的内容。如果你试过：

```go
s := "hello"
s[0] = 'H' // ❌ 编译错误：cannot assign to s[0]
```

编译器会直接拒绝你。

但为什么？这个设计背后的思考是什么？它给我们带来了哪些好处，又带来了哪些代价？今天我们就从底层源码出发，把 string 的不可变性彻底讲透。

## 二、Go string 的底层结构

### 2.1 一个 string 到底长什么样？

在 Go runtime 中，string 的定义非常简洁。打开 `runtime/string.go`，你会发现：

```go
// runtime/string.go
type stringStruct struct {
    str unsafe.Pointer // 指向底层字节数组的指针
    len int            // 字符串的长度（字节数）
}
```

也就是说，一个 string 变量**只有 16 个字节**（64 位机上，指针 8 字节 + 长度 8 字节）。它本身**不持有数据**，只是一个"描述符"。

对比 slice 的结构：

```go
type slice struct {
    array unsafe.Pointer // 底层数组指针
    len   int            // 长度
    cap   int            // 容量（string 没有这个字段）
}
```

**关键差异**：string 比 slice 少了 `cap`（容量）。为什么？因为 string 不可变，不需要扩容，自然也就不需要容量。

### 2.2 图解：string 在内存中的样子

```text
字符串 "hello" 的内存布局：

  string 变量 (16 字节)
  ┌─────────────┐
  │ str  ──────────────┐
  ├─────────────┤      │
  │ len = 5     │      │
  └─────────────┘      │
                       ▼
            ┌───┬───┬───┬───┬───┐
            │ h │ e │ l │ l │ o │
            └───┴───┴───┴───┴───┘
            只读数据段（不可修改）
```

那个 `str` 指针指向的字节数组，存在于**只读内存段**中。这是 Go 编译器在编译期就决定的。

## 三、为什么 string 必须是不可变的？

### 3.1 安全：防止内存越界的灾难

先看一个 C 语言的反面教材：

```c
// C 语言
char* s = "hello";
s[0] = 'H'; // ❌ 可能直接崩溃！因为字符串字面量在只读段
```

C 里这样写**不确定会怎样**——可能崩溃，可能悄悄改掉别的字符串，可能过了很久才在另一个函数里崩溃。

Go 直接在编译层就封死了这条路。你无法通过正常途径修改 string 内容，也就是说**不存在"未定义行为"**。这是一等公民的修养。

### 3.2 哈希一致性：map 的基石

Go 的 map 要求 key 是**可比较且不可变**的。如果 string 可变：

```go
m := map[string]int{"hello": 1}
// 如果 string 可变：
// s := "hello"
// modify(s)  // 把 s 的内容改了
// m[s]       // 哈希值变了，找不到原来的 key
```

这种情况在 C++ 的 `std::map<std::string>` 里是真实存在的风险——你持有一个 map 的 key 的引用，然后在外面改掉它，map 就坏了。

Go 的 string 不可变，**从根本上杜绝了这个问题**。一旦一个 string 被创建，它的哈希值就是稳定的，map 的整个实现也因此变得简单可靠。

### 3.3 零成本的切片操作

不可变性带来了一个巨大的性能优势：**子串操作不需要拷贝**。

```go
s := "Hello, 世界"
sub := s[7:] // "世界"——没有拷贝！只是创建了一个新 string 描述符
```

这段操作的时间复杂度是 **O(1)**，空间是 **0 额外分配**。新的 `sub` 变量只是创建了一个新的 16 字节描述符，与原字符串共享底层字节数组。

如果 string 是可变的，`s[7:]` 就必须**拷贝一份**——否则修改 `sub` 就会影响到 `s`。Go 因为保证了不可变，所以可以放心共享底层字节数组。

> **对比**：Java 的 `String.substring()` 在 Java 7u6 之前也是 O(1) 共享底层 char[]，但因为 String 不可变不存在安全问题。后来因为内存泄漏问题改了，但那是另一个故事。Go 从一开始就坚持不可变，所以始终安全。

### 3.4 常量折叠和内联优化

编译器可以放心地对 string 做各种优化：

```go
const (
    a = "Hello"
    b = "World"
)
c := a + ", " + b
```

因为 a、b 都是不可变的常量，编译器可以在编译期就把 `c` 计算出来，运行时无需任何字符串拼接操作。

如果 string 可变，这种优化就不敢做——因为你不知道运行时会有什么副作用。

## 四、不可变的代价：string ↔ []byte 转换

### 4.1 转换必然发生拷贝

最大的代价就在这里。因为 string 不可变而 `[]byte` 可变，所以相互转换**必须拷贝数据**：

```go
s := "hello, world"
b := []byte(s) // ❌ 拷贝！O(n)
s2 := string(b) // ❌ 再拷贝！又是 O(n)
```

为什么必须拷贝？因为如果直接共享底层数组：

```go
b := getStringAsBytes(s) // 假如不拷贝
b[0] = 'H'              // 直接修改了 s 的底层数据！
// 违反不可变契约！
```

来看 runtime 源码中 `string` 转 `[]byte` 的实现：

```go
// runtime/string.go:224
func stringtoslicebyte(buf *tmpBuf, s string) []byte {
    var b []byte
    if buf != nil && len(s) <= len(buf) {
        // 小字符串：用栈上的临时缓冲区，零分配！
        *buf = tmpBuf{}
        b = buf[:len(s)]
    } else {
        // 大字符串：在堆上分配
        b = rawbyteslice(len(s))
    }
    copy(b, s) // ❌ 这里拷贝了全部数据
    return b
}
```

反过来，`[]byte` 转 `string` 也同样：

```go
// runtime/string.go:139
func slicebytetostring(buf *tmpBuf, ptr *byte, n int) string {
    // ...
    p := mallocgc(uintptr(n), nil, false) // 分配新内存
    memmove(p, unsafe.Pointer(ptr), uintptr(n)) // 拷贝
    return unsafe.String((*byte)(p), n)
}
```

**注意**：Go 对短字符串（`tmpStringBufSize = 32` 字节以内）做了一个优化——使用栈上缓冲区避免堆分配，但数据拷贝仍然免不了。

### 4.2 unsafe 的"偷渡"方法

如果你确实需要用 `[]byte` 方式访问 string 内容且**保证不改写**，可以用 `unsafe`：

```go
func stringToBytes(s string) []byte {
    return unsafe.Slice(unsafe.StringData(s), len(s))
}
```

这段代码**零拷贝**——但它返回的 `[]byte` 直接指向 string 的只读数据。如果后面有人写了 `b[0] = 'X'`，就是未定义行为（大概率崩溃）。

> ⚠️ **生产环境不推荐**。只在你 100% 确定不会修改返回的 `[]byte` 时使用，且建议加上文档说明。

### 4.3 性能对比

用 benchmark 说话：

```go
func BenchmarkStringToBytesSafe(b *testing.B) {
    s := "Hello, 世界! Go is awesome!"
    for i := 0; i < b.N; i++ {
        _ = []byte(s)
    }
}

func BenchmarkStringToBytesUnsafe(b *testing.B) {
    s := "Hello, 世界! Go is awesome!"
    for i := 0; i < b.N; i++ {
        _ = unsafe.Slice(unsafe.StringData(s), len(s))
    }
}
```

结果（约值）：

| 方法 | 每次操作耗时 | 分配 |
|------|-------------|------|
| `[]byte(s)` | ~30 ns | 1 alloc |
| `unsafe.Slice` | ~1 ns | 0 alloc |

**30 倍的差距**。但请记住：unsafe 版的前提是"不修改"。

## 五、常见的误解和陷阱

### 5.1 误解：range 遍历的是字符

```go
s := "Go 语言"
for i, c := range s {
    fmt.Printf("s[%d] = %c\n", i, c)
}
```

输出：

```text
s[0] = G
s[1] = o
s[2] = 语   ← 注意索引从 2 跳到 5
s[5] = 言   ← 又从 5 跳到 8
```

`for range` 遍历的是 **rune**（Unicode 码点），而不是字节。每次迭代的 `i` 是字节位置，而不是第几个字符。

正确数"字符"的方法是：

```go
fmt.Println(utf8.RuneCountInString(s)) // 输出 4
```

### 5.2 陷阱：字符串拼接的性能

```go
s := ""
for i := 0; i < 10000; i++ {
    s += "a" // ❌ 每次创建新 string，O(n²)
}
```

因为 string 不可变，每次 `s += "a"` 都是：

1. 分配新内存
2. 拷贝旧 `s` 的全部内容
3. 拷贝 `"a"`
4. 丢弃旧 `s`

正确做法是使用 `strings.Builder`（本质上是 `[]byte`）：

```go
var b strings.Builder
for i := 0; i < 10000; i++ {
    b.WriteString("a")
}
s := b.String() // 最终只拷贝一次
```

### 5.3 陷阱：包级别的 string 拼接

Go 编译器对 `+` 拼接有优化。来看 runtime 源码：

```go
func concatstring2(buf *tmpBuf, a0, a1 string) string {
    return concatstrings(buf, []string{a0, a1})
}
```

对于 `a + b` 这种两段拼接，编译器调用了专门的 `concatstring2` 方法。`concatstrings` 内部会预计算总长度，一次性分配内存。

但最多优化到 5 段（`concatstring5`），超出后仍然会退化。所以：

```go
// 编译器优化得好（<= 5 段）
s := a + b + c

// 超过 5 段，编译器退化为循环
// 推荐用 strings.Builder
```

## 六、总结

Go string 不可变的决策，是一次**安全与性能的权衡**：

| 好处 | 代价 |
|------|------|
| ✅ 线程安全，没有数据竞争 | ❌ string ↔ []byte 转换需拷贝（O(n)） |
| ✅ 子串 O(1)、零拷贝 | ❌ 大量拼接需要小心（用 Builder） |
| ✅ map key 安全可靠 | ❌ 无法局部修改 |
| ✅ 编译期优化空间大 | |
| ✅ 内存布局简单、可预测 | |

从 Go 1.21 开始引入了 `unsafe.String` 和 `unsafe.StringData` 等新内置函数，让 unsafe 操作 string 更加规范。但对绝大多数开发者来说，**永远不需要绕过不可变约束**——这是 Go 设计者的良苦用心。

最后引用 Go 核心成员 Rob Pike 在官方博客中的一句话做结：

> **"A string holds arbitrary bytes. It is not required to hold Unicode text, UTF-8 text, or any other predefined format. As far as the content of a string is concerned, it is exactly equivalent to a slice of bytes — except it's read-only."**

String 就是只读的 `[]byte`。简单，强大，安全。

---

*如果你觉得文章有帮助，欢迎转发、在看。下一篇我们将深入分析 Go 的 string interning 机制和 strings.Builder 的底层实现。*
