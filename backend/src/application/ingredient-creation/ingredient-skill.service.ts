import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 原料 Agent 的技能（skill）。
 *
 * 一个技能 = 一份带 frontmatter 的 markdown：`name / description / whenToUse /
 * always`。系统提示里只放**清单**（名字 + 一句话 + 什么时候用），正文由模型在
 * 需要时通过 `loadSkill` 取——这样加技能不用改代码，也不把提示词撑爆。
 *
 * `always: true` 的技能（目前只有 core）直接拼进系统提示，模型不用调工具。
 */
export interface IngredientSkillMeta {
  name: string;
  description: string;
  whenToUse: string | null;
  /** true = 每次运行都拼进系统提示，不需要 loadSkill。 */
  always: boolean;
}

export interface IngredientSkill extends IngredientSkillMeta {
  body: string;
}

/** 单份技能正文的长度上限：防止一份超长文档把上下文吃掉。 */
export const SKILL_BODY_MAX = 12000;

/**
 * 技能目录。
 *
 * 编译后文件在 `dist/src/application/ingredient-creation/`，往上三层是 `dist/`；
 * 开发时在 `src/application/ingredient-creation/`，往上三层是 `backend/`——
 * 两种情况都指向 `skills/ingredient-agent`，只要构建时把 skills 拷进 dist。
 */
function resolveSkillsDir(): string {
  const override = process.env.INGREDIENT_SKILLS_DIR?.trim();
  if (override) {
    return resolve(override);
  }
  return resolve(__dirname, '../../../skills/ingredient-agent');
}

/** 只解析 `---` 之间的 `key: value`；不做完整 YAML（够用且不引依赖）。 */
function parseSkillFile(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) {
    return { meta: {}, body: raw.trim() };
  }

  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index <= 0) {
      continue;
    }
    meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }

  return { meta, body: raw.slice(match[0].length).trim() };
}

function toBool(value: string | undefined): boolean {
  return value === 'true' || value === 'yes' || value === '1';
}

@Injectable()
export class IngredientSkillService {
  private readonly logger = new Logger(IngredientSkillService.name);
  private cache: IngredientSkill[] | null = null;

  /** 全部技能，常驻的排在前面，其余按名字排序（提示词里顺序稳定）。 */
  list(): IngredientSkillMeta[] {
    return this.loadAll().map(
      ({ name, description, whenToUse, always }) => ({
        name,
        description,
        whenToUse,
        always,
      }),
    );
  }

  /** 按名字取技能正文；没有就返回 null。 */
  load(name: string): IngredientSkill | null {
    const normalized = name.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    return (
      this.loadAll().find((skill) => skill.name.toLowerCase() === normalized) ??
      null
    );
  }

  /** 常驻技能（core 之类）：直接拼进系统提示。 */
  always(): IngredientSkill[] {
    return this.loadAll().filter((skill) => skill.always);
  }

  /** 提示词里的技能清单；没有技能时返回空数组。 */
  catalogLines(): string[] {
    const skills = this.list();
    if (skills.length === 0) {
      return [];
    }

    return skills.map((skill) => {
      const when = skill.whenToUse ? `（${skill.whenToUse}）` : '';
      const pinned = skill.always ? '［常驻］' : '';
      return `- ${skill.name}${pinned}：${skill.description}${when}`;
    });
  }

  private loadAll(): IngredientSkill[] {
    if (this.cache) {
      return this.cache;
    }

    const dir = resolveSkillsDir();
    if (!existsSync(dir)) {
      this.logger.error(
        `[ingredient-skill] 技能目录不存在：${dir}；本轮没有可用技能`,
      );
      this.cache = [];
      return this.cache;
    }

    const skills: IngredientSkill[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) {
        continue;
      }
      try {
        const parsed = parseSkillFile(readFileSync(join(dir, file), 'utf8'));
        const name = (parsed.meta.name ?? '').trim() || file.replace(/\.md$/, '');
        const description = (parsed.meta.description ?? '').trim();
        if (!description) {
          this.logger.warn(
            `[ingredient-skill] ${file} 缺 description，已跳过（清单里说不清用途等于没有）`,
          );
          continue;
        }
        skills.push({
          name,
          description,
          whenToUse: (parsed.meta.whenToUse ?? '').trim() || null,
          always: toBool(parsed.meta.always),
          body: Array.from(parsed.body).slice(0, SKILL_BODY_MAX).join(''),
        });
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`[ingredient-skill] 读取 ${file} 失败：${reason}`);
      }
    }

    skills.sort((left, right) => {
      if (left.always !== right.always) {
        return left.always ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    this.cache = skills;
    this.logger.log(
      `[ingredient-skill] 已加载 ${skills.length} 个技能：${skills
        .map((skill) => skill.name)
        .join('、')}`,
    );
    return this.cache;
  }
}
