# 如何手动推送小改动到 GitHub — 从 0 到 1 教程

## 前置条件

1. 已安装 [Git](https://git-scm.com/)
2. 已在 GitHub 上创建仓库并关联远程地址
3. 终端（Windows 用 Git Bash 或 PowerShell，macOS/Linux 用终端）

---

## 完整流程（每次小改动都这样操作）

假设你修改了项目中的某些文件，想把改动同步到 GitHub。

### 第一步：查看当前状态

```bash
git status
```

这会显示：
- **红色文件名** — 已修改但未暂存的文件（modified）
- **红色文件名（Untracked）** — 新建但未跟踪的文件
- **绿色文件名** — 已暂存、准备提交的文件

> 💡 养成习惯：每次 `git commit` 前先 `git status`，确认你要提交的是哪些文件。

### 第二步：暂存文件

```bash
# 暂存单个文件
git add src/config/backgroundWallpaper.ts

# 暂存所有修改过的文件（推荐用于小改动）
git add .

# 暂存某个目录下的所有文件
git add src/config/
```

| 命令 | 含义 |
|------|------|
| `git add <文件名>` | 把指定文件加入暂存区 |
| `git add .` | 把当前目录下所有改动加入暂存区 |
| `git add -A` | 把整个仓库所有改动加入暂存区 |

> ⚠️ `git add .` 只在当前目录生效。如果你在项目根目录运行，它等价于 `git add -A`。

### 第三步：提交

```bash
git commit -m "你的提交信息"
```

提交信息规范（推荐）：
```
<类型>: <简短描述>

类型包括：
  feat      — 新功能
  fix       — 修复 bug
  chore     — 杂项（配置、依赖更新等）
  refactor  — 重构代码
  docs      — 文档
  style     — 格式调整

示例：
  git commit -m "feat: 添加用户登录功能"
  git commit -m "fix: 修复导航栏在移动端错位"
  git commit -m "chore: 更换横幅标题"
```

### 第四步：推送到 GitHub

```bash
git push
```

如果远程分支名和本地不同（比如本地是 `master`，远程是 `main`）：

```bash
git push origin master:main
```

格式：`git push origin <本地分支名>:<远程分支名>`

---

## 你的项目实际情况

| 项目 | 值 |
|------|-----|
| 远程仓库 | `github.com:carnzy/blog-astro.git` |
| 本地分支 | `master` |
| 远程分支 | `main` |
| 推送命令 | `git push origin master:main` |

---

## 一条命令搞定（快捷方式）

如果你只改了一两个文件且确认无误，可以跳过 `git status`，直接：

```bash
git add . && git commit -m "你的提交信息" && git push origin master:main
```

- `&&` 表示前一条成功才执行下一条
- 如果 commit 失败（比如没有改动），push 不会执行

---

## 常见问题处理

### Q1: push 被拒绝（远程有别人的新提交）

```
 ! [rejected]  master -> main (fetch first)
```

**解决**：先拉取再推送

```bash
git pull origin main --rebase
git push origin master:main
```

`--rebase` 让你的提交排在远程提交之后，保持历史整洁。

### Q2: 想撤销最后一次 commit（还没 push）

```bash
git reset --soft HEAD~1
```

这会保留你的文件改动，只撤销 commit 本身。

### Q3: 想撤销已经 push 的 commit

```bash
git revert HEAD
git push origin master:main
```

这会创建一个新的"反向 commit"，不会改写历史（安全做法）。

### Q4: 想看提交历史

```bash
git log --oneline -5    # 最近5条，一行一条
git log --graph --oneline  # 带分支图的提交历史
```

### Q5: 想丢弃某个文件的改动

```bash
git restore <文件名>           # 丢弃工作区改动
git restore --staged <文件名>   # 取消暂存（回到 modified 状态）
```

---

## 心智模型

```
工作区 (Working Directory)    暂存区 (Staging Area)     本地仓库 (Local Repo)      远程仓库 (GitHub)
   |                              |                        |                        |
   你编辑文件                      |                        |                        |
   |                              |                        |                        |
   └──── git add ────────────────→|                        |                        |
                                  你选择哪些改动要提交       |                        |
                                  |                        |                        |
                                  └──── git commit ───────→|                        |
                                                           改动被永久记录            |
                                                           |                        |
                                                           └──── git push ─────────→|
                                                                                    改动同步到 GitHub
```

- **git add** = 拍照前选好要入镜的东西
- **git commit** = 按下快门，留下一张永久快照
- **git push** = 把相册上传到云端

---

## 总结：每次小改动的标准流程

```bash
# 1. 看看改了什么
git status

# 2. 加入暂存区
git add .

# 3. 提交（写好信息）
git commit -m "chore: 修改横幅标题"

# 4. 推送到 GitHub
git push origin master:main
```

四步，每次改动都这样走一遍就不会出错。
