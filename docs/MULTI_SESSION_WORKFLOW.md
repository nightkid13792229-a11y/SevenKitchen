# 多会话协作：任务工位与共享出口门禁（2026-11-03）

> 适用：本机同时开多个 AI 会话/多个终端改同一个仓库。
> 目标：让"改动有归属、共享资源排队"，而不是靠会话自觉。

## 一、要解决的问题

过去出现过的四类撞车：

1. 两个会话在**同一个工作区**里改，互相看见对方的未提交文件；
2. 一个会话 `git add -A`，把**另一个会话的改动**一起提交了；
3. 两个任务**挤在同一个分支**上，提交历史分不清谁是谁；
4. 别人的任务测试没过，自己这边也跟着紧张，不知道是不是自己弄坏的。

根因是同一个：**改动没有归属**。所以规范不是"提醒大家小心"，而是给每个任务划边界，
给共享资源加门禁。

## 二、三条边界

### 1. 主工作区只读

主工作区：`/Users/zhaochen/Documents/SevenKitchen`

- 只做两件事：**合并**、**部署**。
- 不写代码、不提交、不 `git add`。
- 主工作区里如果出现未提交改动，说明有会话没按规矩开工位；先归位，再继续。

### 2. 一个任务 = 一个工位 + 一个分支

- 工位目录：`主工作区/.worktrees/日期-短名`
- 分支：`task/日期-短名`
- 分支永远从最新的 `origin/main` 切出，不搭在别的任务分支上。
- 一个工位只做一个任务；合并后清理，不重复使用。
- 第二个任务需要第一个任务的代码时：等它合并进 main，再切自己的工位；
  不要直接把两个任务塞进一个分支。

### 3. 共享出口排队

下面五件事是"全仓库只有一份"的资源，动之前先拿门禁：

| 资源名 | 对应动作 | 默认 TTL |
|---|---|---|
| `merge-main` | 合并/推送 main | 30 分钟 |
| `deploy-backend` | 部署后端 | 60 分钟 |
| `deploy-admin-web` | 部署后台 | 30 分钟 |
| `upload-trial` | 上传小程序体验版 | 30 分钟 |
| `db-migrate` | 跑 Prisma migration | 30 分钟 |

- 合并和三个部署/上传脚本会**自动拿门禁**，不用手动加。
- `gate.sh acquire` 手动拿的锁不会因为命令退出自动释放，只按 TTL 过期；
  用完请用 `gate.sh release <资源> --token <token>` 释放。
- `gate.sh run` 会在命令运行期间持锁，命令结束（成功或失败）自动释放。
- 手动跑 migration 时用：
  ```bash
  bash scripts/gate.sh run db-migrate --task "迁移说明" --ttl 1800 -- npx prisma migrate deploy
  ```
- 看谁占着：
  ```bash
  bash scripts/gate.sh status
  ```

## 三、日常流程

### 开工

```bash
cd /Users/zhaochen/Documents/SevenKitchen
bash scripts/session.sh start "订单卡片改版"
```

脚本会：

- 从 `origin/main` 建工位和分支；
- 复制 `backend/.env`、`backend/.env.development`、`admin-web/.env.development`（如果存在）；
- 用 APFS 克隆 `node_modules`（几秒，不额外占盘）；
- 分配一个空闲端口（3012 起），写进工位里的 `.env`；
- 在共享登记里记下：任务名、分支、工位、端口、会话 PID。

然后按提示 `cd` 进工位干活。

> 中文任务名也可以；短名会退化成时间戳，任务名仍完整记在登记里。
> 想指定英文短名：`--slug order-card`。

### 干活

```bash
cd ".worktrees/20261103-order-card"
# ...改代码...
```

启动本地后端时带上分配到的端口（`session.sh status` 能看到）：

```bash
cd backend
PORT=3012 npm run start:dev:miniapp
```

### 提交

```bash
bash scripts/session.sh commit -m "feat(order): 订单卡片改版"
```

- 只允许在工位里提交；在主工作区提交会被拒绝。
- 默认只提交**已暂存**的内容；要整包提交用 `--all`，或显式列文件。
- 提交前会拦：`.env`、`node_modules`、`dist`、`.DS_Store`、超过 5MB 的文件、未解决的冲突标记。
- 提交信息里写清任务，出问题能追。

### 收尾

```bash
bash scripts/session.sh finish    # 推分支到 origin（备份）
bash scripts/session.sh merge     # 拿 merge-main 门禁 → rebase → 合并 → 推 main
```

`merge` 做的事：

1. 拿 `merge-main` 门禁（拿不到会显示谁在合并）；
2. `fetch origin/main`，把任务分支 rebase 到最新 main；
3. 推任务分支（备份）；
4. 检查主工作区干净、在 main、没有未推送提交；
5. 快进合并到主工作区，推送 main；
6. 如果推送时别人刚好也推了，自动重试最多 3 次。

