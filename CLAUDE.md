# SevenKitchen 项目规则

## 角色识别

- `backend/` → Backend开发者
- `miniapp/` → MiniApp开发者
- `admin-web/` → AdminWeb开发者

**只修改自己负责的模块，不要跨模块修改代码。**

## 核心规则

1. **修改前先读文档**：必读 `docs/DATABASE_NAMING_CONVENTIONS.md`
2. **禁止直接操作数据库**：必须通过Prisma migration
3. **禁止"想象"字段名**：先查文档确认
4. **测试通过后再提交**

## MiniApp 协作硬规则

1. **凡是修改 `miniapp/` 下的代码，在结束前至少执行一种可验证流程**：
   - 联调预览：`cd miniapp && npm run preview`
   - 发布构建：`cd miniapp && npm run build:mp-weixin`
2. **执行成功后，必须明确告知用户微信开发者工具应打开的目录**：
   - `npm run preview` → `miniapp/dist/dev/mp-weixin`
   - `npm run build:mp-weixin` → `miniapp/dist/build/mp-weixin`
3. **默认不要把小程序构建产物同步到统一预览目录** `/Users/zhaochen/Documents/SevenKitchen-miniapp-preview`；只有用户明确要求“同步到预览目录”时才执行同步
4. **默认优先告知用户微信开发者工具应打开实际构建目录**：预览构建打开 `miniapp/dist/dev/mp-weixin`，发布构建打开 `miniapp/dist/build/mp-weixin`
5. **如果预览、构建或用户明确要求的预览目录同步失败，必须明确告知失败原因**，不能让用户自己猜测是不是没编译、目录不对、同步没完成或输出没更新
6. **凡是小程序本地开发默认 API 地址，都以** `http://127.0.0.1:3011/api/v1` **为准**，除非用户明确要求切换

## 生产部署授权（老板 2026-10-12 定）

**老板原话**："本会话后续所有的修改都可以直接部署到生产端，小程序不用，
因为小程序需要审核，所以小程序只需要进行代码上传即可。"

1. **后端接口 与 admin-web：改完可以直接部署到生产**，不必每次单独征求同意
   （但仍要**先自检**：后端 `npm test`、构建通过；admin-web 构建通过）
2. **小程序（miniapp/）：绝对不要部署/发布到正式版** —— 走审核，会很麻烦。
   只做**代码上传到体验版**，让老板在微信里看。
3. **部署顺序：先把改动合并到 `main`、推到 `origin/main`，再部署**。
   原因：部署脚本是"从 `origin/main` 构建"的，分支上的提交不会被带上：
   - 后端：`bash backend/scripts/remote_deploy_v2.sh`（本地按 `origin/main` 打包 dist 再上传；
     生产机也会 `git reset --hard` 到 `origin/main`）
   - admin-web：`bash deploy-admin-web.sh`
4. **每次部署/上传后必须向老板报告结果**（部署了哪个提交、或体验版版本号）
5. ⚠️ **部署前先看后端到底改没改**（2026-10-12 加的：这一轮白跑了一次部署）：
   只有 `miniapp/` 变动、`backend/` 一个字没改时，**不要部署后端** ——
   部署脚本会重置生产源码并重启服务，纯粹多余。先判一下：
   ```bash
   git diff --stat <上次部署的提交>..HEAD -- backend/   # 空 = 不用部署
   ```
   同理 admin-web：`git diff --stat <上次>..HEAD -- admin-web/`。
   小程序不一样 —— **每次都要上传**（老板要在手机上看到最新那份）。


### 小程序上传体验版（固定动作）

```bash
cd miniapp && npm run build:mp-weixin
/Applications/wechatwebdevtools.app/Contents/MacOS/cli upload \
  --project "$(pwd)" --version "<版本号>" --desc "<这次改了什么>" --lang zh
```

- 上传前**先确认没有自动化会话开着**（开着会上传静默失败）
- 版本号必须比上一次大，用当天日期格式（如 `2026.10.12.4`）
- 看到 `✔ upload` 才算成功
- AppID `wx92924e25093f8f18`；项目根 `miniapp/`，构建产物在 `dist/build/mp-weixin/`

## 本地后端协作硬规则

1. **启动小程序联调后端前先检查本地后端是否已可用**：`cd backend && npm run start:check:miniapp`
2. **需要启动小程序联调用本地后端时，统一使用** `cd backend && npm run start:dev:miniapp`
3. **如果本地后端已经健康运行，必须优先复用，而不是再启动第二个**
4. **如果当前线程需要切换到另一份 worktree 的后端代码，必须先停止旧进程，再在目标 worktree 重新执行** `cd backend && npm run start:dev`
5. ⚠️ **`npm run build` 会把 `dist/` 整个删掉重建**（`nest-cli.json` 里 `deleteOutDir: true`），
   而 `start:dev` / `start:dev:miniapp` 是**从 `dist/src/main` 起的** ——
   于是"跑一次 build"会把正在跑的本机联调后端**弄死**（报
   `Cannot find module '.../backend/dist/src/main'`，且 watch 也救不回来）。
   所以：**联调期间不要跑 `npm run build`**；要自检只跑 `npx tsc --noEmit`（不产出、不删东西）。
   万一手滑弄死了：**按启动规则重启** `cd backend && npm run start:dev:miniapp` 即可恢复。

