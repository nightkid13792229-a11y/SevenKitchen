import { describe, expect, it } from 'vitest';
import {
  normalizeProcurementSkuOption,
  parseUploadFileErrorMessage,
  resolvePurchaseItemDisplay,
} from './purchasing';

describe('purchasing API display helpers', () => {
  it('normalizes SKU brand and effective price fields for purchase list detail display', () => {
    const option = normalizeProcurementSkuOption({
      id: 'sku-1',
      name: '有机海藻粉',
      brand: 'NOW FOODS',
      purchaseChannel: '天猫旗舰店',
      productModel: '227g/瓶',
      purchaseUnit: '瓶',
      purchaseToBaseRatio: 2522,
      currentPurchasePrice: 89.4,
    });

    expect(option).toEqual(
      expect.objectContaining({
        brand: 'NOW FOODS',
        purchaseUnit: '瓶',
        purchaseToBaseRatio: 2522,
        currentPurchasePrice: 89.4,
      }),
    );
  });

  it('resolves selected SKU brand and reference price metadata on purchase items', () => {
    const item = resolvePurchaseItemDisplay({
      procurementSkuId: 'sku-1',
      procurementSkuName: '有机海藻粉',
      quantityNeeded: 2.91,
      quantityUnit: '平勺',
      ingredient: {
        baseUnit: 'PCS',
        unitDisplayLabel: '平勺',
        procurementSkus: [
          {
            id: 'sku-1',
            name: '有机海藻粉',
            brand: 'NOW FOODS',
            purchaseChannel: '天猫旗舰店',
            productModel: '227g/瓶',
            purchaseUnit: '瓶',
            purchaseToBaseRatio: 2522,
            currentPurchasePrice: 89.4,
            isActive: true,
          },
        ],
      },
    });

    expect(item).toEqual(
      expect.objectContaining({
        resolvedBrand: 'NOW FOODS',
        resolvedCurrentPurchasePrice: 89.4,
        resolvedPurchaseToBaseRatio: 2522,
        resolvedPurchaseUnit: '瓶',
        resolvedBaseUnit: 'PCS',
        resolvedUnitDisplayLabel: '平勺',
      }),
    );
  });

  it('uses backend upload error messages instead of hiding them behind status codes', () => {
    expect(
      parseUploadFileErrorMessage(
        400,
        JSON.stringify({
          code: 400,
          message: '文件大小不能超过10MB',
        }),
        '上传失败',
      ),
    ).toBe('文件大小不能超过10MB');

    expect(parseUploadFileErrorMessage(400, 'not-json', '上传失败')).toBe(
      '上传失败，状态码: 400',
    );
  });
});
