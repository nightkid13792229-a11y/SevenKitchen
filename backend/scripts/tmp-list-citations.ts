import { KnowledgeBaseService } from '../src/application/recipe-designer/knowledge-base.service';
import { KNOWLEDGE_SOURCES } from '../src/domain/recipe-designer/knowledge-base/source-registry';
import { HEALTH_ONLY_DOMAINS } from '../src/domain/recipe-designer/knowledge-base/types';
function cjkCore(t: string) { return t.replace(/[^\u4e00-\u9fa5]/g, ''); }
function sharesCore(a: string, b: string, min = 5) {
  const ca = cjkCore(a), cb = cjkCore(b);
  if (!ca || !cb) return false;
  if (ca.includes(cb) || cb.includes(ca)) return true;
  for (let i = 0; i + min <= ca.length; i += 1) if (cb.includes(ca.slice(i, i + min))) return true;
  return false;
}
const health = new Set<string>(HEALTH_ONLY_DOMAINS);
const svc = new KnowledgeBaseService();
for (const e of svc.getAll()) {
  if (!health.has(e.domain)) continue;
  const bad = e.citations.filter((c) => {
    const own = (e.sources ?? []).flatMap((s: any) => [s.locator ?? '', s.note ?? '']);
    return !(KNOWLEDGE_SOURCES.some((s: any) => sharesCore(c.source, s.name)) || own.some((l: any) => sharesCore(c.source, l)));
  });
  if (!bad.length) continue;
  console.log('=====', e.id, '(' + e.domain + ')');
  for (const b of bad) console.log('   BAD cite:', JSON.stringify(b));
  for (const s of e.sources ?? []) console.log('   src:', s.sourceId, '| locator:', s.locator, '| note:', s.note);
}