## 开发者工具自动化（2026-10-12 实测打通 ✓；用之前先读这一节）

开发者工具**自带**一套自动化接口 ✓，能让 AI 自己去模拟器里点、读页面、截图 ✓ ——
路径：`/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide`
（工具清单与用法见 `wechatide --help`；随工具附带的 SKILL.md 在
`.../Resources/app.asar.unpacked/wechatide-skill/skills/automator/SKILL.md` ✓）。

```bash
W=/Applications/wechatwebdevtools.app/Contents/MacOS/wechatide
"$W" -c codex check_wechatide_status --skill-version 0.3.9   # 先看登录态
"$W" -c codex automation_runtime_info --project <项目绝对路径> --action currentPage
"$W" -c codex automation_evaluate --project <项目绝对路径> --fn-source 'function(){ return wx.getStorageInfoSync().keys }'
```

### ⚠️ 三条必须知道的（都是这次踩出来的 ✗）

1. **第一次调用会弹一个授权窗**（"codex 申请使用 MCP，是否允许？"）——
   需要**人点一次「允许」** ✓，之后本节工具才可用 ✓。
   授权状态：`polling_task_result --task-id <auth_...>` ✓。
2. **绝对不要用 `pkill -f wechatide` 之类的宽匹配去"清理"** ✗✗ ——
   开发者工具自己的渲染进程命令行里就带 `wechatide` 字样 ✓，
   一刀下去**把它的界面打死** ✓（窗口变成一片白 ✓）。
   这次我这么干过一次 ✓，只好整个退出重开才恢复 ✓。
   要停挂住的调用：**只 kill 自己起的那个 PID** ✓（`job_kill` ✓），别按名字杀 ✗。
3. **模拟器连的是本机后端** ✓（`platform = devtools` ✓，本机地址 `127.0.0.1:3011` ✓），
   而**本机库没有那 50 只测试狗** ✗（只有 11 只普通狗、且没有疫苗产品表 ✗）。
   所以"在模拟器里验疫苗记录"这条路的**前提**是：
   · 要么先把小程序里"手动指定服务器地址"（storage 键 `api_base_url`）指到**线上** ✓
   · 要么在本机补测试档案 ✓
   · 而且**模拟器里必须先登录** ✗ —— 自动化跑不了真实微信登录 ✓，
     这一步需要人点一次「立即登录」✓（登录态不在 storage 里，是 `wx.login` 换的 ✓）。

### ⚠️ 自查一律**复用现有项目**，不要新建临时工程（老板 2026-10-14 提出）

老板："为什么每一次的修改，你都会打开一个微信开发者工具的预览窗口呢？"

原因：为了连本地后端自查，我每次新建一个临时工程（`/tmp/mp-xxx`）→
开发者工具就为它**多开一个项目窗口** ✗，每次都弹出来打扰老板 ✗。

**正确做法（全程只用一个窗口）**：

```bash
cd miniapp
# ① 构建"连本地后端"的那份（输出在 dist/dev/mp-weixin）
npx uni -p mp-weixin
# ② 把它放到**老板项目指向的位置**（老板的项目 miniprogramRoot = dist/build/mp-weixin/）
rm -rf dist/build/mp-weixin && cp -R dist/dev/mp-weixin dist/build/mp-weixin
# ③ 直接用老板已经打开的那个项目自查（不改 project.config.json、不新开窗口）
#    需要时先打开它：cli open --project "$(pwd)"
# ④ 自查完，重新生成**生产**构建覆盖掉（否则会把 dev 版传上去 ✗）
npm run build:mp-weixin
# ⑤ 再上传体验版
cli upload --project "$(pwd)" --version "<版本号>" --desc "<改了什么>" --lang zh
```

⚠️ 第 ④ 步**不能省**：③ 之后 `dist/build/mp-weixin` 里是 dev 版（连本地后端），
直接上传的话，体验版会指向 `127.0.0.1` ✗（老板手机上必然打不开 ✗）。

⚠️ 用完把 `/tmp/mp-*` 之类的临时工程清掉 ✓（别留在磁盘上、也别留在开发者工具的最近项目里）。

## 必读文档

| 优先级 | 文档 | 用途 |
|--------|------|------|
| 最高 | docs/DATABASE_NAMING_CONVENTIONS.md | 字段命名规范 |
| 高 | docs/07_Core_Architecture.md | 核心架构 |
| 高 | docs/05_API_Specs.md | API接口定义 |

## 沟通规范

用户是非技术人员，回答时：
- 用业务语言描述，不用技术术语
- 用步骤列表说明流程
- 不展示代码（除非用户要求）
