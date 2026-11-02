import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const barSource = readFileSync(resolve(__dirname, 'LifeStageVersionBar.vue'), 'utf8');
const sheetSource = readFileSync(resolve(__dirname, 'LifeStageVersionSheet.vue'), 'utf8');

describe('LifeStageVersionBar / Sheet', () => {
  it('版本条文案走 life-stage-ui，不写死系统词', () => {
    expect(barSource).toContain("from '@/utils/life-stage-ui'");
    expect(barSource).not.toContain('不匹配');
    expect(barSource).not.toContain('没有完全匹配');
    expect(barSource).toContain('versionCount');
    expect(barSource).toContain('describeMatchedStage');
  });

  it('版本条按状态给四种色调，且 legacy 不渲染', () => {
    expect(barSource).toContain("state !== 'legacy'");
    expect(barSource).toContain('tone-');
  });

  it('版本面板用统一说明表，且选中后才生效', () => {
    expect(sheetSource).toContain('buildVersionOptionSubtitle');
    expect(sheetSource).toContain('用这个版本');
    expect(sheetSource).not.toContain('不匹配');
  });
});
