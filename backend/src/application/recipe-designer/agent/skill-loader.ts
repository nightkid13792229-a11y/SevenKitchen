import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import type { AgentPhase } from './phase-policy';

const PHASE_SKILLS: Record<AgentPhase, string[]> = {
  PLAN: ['recipe-plan'],
  SELECT: ['recipe-selection'],
  DESIGN: ['recipe-design', 'recipe-assessment'],
};

const cache = new Map<string, string>();

/** 读阶段 Skill；仓库文件不存在时返回空，不阻断运行。 */
export function loadSkillsForPhase(phase: AgentPhase): string {
  const names = PHASE_SKILLS[phase] ?? [];
  return names
    .map((name) => loadSkill(name))
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function loadSkill(name: string): string {
  const cached = cache.get(name);
  if (cached !== undefined) return cached;
  const candidates = [
    resolve(__dirname, '../../../../skills', name, 'SKILL.md'),
    join(process.cwd(), 'skills', name, 'SKILL.md'),
    join(process.cwd(), 'dist', 'skills', name, 'SKILL.md'),
  ];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    cache.set(name, text);
    return text;
  }
  cache.set(name, '');
  return '';
}
