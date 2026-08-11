---
title: 手工打包安卓APK踩坑笔记
published: 2026-08-11
description: "本机只有 Java 8、没有 Android Studio/Gradle，手工用 aapt2+d8+apksigner 打出可安装安卓 APK 的全流程与 9 个坑。"
tags: ["安卓", "APK", "打包", "从0到1"]
category: "技术"
draft: false
lang: zh-CN
---

# 手工打包安卓 APK 踩坑笔记（无 Android Studio / Gradle）

> 场景：本机只有 Java 8，没有 Android Studio、没有 Gradle、没有 Android SDK。目标是手工打出一个**可直接安装**的安卓 APK（一个 WebView 壳 + 内置 HTML 页面）。
> 结论：可行。核心三件套 `aapt2` / `d8` / `apksigner` 都在 build-tools 里，配合 platform 的 `android.jar` 即可完成。

---

## 一、环境准备

- Windows + Git Bash；JDK 8（`javac` / `keytool` / `jarsigner`）；Python（合并 dex 用）。
- 下载两个包（从 `https://dl.google.com/android/repository/`）：
  - 平台：`platform-29_r05.zip`（含 `android.jar`，API 29）
  - 构建工具：`build-tools_r29.0.3-windows.zip`（含 `aapt2.exe` / `d8.bat` / `zipalign.exe` / `apksigner.bat` / `lib/`）
- 两者解压后**内部根目录都叫 `android-10/`**，会合并到同一目录，正好把 `android.jar` 和 build-tools 工具放一起，不用额外挪动。

> 查准确文件名：拉 `https://dl.google.com/android/repository/repository2-3.xml`，grep `build-tools_r…_windows.zip`。

---

## 二、最终可用的完整构建流程

```bash
export JAVA_HOME=/d/JAVA/JDK8/.../jdk1.8.0_471
export PATH=$JAVA_HOME/bin:$PATH
BT=.../sdk/android-10                # android.jar 与 build-tools 工具所在目录
BT_W=$(cygpath -w "$BT")             # JVM 工具必须用 Windows 路径
PLAT_W=$(cygpath -w "$BT/android.jar")

# 1) 编译 Java（classpath 用 Windows 路径）
javac -cp "$PLAT_W" -d out src/com/fzy/blogpub/MainActivity.java

# 2) 打 dex —— 必须喂入【全部 .class】，含匿名内部类！
java -Djava.ext.dirs="$BT_W/lib" -cp "$BT_W/lib/d8.jar" com.android.tools.r8.D8 \
     --lib "$PLAT_W" --output out out/com/fzy/blogpub/*.class

# 3) 编译资源 + 链接（-A assets 把内置网页打进 APK；--auto-add-overlay 允许新增 <style>）
"$BT_W/aapt2.exe" compile --dir res -o res.flata
"$BT_W/aapt2.exe" link --auto-add-overlay -R res.flata -I "$PLAT_W" \
     --manifest AndroidManifest.xml -A assets -o app-unsigned.apk

# 4) 把 classes.dex 合并进 APK（aapt2 产出时不含 dex）
python combine.py app-unsigned.apk out/classes.dex app-combined.apk

# 5) 4 字节对齐（必须在签名之前）
"$BT_W/zipalign.exe" -p 4 app-combined.apk app-aligned.apk

# 6) 生成密钥库（一次性）+ 签名
keytool -genkeypair -keystore keystore.jks -alias fzykey -keyalg RSA -keysize 2048 \
        -validity 10000 -storepass android -keypass android \
        -dname "CN=fzy,OU=BlogPub,O=BlogPub,L=Unknown,ST=Unknown,C=CN"
java -Djava.ext.dirs="$BT_W/lib" -jar "$BT_W/lib/apksigner.jar" sign \
     --ks keystore.jks --ks-key-alias fzykey --ks-pass pass:android --key-pass pass:android \
     --out app-release.apk app-aligned.apk
```

`combine.py`（把 dex 塞进 aapt2 产出的 APK）：

```python
import sys, zipfile
src, dex, out = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(src,"r") as zin, zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as zout:
    for it in zin.infolist():
        zout.writestr(it, zin.read(it.filename))
    zi = zipfile.ZipInfo("classes.dex"); zi.compress_type = zipfile.ZIP_DEFLATED
    zout.writestr(zi, open(dex,"rb").read())
```

---

## 三、踩坑清单（按踩中顺序）

### 坑 1：build-tools 30.0.3 直接 404
- **现象**：`build-tools_r30.0.3-windows.zip` 下载返回 404。
- **原因**：Google 已下架该版本直链。
- **解决**：用 `29.0.3` 或 `33.0.2`（HEAD 测 206 可用）。准确文件名以仓库索引 XML 为准。

### 坑 2：两包解压后都叫 `android-10`
- **现象**：platform 与 build-tools 解压后根目录都是 `android-10/`。
- **原因**：Google 旧版包的内部命名惯例。
- **解决**：不用管，合并到同一目录反而方便——`android.jar` 与 `aapt2/d8/zipalign/apksigner` 同目录。