合并完成后：

```bash
bash scripts/session.sh cleanup task/20261103-order-card
```

清理工位和分支。未合并的分支默认拒绝清理；确认不要了加 `--force`。

### 随时看状态

```bash
bash scripts/session.sh status
```

会显示：

- 主工作区在哪个分支、有没有未提交改动、领先/落后 origin/main 多少；
- 每个任务工位的任务名、分支、端口、干净与否、领先/落后多少；
- 五个共享门禁分别被谁占着、占了多久、是否已过期。

## 四、测试红了怎么办

先分清"是不是我弄坏的"，不要让别人的红挡住自己：

1. 工位隔离后，你跑到的测试只包含自己的改动；
2. 如果还是红，先在**干净的 origin/main** 上跑同一条命令做对照：

   ```bash
   git worktree add --detach /tmp/sk-baseline origin/main
   ln -s "/Users/zhaochen/Documents/SevenKitchen/backend/node_modules" /tmp/sk-baseline/backend/node_modules
   cd /tmp/sk-baseline/backend && npx tsc --noEmit
   git worktree remove --force /tmp/sk-baseline
   ```

3. 干净 main 也红 → 这是**基线问题**，记下来，不拦你；
4. 只有你改的地方红 → 停下来修，别合并；
5. 别人的分支没绿 → 不要合并进你的工位；需要他的代码就等它进 main。

> 原则：**只对自己改的文件负责**。但合并进 main 之前，自己改的部分必须绿。

## 五、异常处理

### 门禁被占着，但那个人已经不在

`session.sh status` / `gate.sh status` 会显示"已过期"。下次有人获取时会自动清理。
如果确认没人用、又不想等：

```bash
rm -rf "$(git rev-parse --git-common-dir)/sevenkitchen/locks/<资源名>.lock"
```

### 主工作区有未提交改动

说明有会话违反了"主工作区只读"。处理顺序：

1. 先确认这些改动属于哪个任务；
2. 把改动带到对应工位（`git diff` 导出后 apply，或 `git stash` 后在工位 `git stash pop`）；
3. 主工作区恢复干净后，再合并/部署。

不要直接在主工作区 `git add -A` 提交——那正是要避免的事故。

### 合并时提示有未跟踪文件冲突

主工作区里有些未跟踪文件（比如 mockup 图）会挡住合并。把它们移到某个工位提交，
或确认无用后删除，再重跑 `session.sh merge`。

### 推送 main 失败

`merge` 会自动重试 3 次。仍失败时：

```bash
bash scripts/session.sh status
```

确认主工作区没有异常本地提交，再重跑 `session.sh merge`。

### 工位不要了

```bash
bash scripts/session.sh cleanup <分支或工位名> --force
```

`--force` 会丢弃未提交内容，确认后再用。

## 六、禁止清单

- ✗ 在主工作区写代码 / 提交 / `git add -A`
- ✗ 一个工位做两个任务，或一个分支塞两个任务
- ✗ 复用已经合并过的旧分支
- ✗ 绕过 `session.sh merge` 直接 `git push origin main`
- ✗ 绕过部署脚本直接上传/部署
- ✗ 把别人的未完成分支合并进自己的工位
- ✗ 会话结束不清理工位/不释放门禁

## 七、兼容与迁移

- 已有的旧 worktree、旧功能分支不受影响，仍可继续用；
- 新规矩从"新任务"开始执行；
- 本机的 git 钩子是兜底（只影响本机，不随仓库分发）：
  - 禁止在 `main` 上直接 `commit`；
  - 推 `main` 前必须有 `merge-main` 门禁。
- 安装/重装钩子：

  ```bash
  bash scripts/session.sh install-hooks
  ```

- 共享状态放在 `.git/sevenkitchen/`（所有 worktree 共用，不进 git）：
  - `locks/` 门禁
  - `tasks/` 任务登记
  - `deploy-state/` 上次部署的提交（用于"没改动就跳过部署"）
  - `merges.log` 合并记录

## 八、设计说明（给维护者）

- **为什么锁不放在工作区里**：每个 worktree 是独立检出，放在工作区里的锁跨工位锁不住。
  统一放到 `git rev-parse --git-common-dir`，所有 worktree 才共享同一把锁。
- **为什么用 mkdir 而不是文件锁**：macOS 自带 bash 没有 `flock`，`mkdir` 是原子的、可移植。
- **过期判定**：同机看 PID 是否还活着；跨机或 PID 复用看 TTL。两者任一满足即视为过期。
- **部署跳过**：状态文件记录上次成功部署的提交；`git diff --quiet <上次>..origin/main -- <模块>/`
  为空就跳过，避免"只改了小程序却重启后端"。
- **钩子只兜底**：钩子能拦住"主工作区直接提交"和"绕过门禁推 main"，
  但拦不住"不建工位就改文件"；所以真正的约束是流程和脚本。
