import { describe, expect, it } from 'vitest';
import { firstBlockedImport } from './order-import-block';

interface Row {
  id: string;
  blocked: boolean;
}

const row = (id: string, blocked: boolean): Row => ({ id, blocked });
const isBlocked = (item: Row) => item.blocked;

describe('firstBlockedImport', () => {
  it('当前这一单有问题 → 报当前这一单', () => {
    const active = row('hema', true);
    const all = [row('sam', true), active];
    expect(firstBlockedImport(active, all, isBlocked)?.id).toBe('hema');
  });

  it('当前这一单没问题、别的单有问题 → 报别的单（否则按钮文案会骗人）', () => {
    const active = row('hema', false);
    const all = [row('sam', true), active];
    expect(firstBlockedImport(active, all, isBlocked)?.id).toBe('sam');
  });

  it('全都没问题 → null', () => {
    const active = row('hema', false);
    expect(firstBlockedImport(active, [row('sam', false), active], isBlocked)).toBeNull();
  });

  it('没有当前单时按原顺序找', () => {
    expect(firstBlockedImport(null, [row('sam', true)], isBlocked)?.id).toBe('sam');
  });

  it('当前单不在列表里也不会漏掉它', () => {
    const active = row('draft-elsewhere', true);
    expect(firstBlockedImport(active, [row('sam', false)], isBlocked)?.id).toBe(
      'draft-elsewhere',
    );
  });
});
