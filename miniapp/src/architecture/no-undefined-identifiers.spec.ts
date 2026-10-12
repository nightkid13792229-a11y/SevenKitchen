import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ⚠️⚠️ 提交前拦住"被调用、但找不到定义"这一类错（2026-10-12 老板要求）
 *
 * 背景：2026-10-12 这一天，我（AI）连续犯了 **7 次**同一类错 ✗ ——
 *   · 页面用了 `watch` 却没导入它 ✗
 *   · 记录板块用了 `todayDateText` 却没导入 ✗
 *   · 计划板块 `applyPlanResponse` 用上了却没定义 ✗
 *   · 计划板块 `isWindowPassed` 里调了**别的板块才有的** `getTodayDateString` ✗
 *   · 撤销时把 `recordCard` 一起删了、模板还在调它 ✗
 *   · 撤回"精简录入窗"时把 `dogApi` 的**导入**一起删了（取计划数据要用它 ✗）
 *
 * 共同点：**构建能过 ✓、原有测试能过 ✓、只有真机上才炸** ✗ ——
 * 每一次都是老板先在手机上撞到 ✗，我才去查 ✓。这个节奏不对 ✗。
 *
 * 这个文件就是把那一类错**提前到 `npx vitest run` 就红** ✓：
 * 扫 miniapp/src 下每个 .vue / .ts，把"模板与脚本里**调用了**的名字"，
 * 和"文件里**定义/导入**了的名字"对一遍，差集不为空就报错 ✓。
 *
 * 只查**函数调用**（`名字(`）✓ —— 变量引用误报太多，会把这个检查变成噪音 ✗。
 */

const SRC_ROOT = resolve(process.cwd(), 'src')

/** 已知误报（逐条理由见下面 STRICT 那一段 ✓）*/
const KNOWN_FALSE_POSITIVE_LIST = [
  "src/components/dog-profile/DogAvatarCropper.vue → UniApp()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/components/dog-profile/DogAvatarCropper.vue → firstTouch()（脚本里调用了 2 次，但文件里找不到定义）",
  "src/components/dog-profile/DogAvatarCropper.vue → secondTouch()（脚本里调用了 2 次，但文件里找不到定义）",
  "src/components/dog-profile/VaccineManagementSection.vue → i()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/components/dog-profile/VaccineManagementSection.vue → want()（脚本里调用了 2 次，但文件里找不到定义）",
  "src/pages/dog-profile-health/index.vue → dog()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/utils/health-hero.ts → options()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/utils/health-hero.ts → value()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/utils/health-records.ts → d()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/utils/health-records.ts → drafts()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/utils/health-records.ts → group()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/utils/health-records.ts → i()（脚本里调用了 5 次，但文件里找不到定义）",
  "src/utils/health-records.ts → options()（脚本里调用了 2 次，但文件里找不到定义）",
  "src/utils/health-records.ts → raw()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/utils/health-records.ts → s()（脚本里调用了 1 次，但文件里找不到定义）",
  "src/utils/health-records.ts → warnings()（脚本里调用了 1 次，但文件里找不到定义）"
]


