import { interpretSupplementMessage } from '../../../src/domain/ingredient/supplement-chat';

/**
 * 补剂对话的意图解析。
 *
 * 钉四件事：说得出的要办对；说一半的（比如"第一个"但还没候选）要拦住；
 * 听不出的要认怂；任何时候都不许编一个不存在的候选。
 */
const empty = { name: '', servingUnitsPerDose: null, candidateNames: [] };
const withCandidates = {
  name: '',
  servingUnitsPerDose: null,
  candidateNames: ['NOW Foods 锌', 'California Gold 锌', 'Solgar 锌']
};

describe('要补什么', () => {
  it('「给狗狗加个锌」→ 去搜「锌」', () => {
    const result = interpretSupplementMessage({ message: '给狗狗加个锌', draft: empty });
    expect(result.actions).toEqual([{ type: 'SEARCH_CANDIDATES', keyword: '锌' }]);
    expect(result.reply).toContain('锌');
  });

  it('「帮我补点鱼油」→ 去搜「鱼油」', () => {
    const result = interpretSupplementMessage({ message: '帮我补点鱼油', draft: empty });
    expect(result.actions[0]).toMatchObject({ type: 'SEARCH_CANDIDATES', keyword: '鱼油' });
  });
});

describe('选第几个', () => {
  it('「第二个」→ 选第二个候选', () => {
    const result = interpretSupplementMessage({ message: '第二个', draft: withCandidates });
    expect(result.actions).toEqual([{ type: 'PICK_CANDIDATE', index: 1 }]);
    expect(result.reply).toContain('California Gold');
  });

  it('还没有候选时说「第一个」→ 拦住，不去读', () => {
    const result = interpretSupplementMessage({ message: '第一个', draft: empty });
    expect(result.actions).toEqual([]);
    expect(result.reply).toContain('还没有候选');
  });

  it('候选只有 2 个时说「第三个」→ 拦住，不编一个', () => {
    const result = interpretSupplementMessage({
      message: '第三个',
      draft: { ...empty, candidateNames: ['A', 'B'] }
    });
    expect(result.actions).toEqual([]);
    expect(result.reply).toContain('不存在');
  });
});

describe('改字段', () => {
  it('「每份 2 粒」→ 直接把每份粒数改成 2', () => {
    const result = interpretSupplementMessage({ message: '每份 2 粒', draft: empty });
    expect(result.actions).toEqual([
      { type: 'SET_FIELD', field: 'servingUnitsPerDose', value: 2 }
    ]);
  });

  it('「每份几粒改成 3」→ 同样认', () => {
    const result = interpretSupplementMessage({ message: '每份几粒改成 3', draft: empty });
    expect(result.actions[0]).toMatchObject({ type: 'SET_FIELD', value: 3 });
  });

  it('「每份 99 粒」这种离谱值不照着改', () => {
    const result = interpretSupplementMessage({ message: '每份 99 粒', draft: empty });
    expect(result.actions).toEqual([]);
  });
});

describe('贴链接', () => {
  it('消息里有商品链接 → 去读那瓶', () => {
    const result = interpretSupplementMessage({
      message: 'https://www.iherb.com/pr/now-foods-zinc/791',
      draft: empty
    });
    expect(result.actions).toEqual([
      { type: 'READ_LINK', url: 'https://www.iherb.com/pr/now-foods-zinc/791' }
    ]);
  });
});

describe('问理由与听不懂', () => {
  it('问为什么 → 讲三层顺序，且不撒谎说已经定稿', () => {
    const result = interpretSupplementMessage({ message: '为什么这么选', draft: empty });
    expect(result.actions).toEqual([]);
    expect(result.reply).toContain('形态');
    expect(result.reply).toContain('没定稿');
  });

  it('空消息 → 反问要补什么', () => {
    expect(interpretSupplementMessage({ message: '   ', draft: empty }).reply).toContain('补什么');
  });
});