### 坑 3：JVM 工具不认 Git Bash 路径（最容易卡住）
- **现象**：`javac` 报「程序包 android.app 不存在 / 找不到符号」，好像 `android.jar` 没生效。
- **原因**：`javac` / `java` / `keytool` 是 Windows JVM，不认 `/e/xxx` 这种无盘符的 POSIX 路径，把 `android.jar` 当不存在。
- **解决**：用 `cygpath -w` 转成 `E:\xxx` 再传。原生 exe（`aapt2` / `zipalign`）无所谓，但 **JVM 工具必须转**。

### 坑 4：`d8.bat` / `apksigner.bat` 跑不起来
- **现象**：直接调 `.bat` 没反应、静默退出。
- **原因**：`.bat` 内部会 `call ..\tools\lib\find_java.bat` 找 Java，本机布局没这个文件，`java_exe` 为空，直接 `goto :EOF`。
- **解决**：绕过 `.bat`，直接调 jar：
  - d8：`java -Djava.ext.dirs=$BT/lib -cp $BT/lib/d8.jar com.android.tools.r8.D8 …`
  - apksigner：`java -Djava.ext.dirs=$BT/lib -jar $BT/lib/apksigner.jar …`
  - `-Djava.ext.dirs` 在 Java 8 仍有效，用于加载 `lib/` 下的依赖 jar。

### 坑 5：匿名内部类漏进 dex → 启动必崩（本次最痛）
- **现象**：APK 安装后一点就闪退，实机 Android 16 也崩。
- **原因**：`MainActivity` 里有 `new WebViewClient(){…}`、`new WebChromeClient(){…}` 两个匿名内部类，javac 生成 `MainActivity$1.class`、`MainActivity$2.class`。但 d8 只喂了 `MainActivity.class`，**两个内部类没进 dex**。运行时 `onCreate` 执行 `new WebViewClient()` → `NoClassDefFoundError` → 闪退。**任何 Android 版本都会崩**，跟 16 无关。
- **解决**：d8 输入用 `out/com/fzy/blogpub/*.class`（全部 class），不要只指定主类。
- **验证**：查 dex 字节里是否含**只属于内部类**的方法名（如 `onShowFileChooser` / `shouldOverrideUrlLoading`）；有则证明内部类字节码已进 dex。也可对比 dex 大小（本例 2916B → 4428B）。

### 坑 6：assets 没打进 APK → 白屏
- **现象**：App 不崩但白屏，WebView 加载 `file:///android_asset/index.html` 失败。
- **原因**：`aapt2 link` 默认不打包 assets 目录。
- **解决**：`aapt2 link` 加 `-A assets`。之后 `unzip -l xxx.apk` 应能看到 `assets/index.html`。

### 坑 7：aapt2 link 新增 `<style>` 报 “does not override”
- **现象**：加了 `res/values/themes.xml` 自定义主题后，link 报 `resource style/Theme.BlogPub does not override an existing resource`。
- **原因**：`-R res.flata` 把资源当 overlay，要求覆盖已有资源；新增的不行。
- **解决**：link 加 `--auto-add-overlay`。

### 坑 8：targetSdk 31+ 必须显式 `exported`
- **现象**：targetSdk 提到 34 后，带 intent-filter 的启动 Activity 不声明 `exported` 会有安装/启动异常。
- **解决**：主 Activity 加 `android:exported="true"`。

### 坑 9：zipalign 顺序
- 必须在签名**之前**对齐（对齐未签名的 APK），再 `apksigner sign`。顺序反了签名会失效 / 不对齐。

---

## 四、没有真机/模拟器时的验证清单

| 检查项 | 命令 | 看什么 |
|---|---|---|
| 包信息 | `aapt2 dump badging app.apk` | 包名 / 版本 / minSdk / targetSdk / 权限 / 图标 / 启动 Activity |
| 清单 | `aapt2 dump xmltree app.apk --file AndroidManifest.xml` | theme / icon / exported / targetSdk 是否正确写入并解析 |
| 签名 | `apksigner verify app.apk` | 是否 `SIGNATURE VALID` |
| 内容物 | `unzip -l app.apk` | `classes.dex` / `assets/index.html` / `res/…` 是否都在 |
| 内部类 | Python 读 dex 字节 | 搜内部类专属方法名，确认内部类已进 dex |

想做真机验证：装 platform-tools，手机开 USB / 无线调试，然后：

```bash
adb install -r app-release.apk
adb shell am start -n com.fzy.blogpub/.MainActivity
adb logcat | grep -iE "AndroidRuntime|FATAL"
```

---

## 五、一点体会

- 「手工打 APK」不神秘：APK 就是个带签名 + 对齐的 ZIP，核心三件套 `aapt2` / `d8` / `apksigner` 都在 build-tools 里。
- **最隐蔽的坑是内部类漏进 dex**——构建不报错、签名也过，只有运行时崩。以后凡是 d8/dx 打包，默认喂入**全部 .class**。
- 没有真机/模拟器时，dex 字节级检查 + badging + apksigner verify 能排除大部分问题，但**最终仍需真机跑一次确认**。