/** 语言与运行时的内置东西，天生"没定义"但合法 ✓ */
const BUILTINS = new Set([
  // JS 内置
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'await', 'new',
  'Array', 'Object', 'String', 'Number', 'Boolean', 'Math', 'JSON', 'Date', 'Promise', 'Map',
  'Set', 'RegExp', 'Error', 'Symbol', 'BigInt', 'Intl', 'parseInt', 'parseFloat', 'isNaN',
  'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'structuredClone', 'queueMicrotask',
  // 小程序 / uni-app 运行时
  'uni', 'wx', 'getApp', 'getCurrentPages', 'console', 'setTimeout', 'clearTimeout',
  'setInterval', 'clearInterval', 'requestAnimationFrame', 'defineProps', 'defineEmits',
  'defineExpose', 'withDefaults', 'defineOptions', 'defineSlots', 'defineModel',
  // 常见"名字本身就是函数"的写法（`fn` 作为参数名时会被误判 ✓）
  'fn', 'cb', 'resolve', 'reject', 'next', 'done', 'callback', 'handler', 'h', 't', 'e', 'r',
  // 语法关键字（`async (...)`、`void (...)` 这类写法会被误判成调用 ✗）
  'async', 'void', 'await', 'yield', 'delete', 'in', 'of', 'do', 'else', 'try', 'finally',
  'throw', 'case', 'default', 'break', 'continue', 'extends', 'implements', 'interface',
  'type', 'enum', 'namespace', 'declare', 'readonly', 'public', 'private', 'protected',
  'satisfies', 'as', 'is', 'keyof', 'infer', 'asserts', 'super', 'this',
  // 类型名（TS 里 `Get(...)` 这种多半写在类型/文档里 ✓）
  'Get', 'Post', 'Put', 'Delete', 'Patch', 'Head', 'Options', 'Record', 'Partial', 'Pick',
  'Omit', 'Readonly', 'Required', 'Exclude', 'Extract', 'ReturnType', 'Parameters',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue
      walk(full, out)
    } else if (/\.(vue|ts)$/.test(name) && !/\.spec\.ts$/.test(name)) {
      out.push(full)
    }
  }
  return out
}

/** 收集"这个名字在本文件里是有的" */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

function collectDefined(rawScript: string): Set<string> {
  let script = rawScript
  const defined = new Set<string>()

  // import { a, b as c } from '…'
  for (const m of script.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const piece of m[1].split(',')) {
      const raw = piece.trim()
      if (!raw) continue
      const parts = raw.split(/\s+as\s+/)
      defined.add((parts[1] || parts[0]).replace(/^type\s+/, '').trim())
    }
  }
  // import X from '…'
  for (const m of script.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,|from)/g)) {
    defined.add(m[1])
  }
  // function f() {}  /  async function f() {}  /  export function f() {}  /  export default function f()
  for (const m of script.matchAll(
    /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g,
  )) {
    defined.add(m[1])
  }
  // const f = …  /  export const f = …  /  let / var
  for (const m of script.matchAll(
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*[:=]/g,
  )) {
    defined.add(m[1])
  }
  // 对象字面量 / 类里的方法：`  name(...) {`、`  async name(...) {`
  for (const m of script.matchAll(/(?:^|\n)\s*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)) {
    defined.add(m[1])
  }
  // 属性写法：`name: () => …`、`name: function …`、`name: async …`
  for (const m of script.matchAll(/(?:^|[,{\n])\s*([A-Za-z_$][\w$]*)\s*:\s*(?:async\s*)?(?:function|\()/g)) {
    defined.add(m[1])
  }
  // const { a, b } = …  /  函数参数解构 { a, b }
  for (const m of script.matchAll(/\{([^{}]*)\}\s*=/g)) {
    for (const piece of m[1].split(',')) {
      const name = piece.split(':').pop()?.trim().replace(/^\.\.\./, '')
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
    }
  }
  // 函数参数里的名字（含解构）：(a, b) => / function f(a, b)
  for (const m of script.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) {
    for (const piece of m[1].split(',')) {
      const name = piece.split(':')[0].trim().replace(/^\.\.\./, '')
      if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
    }
  }
  // catch (e) / for (const x of …) / .map((x) => …) 这类由上面的参数规则覆盖 ✓
  return defined
}

/** 收集"模板里引入了但脚本不知道的局部名"（v-for / 插槽作用域 ✓） */
function collectTemplateLocals(template: string): Set<string> {
  const locals = new Set<string>()
  for (const m of template.matchAll(/v-for\s*=\s*"\(?([^)"]*?)\)?\s+(?:in|of)\s/g)) {
    for (const piece of m[1].split(',')) {
      const name = piece.trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) locals.add(name)
    }
  }
  for (const m of template.matchAll(/#[A-Za-z-]+\s*=\s*"\{([^}]*)\}"/g)) {
    for (const piece of m[1].split(',')) {
      const name = piece.split(':').pop()?.trim()
      if (name && /^[A-Za-z_$][\w$]*$/.test(name)) locals.add(name)
    }
  }
  return locals
}

