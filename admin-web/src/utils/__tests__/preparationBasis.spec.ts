import { describe, expect, it } from 'vitest';
import {
  isPreparationBasisConsistent,
  preparationBasisMismatchHint,
  preparationStateLabel,
  splitPreparationSegments,
} from '../preparationBasis';

describe('preparationBasis（前端一致性提示）', () => {
  it('does not flag free-text preprocessing without a weighing basis', () => {
    expect(isPreparationBasisConsistent('去皮切块', 'COOKED')).toBe(true);
    expect(preparationBasisMismatchHint('去皮切块', 'COOKED')).toBeNull();
  });

  it('accepts cooked profiles with 熟 / 熟重 or a cooked-weighing phrase', () => {
    expect(isPreparationBasisConsistent('熟重、打碎', 'COOKED')).toBe(true);
    expect(isPreparationBasisConsistent('牛里脊/熟/去油', 'COOKED')).toBe(true);
    expect(isPreparationBasisConsistent('煮熟后称重、打碎', 'COOKED')).toBe(true);
    expect(isPreparationBasisConsistent('沥干后称重、充分搅拌', 'COOKED')).toBe(true);
  });

  it('accepts raw profiles with 生 / 生重', () => {
    expect(isPreparationBasisConsistent('牛里脊/生/去油', 'RAW')).toBe(true);
    expect(isPreparationBasisConsistent('去皮、生重、打碎', 'RAW')).toBe(true);
  });

  it('flags the new 生/熟/干 format when it conflicts', () => {
    expect(isPreparationBasisConsistent('牛里脊/熟/去油', 'RAW')).toBe(false);
    expect(isPreparationBasisConsistent('牛里脊/生/去油', 'COOKED')).toBe(false);
    expect(isPreparationBasisConsistent('燕麦/干/磨粉', 'DRIED')).toBe(true);
    expect(isPreparationBasisConsistent('燕麦/生/磨粉', 'DRIED')).toBe(false);
  });

  it('flags cooked profiles that say 生重', () => {
    expect(isPreparationBasisConsistent('去皮、生重、打碎', 'COOKED')).toBe(false);
  });

  it('flags raw profiles that say 熟 / 熟重 or 煮熟后称重', () => {
    expect(isPreparationBasisConsistent('熟重、打碎', 'RAW')).toBe(false);
    expect(isPreparationBasisConsistent('牛里脊/熟/去油', 'RAW')).toBe(false);
    expect(isPreparationBasisConsistent('煮熟后称重、打碎', 'RAW')).toBe(false);
  });

  it('flags basis words on oil / powder profiles', () => {
    expect(isPreparationBasisConsistent('生重、充分搅拌', 'OIL')).toBe(false);
    expect(isPreparationBasisConsistent('充分搅拌', 'OIL')).toBe(true);
  });

  it('treats missing text or unknown state as consistent', () => {
    expect(isPreparationBasisConsistent('', 'COOKED')).toBe(true);
    expect(isPreparationBasisConsistent(undefined, 'COOKED')).toBe(true);
    expect(isPreparationBasisConsistent('生重、打碎', 'MYSTERY')).toBe(true);
  });

  it('builds a readable hint with the state label', () => {
    expect(
      preparationBasisMismatchHint('去皮、生重、打碎', 'COOKED'),
    ).toContain('营养状态是「熟」');
    expect(preparationBasisMismatchHint('去皮、生重、打碎', 'COOKED')).toContain(
      '建议改为「熟」',
    );
    expect(
      preparationBasisMismatchHint('牛里脊/熟/去油', 'RAW'),
    ).toContain('部位 / 状态 / 预处理');
    expect(preparationBasisMismatchHint('生重、充分搅拌', 'OIL')).toContain(
      '不应写',
    );
    expect(preparationBasisMismatchHint('熟重、打碎', 'COOKED')).toBeNull();
  });

  it('maps states to Chinese labels and splits segments', () => {
    expect(preparationStateLabel('COOKED')).toBe('熟');
    expect(preparationStateLabel('concentrate')).toBe('浓缩补剂');
    expect(splitPreparationSegments('去皮、生重，打碎')).toEqual([
      '去皮',
      '生重',
      '打碎',
    ]);
    expect(splitPreparationSegments('牛里脊/生/去油')).toEqual([
      '牛里脊',
      '生',
      '去油',
    ]);
  });
});
