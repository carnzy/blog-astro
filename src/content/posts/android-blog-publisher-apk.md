---
title: 不装 Android Studio，手工打出可安装的安卓 APK（从0到1）
published: 2026-08-11
description: 一台只有 Java 8 的 Windows，没有 Android Studio、没有 Gradle，也能做出可直接安装的安卓 APK。本文拆解手工打包链路（aapt2 + d8 + apksigner），并复用它做了一个「本地 Markdown 一键发博客」的安卓工具。
tags: [安卓, APK, 从0到1, 技术原理, 打包]
category: 技术
draft: false
lang: zh-CN
---

## 背景：想在手机上直接发博客

我的博客（[fzy.it.com](https://www.fzy.it.com)）是用 Astro 生成的静态站，文章放在仓库 `src/content/posts/`，推到 `main` 分支后由 Cloudflare Pages 自动构建部署。

平时在电脑上发布很顺：写 Markdown、提交、推送即可。但有时候人在外面，只有手机，想随手记一篇并发出来。于是我想做一个**安卓 App**：在手机上选一个本地 `.md` 文件，填几个字段，一键推到 GitHub 触发部署。

需求很小，但为了它去装一整套 Android Studio + Gradle + SDK，代价太大。我这台 Windows 上只有 **Java 8**，没有 Android SDK、没有 Gradle。能不能"裸手"打出一个 APK？

能。而且过程本身，就是一个很好的「从 0 到 1」技术原理例子。

## 整体方案：一个 WebView 壳 + 一个内置网页

安卓原生的完整 UI 开发（Jetpack、Material、各种 Widget）学习成本不低，而我的核心功能其实是一个网页：文件选择、表单、调用 GitHub API。所以架构非常薄：

- **原生层**：一个 `MainActivity`，里面只有一个 `WebView`，加载内置的 `assets/index.html`。
- **网页层**：`index.html` 是一个纯前端的单页应用，负责设置 GitHub Token、选 `.md` 文件、生成 frontmatter、调用 GitHub 接口发布。

WebView 天然支持 JavaScript、文件选择器（`WebChromeClient.onShowFileChooser`）和 `fetch`，所以网页层几乎能做全部事情。这样我只需要编译**一个 Java 文件**，其余逻辑都是 HTML/JS，迭代极快。

## 没有 Android Studio，APK 是怎么来的？

一个 APK 本质上是一个 ZIP 包，里面至少有三样东西：

1. `AndroidManifest.xml`（编译后的二进制清单）
2. `classes.dex`（把 Java 字节码编译成的 Dalvik 字节码）
3. 资源 / 资产（`resources.arsc`、`res/`、`assets/`）

Android SDK 的 **build-tools** 里就藏着生产这三样的命令行工具：

- `aapt2`：编译资源、把清单和资源打包成 APK 骨架；
- `d8`：把 `.class` 转成 `.dex`；
- `apksigner`：给 APK 签名（没有签名，安卓拒绝安装）。

只要拿到 build-tools 和对应的 `android.jar`（平台 API 桩），就能绕开 Gradle 手工完成全部流程。

### 环境准备

只需要 Java 8（用来跑 `javac` / `d8` / `apksigner`），以及两个压缩包：

- 平台 API 29：`https://dl.google.com/android/repository/platform-29_r05.zip`
- 构建工具 29.0.3：`https://dl.google.com/android/repository/build-tools_r29.0.3-windows.zip`

> 小坑：这两个包解压后，内部根目录都叫 `android-10`，会合并到同一个目录，正好把 `android.jar` 和 `aapt2/d8/zipalign/apksigner` 放在一起，不用额外挪动。

### 手工打包链路

```bash
# 1) 用平台 android.jar 编译 Java
javac -cp android.jar -d out src/com/fzy/blogpub/MainActivity.java

# 2) 把 .class 编译成 classes.dex（d8 依赖 lib 下的 jar，用 -Djava.ext.dirs 加载）
java -Djava.ext.dirs=build-tools/lib -cp build-tools/lib/d8.jar \
     com.android.tools.r8.D8 --lib android.jar --output out out/MainActivity.class

# 3) aapt2 链接清单与资源；-A assets 把内置网页打进 APK
aapt2 link -I android.jar --manifest AndroidManifest.xml -A assets -o app-unsigned.apk

# 4) 把 classes.dex 合并进 APK（aapt2 产出时还不含 dex）
python combine.py app-unsigned.apk out/classes.dex app-combined.apk

# 5) 4 字节对齐（签名前必须做）
zipalign -p 4 app-combined.apk app-aligned.apk

# 6) 用自签名密钥库签名
apksigner sign --ks keystore.jks --ks-key-alias fzykey --out app-release.apk app-aligned.apk
```

最后得到的 `app-release.apk`，用 `apksigner verify` 检查会显示 `SIGNATURE VALID`，可以直接安装到手机。

### 两个容易踩的坑

1. **JVM 工具必须吃 Windows 绝对路径。** `javac` / `java` 这类 Windows 上的 Java 程序，不认 Git Bash 的 `/e/...` 这种 POSIX 路径（没有盘符），会报"找不到 `android.jar`、所有 `android.*` 包都不存在"。用 `cygpath -w` 转成 `E:\...` 再传进去就正常了。
2. **内置网页要用 `-A assets` 打进 APK。** 我第一版忘了这一步，APK 里没有 `index.html`，App 一打开就空白。加上 `-A assets` 后，`file:///android_asset/index.html` 才能加载到。

## 发布流程：App 里直接调 GitHub API

App 的网页层在"发布"时，做的事其实就是往仓库里**新增/更新**一个文件：

```js
const path = `src/content/posts/${slug}.md`;
const content = "---" + frontmatter + "---" + body;          // 拼好整篇 Markdown
const bodyObj = {
  message: `publish: ${slug}`,
  content: btoa(unescape(encodeURIComponent(content))),       // UTF-8 -> base64
  branch: "main"
};
// 若文件已存在，先 GET 拿到 sha，再带上 sha 走 PUT（即"更新"语义）
await fetch(`https://api.github.com/repos/carnzy/blog-astro/contents/${encodeURIComponent(path)}`, {
  method: "PUT",
  headers: { Authorization: "token " + token, "Content-Type": "application/json" },
  body: JSON.stringify(bodyObj)
});
```

PUT 成功即代表文件已落到 `main`，Cloudflare Pages 随后自动构建。App 会直接给出线上链接 `https://www.fzy.it.com/posts/<slug>/`（通常 1–2 分钟生效）。

> 安全提示：Token 仅保存在手机本机 WebView 的 `localStorage` 中，且只需 `public_repo`（公开仓库）或 `repo`（私有仓库）权限，不要给它账户级全部权限。

## 成果

我把上面这套方法做成了一个可直接安装的 APK：**在手机上选本地 `.md` → 自动解析 frontmatter → 一键发到博客**。它体积小（不到 20KB），因为它本质就是"一个 WebView + 一个网页"。

更进一步，我顺手把 targetSdk 提到了 34、加上了应用图标，方便正式侧载分发（注意：targetSdk 31+ 要求带 intent-filter 的组件必须显式声明 `android:exported`，我的主 Activity 已经声明）。

如果你也想自己打一个，思路就是本文这几条命令——**只要 Java 8 + 两个 SDK 压缩包，就能脱离 Android Studio 产出可安装的 APK。**

---

*本文既是技术原理，也是这个安卓发布工具自己的"出生证明"：它讲的方法，正好造出了它自己。*