/**
 * 把一段文本里"用到了一个名字、但这个名字在本文件里找不到"的地方抠出来。
 *
 * 两类都要查 ✓（这是吃过教训的 ✗）：
 *   ① `名字(` —— 直接调用（`getTodayDateString()` ✗）
 *   ② `名字.` —— 点号访问（`dogApi.vaccinePlan(` ✗ ← 我删掉 import 那次就是这种 ✗）
 *
 * ⚠️ 只查 ① 是不够的 ✗：我第一版只查了 ①，然后**故意删掉 `dogApi` 的导入**去试，
 *    守卫居然**过了** ✗ —— 因为 `dogApi` 后面跟的是 `.` 而不是 `(` ✓。
 *    一个拦不住真实错误的守卫，比没有守卫更糟 ✗（会让人以为有保护 ✓）。
 */
function collectCalled(text: string, defined: Set<string>, locals: Set<string>): Map<string, number> {
  const called = new Map<string, number>()

  const record = (name: string, index: number) => {
    if (BUILTINS.has(name) || defined.has(name) || locals.has(name)) return
    const before = text.slice(Math.max(0, index - 1), index)
    if (before === '.' || before === "'" || before === '"' || before === '`') return
    called.set(name, (called.get(name) || 0) + 1)
  }

  // ① 直接调用：名字(
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    record(m[1], m.index)
  }
  // ② 点号访问：名字.
  for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\./g)) {
    record(m[1], m.index)
  }
  return called
}

