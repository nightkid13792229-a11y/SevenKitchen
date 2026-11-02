import { describe, expect, it } from 'vitest';
import { decodeRouteParam } from './route-param';

describe('decodeRouteParam', () => {
  it('把编码过的中文还原（否则页面显示 %E7%B3%99%E7%B1%B3）', () => {
    expect(decodeRouteParam('%E7%B3%99%E7%B1%B3')).toBe('糙米');
  });

  it('已经是明文时原样返回', () => {
    expect(decodeRouteParam('糙米')).toBe('糙米');
  });

  it('残缺的编码不抛错，原样返回', () => {
    expect(decodeRouteParam('%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('空值返回空串', () => {
    expect(decodeRouteParam(undefined)).toBe('');
    expect(decodeRouteParam(null)).toBe('');
    expect(decodeRouteParam('')).toBe('');
  });
});
