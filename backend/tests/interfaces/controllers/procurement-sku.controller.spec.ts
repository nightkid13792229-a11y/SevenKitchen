import { Test } from '@nestjs/testing';
import { ProcurementSkuService } from 'src/application/ingredient/procurement-sku.service';
import { ProcurementSkuController } from 'src/interfaces/controllers/procurement-sku.controller';

describe('ProcurementSkuController', () => {
  let controller: ProcurementSkuController;
  const procurementSkuService = {
    findByIngredientId: jest.fn().mockResolvedValue([
      {
        id: 'proc-sku-1',
        ingredientId: 'ingredient-1',
        name: '快驴鸡胸 2kg/包',
        isActive: true,
        sortOrder: 0,
      },
    ]),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProcurementSkuController],
      providers: [
        { provide: ProcurementSkuService, useValue: procurementSkuService },
      ],
    }).compile();

    controller = moduleRef.get(ProcurementSkuController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('lists procurement skus under the admin ingredient path', async () => {
    const response = await controller.list('ingredient-1');

    expect(response.code).toBe(0);
    expect(response.data[0].name).toBe('快驴鸡胸 2kg/包');
    expect(procurementSkuService.findByIngredientId).toHaveBeenCalledWith(
      'ingredient-1',
    );
  });
});