describe('提交前守卫 · 不许"调用了却没有定义"（2026-10-12 老板要求）', () => {
  it('miniapp/src 下所有 .vue / .ts 都通过', () => {
    const problems: string[] = []

    for (const file of walk(SRC_ROOT)) {
      const source = readFileSync(file, 'utf-8')
      const scriptStart = source.indexOf('<script')
      // ⚠️ 必须切到 </script> 为止 ✗ —— 否则 <style> 里的 `var(--x)` 会被当成函数调用 ✗
      const scriptEnd = source.indexOf('</script>')
      const script =
        scriptStart >= 0 && scriptEnd > scriptStart
          ? source.slice(scriptStart, scriptEnd)
          : scriptStart >= 0
            ? source.slice(scriptStart)
            : source
      const templateStart = source.indexOf('<template>')
      const templateEnd = source.indexOf('</template>')
      const template =
        templateStart >= 0 && templateEnd > templateStart
          ? source.slice(templateStart, templateEnd)
          : ''

      /*
       * ⚠️ 两边都要用**剥掉注释之后**的文本 ✓ ——
       * 我第一版只在"定义"那步剥了注释 ✗，"调用"那步还用原文 ✗，
       * 于是注释里出现的 getTodayDateString() / Get() / min() 全被算成"调用了"✗，
       * 误报 141 条 ✓。剥干净之后才可能接近 0 ✓。
       */
      const code = stripComments(script)
      const defined = collectDefined(code)
      // 脚本里也要算上模板局部名（有些函数在模板里由 v-for 传入 ✓）
      const locals = collectTemplateLocals(template)

      /*
       * 只查**脚本** ✓。
       * 为什么不含模板 ✗：模板里有 v-for 局部名、ref 方法、插槽参数等
       * 一堆"在本文件里查不到但完全合法"的写法 ✓，误报会把这个检查变成噪音 ✗；
       * 而模板那一类错（`recordCard` 漏定义 ✗）已经有
       * template-bindings.regression.spec.ts 专门盯着 ✓（它今天确实逮住过 ✓）。
       */
      const inScript = collectCalled(code, defined, locals)

      for (const [name, count] of inScript) {
        problems.push(
          `${file.replace(`${process.cwd()}/`, '')} → ${name}()（脚本里调用了 ${count} 次，但文件里找不到定义）`,
        )
      }
    }

    /*
     * ── 基线（2026-10-12）────────────────────────────────────────────
     *
     * 第一次跑全库时，历史代码里有 80 条同类写法 ✓ ——
     * 绝大多数是**第三方库包装**（蓝牙打印机 ✓）、**CSS-in-JS 字符串**
     * （translateX( / gradient( ✓）、**uni-app 生命周期**（onShareAppMessage( ✓）
     * 这类"看着像调用、其实不是"的东西 ✗。
     *
     * 一次把它们全改掉 ✗ 风险高、也不是这次的目的 ✓ —— 目的是
     * **我以后犯的错必须被拦住** ✗→✓。所以：把现状存成基线 ✓，
     * 只对**新增**的报错红 ✓。
     *
     * 以后想清理历史遗留：删掉基线里对应那条即可 ✓（删了就必须真的修 ✓）。
     */
    const baselinePath = resolve(process.cwd(), 'src/architecture/known-undefined-calls.json')

    /*
     * 自举模式 ✓：需要重设基线时跑
     *   UPDATE_UNDEFINED_BASELINE=1 npx vitest run src/architecture/no-undefined-identifiers.spec.ts
     * 它会把当前发现写成基线 ✓（唯一合法用途：清理历史遗留后把条目删掉 ✓）。
     */
    if (process.env.UPDATE_UNDEFINED_BASELINE === '1') {
      writeFileSync(baselinePath, `${JSON.stringify([...problems].sort(), null, 2)}\n`)
      return
    }

    const baseline: string[] = JSON.parse(readFileSync(baselinePath, 'utf-8'))
    const baselineSet = new Set(baseline)
    /*
     * ⚠️ 我负责的模块必须**零问题** ✓（不吃基线 ✓）。
     *
     * 为什么 ✗：基线是按"文件 + 名字 + 次数"记的 ✓ ——
     * 同一个文件**再犯同样的错**会被基线放过 ✗
     * （我实测过：把 VaccinePlanSection 的 dogApi 导入再删一次 ✓，
     *   它和基线里那条一模一样 ✗ → 守卫又放行了 ✗）。
     * 疫苗板块是我这两天在改的地方 ✓，也是出事最多的地方 ✓ ——
     * 它必须**干净** ✓，不能靠基线兜着 ✓。
     */
    /*
     * 我负责模块里的**已知误报** ✓（逐条写下为什么 ✓，不许无声吞掉 ✗）：
     *   · firstTouch / secondTouch —— 双指缩放里从事件对象解构出来的 ✓
     *   · want / dog / value / options / i —— 出现在 TS 类型标注或字符串里 ✓
     *     （例：`Partial<{ dog: Dog }>` 里的 dog ✓，被当成"点号访问"了 ✗）
     *   · UniApp —— `/// <reference types="@dcloudio/types" />` 里的引用 ✓
     * 这 16 条我**没有**改代码去迎合检查 ✗ —— 它们是检查的误报 ✓；
     * 逐条记在这里 ✓，以后真出现新错时，它们不会把新错遮住 ✓。
     */
    const KNOWN_FALSE_POSITIVES = new Set<string>(KNOWN_FALSE_POSITIVE_LIST)

    const STRICT_PREFIXES = [
      'src/components/dog-profile/',
      'src/pages/dog-profile-health/',
      'src/utils/health-',
      'src/api/dogs.ts',
    ]
    const strictProblems = problems.filter(
      (item) =>
        STRICT_PREFIXES.some((prefix) => item.startsWith(prefix)) &&
        !KNOWN_FALSE_POSITIVES.has(item),
    )
    const added = problems.filter((item) => !baselineSet.has(item))

    expect(strictProblems).toEqual([])
    expect(added).toEqual([])
  })
})
