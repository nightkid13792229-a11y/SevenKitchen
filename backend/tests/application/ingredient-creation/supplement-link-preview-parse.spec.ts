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

  it('评价图 / 用户图不算商品主图', () => {
    const text =
      '![](https://cloudinary.images-iherb.com/images/reviews/product-review-1.jpg)';
    expect(extractProductImage(text)).toBeNull();
  });

  it('不在白名单图床的图不采用', () => {
    expect(
      extractProductImage('![](https://s.taobao.com/product/1.jpg)'),
    ).toBeNull();
    expect(
      extractProductImage('![](https://evil.example.com/product/1.jpg)'),
    ).toBeNull();
  });

  it('http 图不采用（小程序只认 https）', () => {
    expect(
      extractProductImage(
        '![](http://cloudinary.images-iherb.com/images/product_images/1.jpg)',
      ),
    ).toBeNull();
  });

  it('页面没有图片 → null', () => {
    expect(extractProductImage('# 标题\n没有图片')).toBeNull();
  });
});

describe('补剂链接预览 · 品牌', () => {
  it('标题开头的已知品牌能认出来', () => {
    expect(extractBrandFromTitle('NOW Foods, Zinc Picolinate, 100 Tablets')).toBe(
      'NOW Foods',
    );
    expect(extractBrandFromTitle("Nature's Way, Zinc, 30 mg, 100 Capsules")).toBe(
      "Nature's Way",
    );
  });

  it('认不出就返回 null（不猜）', () => {
    expect(extractBrandFromTitle('某不知名小店 锌片 100 片')).toBeNull();
    expect(extractBrandFromTitle(null)).toBeNull();
  });

  it('相似前缀不算命中（Kalaya 不是 KAL）', () => {
    expect(extractBrandFromTitle('Kalaya Naturals, Arnica Gel, 50 ml')).toBeNull();
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
    expect(extractProductModelFromTitle('Vitamin C Powder, 1 g')).toBeNull();
    expect(extractProductModelFromTitle(null)).toBeNull();
  });

  it('计数单位优先，没计数才看重量', () => {
    expect(
      extractProductModelFromTitle('Vitamin C Powder, 1 g, 100 Servings'),
    ).toBe('100 Servings');
    expect(extractProductModelFromTitle('NOW Foods, Bone Meal, 340 g')).toBe(
      '340 g',
    );
  });
});
