import {
  extractBrandFromTitle,
  extractProductImage,
  extractProductModelFromTitle,
} from '../../../src/application/ingredient-creation/supplement-link-preview.service';

describe('补剂链接预览 · 商品主图', () => {
  it('从 markdown 图片里认出商品图', () => {
    const text = [
      '# NOW Foods, Zinc Picolinate, 50 mg, 100 Tablets',
      '![](https://cloudinary.images-iherb.com/image/upload/f_auto,q_auto/images/product_images/pimages/1.jpg)',
    ].join('\n');

    expect(extractProductImage(text)).toBe(
      'https://cloudinary.images-iherb.com/image/upload/f_auto,q_auto/images/product_images/pimages/1.jpg',
    );
  });

  it('只有 logo / 图标时不硬凑', () => {
    const text = [
      '![](https://cloudinary.images-iherb.com/logo.svg)',
      '![](https://www.iherb.com/static/icon-cart.png)',
    ].join('\n');

    expect(extractProductImage(text)).toBeNull();
  });

  it('页面没有图片 → null', () => {
    expect(extractProductImage('# 标题\n没有图片')).toBeNull();
  });
});

describe('补剂链接预览 · 品牌', () => {
  it('标题开头的已知品牌能认出来', () => {
    expect(extractBrandFromTitle('NOW Foods, Zinc Picolinate, 100 Tablets')).toBe(
      'NOW FOODS',
    );
    expect(extractBrandFromTitle("Nature's Way, Zinc, 30 mg, 100 Capsules")).toBe(
      "NATURE'S WAY",
    );
  });

  it('认不出就返回 null（不猜）', () => {
    expect(extractBrandFromTitle('某不知名小店 锌片 100 片')).toBeNull();
    expect(extractBrandFromTitle(null)).toBeNull();
  });
});

describe('补剂链接预览 · 规格', () => {
  it('取标题里最后一个「数量 + 单位」', () => {
    expect(
      extractProductModelFromTitle('NOW Foods, Zinc Picolinate, 50 mg, 100 Tablets'),
    ).toBe('100 Tablets');
    expect(
      extractProductModelFromTitle('Jarrow Formulas, B-Right, 100 Veg Capsules'),
    ).toBe('100 Veg Capsules');
    expect(extractProductModelFromTitle('KAL, Bone Meal, 250片')).toBe('250 片');
  });

  it('只有剂量没有包装规格 → null', () => {
    expect(extractProductModelFromTitle('NOW Foods, Zinc, 50 mg')).toBeNull();
    expect(extractProductModelFromTitle(null)).toBeNull();
  });
});
