import { normalizeImageUrlProtocol } from '../../src/utils/image-url.util';

describe('normalizeImageUrlProtocol', () => {
  it('把历史遗留的 http 图片地址升级为 https', () => {
    expect(
      normalizeImageUrlProtocol(
        'http://img.sevenkitchen.cloud/recipes/1767243972852-a51efe41.jpg',
      ),
    ).toBe(
      'https://img.sevenkitchen.cloud/recipes/1767243972852-a51efe41.jpg',
    );
  });

  it('已经是 https 的地址原样返回', () => {
    expect(
      normalizeImageUrlProtocol(
        'https://img.sevenkitchen.cloud/recipes/cover.jpg',
      ),
    ).toBe('https://img.sevenkitchen.cloud/recipes/cover.jpg');
  });

  it('空值与 undefined 保持原样', () => {
    expect(normalizeImageUrlProtocol(null)).toBeNull();
    expect(normalizeImageUrlProtocol(undefined)).toBeUndefined();
    expect(normalizeImageUrlProtocol('')).toBe('');
  });

  it('非 http 协议的字符串不做处理', () => {
    expect(normalizeImageUrlProtocol('ftp://example.com/a.jpg')).toBe(
      'ftp://example.com/a.jpg',
    );
    expect(normalizeImageUrlProtocol('//img.sevenkitchen.cloud/a.jpg')).toBe(
      '//img.sevenkitchen.cloud/a.jpg',
    );
  });
});
