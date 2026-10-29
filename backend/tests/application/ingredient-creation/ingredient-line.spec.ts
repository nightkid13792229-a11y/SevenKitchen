import {
  LINE_NOT_OPEN_MESSAGE,
  decideRequestedLine,
} from '../../../src/application/ingredient-creation/ingredient-line';

/**
 * 起草请求该走哪条线。
 *
 * 这条判定必须在控制器发出响应头之前完成：没有草稿时，请求不成立就应该
 * 是 400；有草稿时以草稿为准，请求里带什么都忽略。
 */
describe('decideRequestedLine', () => {
  it('有草稿时以草稿为准，忽略线路', () => {
    expect(
      decideRequestedLine({ draftId: 'draft-1', line: 'SUPPLEMENT' }),
    ).toEqual({ action: 'USE_DRAFT' });
  });

  it('选了补剂但没有草稿 → 拒绝并给中文原因', () => {
    expect(decideRequestedLine({ line: 'SUPPLEMENT' })).toEqual({
      action: 'REJECT',
      message: LINE_NOT_OPEN_MESSAGE,
    });
  });

  it('显式选了食材 → 建食材草稿', () => {
    expect(decideRequestedLine({ line: 'FOOD' })).toEqual({
      action: 'CREATE',
      line: 'FOOD',
      compatDefault: false,
    });
  });

  it('过渡期缺线路 → 按食材建，并标记兼容默认', () => {
    expect(decideRequestedLine({})).toEqual({
      action: 'CREATE',
      line: 'FOOD',
      compatDefault: true,
    });
  });
});
