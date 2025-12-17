/**
 * StaffKitchenController Unit Tests
 * Phase 8.12: Tests for staff kitchen API endpoints
 */

import { Test, TestingModule } from '@nestjs/testing';
import { StaffKitchenController } from './staff-kitchen.controller';
import { KitchenService } from '../../application/kitchen/kitchen.service';
import { BadRequestException } from '@nestjs/common';
import { PackagingUnitStatus } from '../../domain/production';

describe('StaffKitchenController', () => {
  let controller: StaffKitchenController;
  let kitchenService: jest.Mocked<KitchenService>;

  const mockKitchenService: jest.Mocked<KitchenService> = {
    listBatchesByStatus: jest.fn(),
    getBatchDetail: jest.fn(),
    updateTask: jest.fn(),
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffKitchenController],
      providers: [
        {
          provide: KitchenService,
          useValue: mockKitchenService,
        },
      ],
    }).compile();

    controller = module.get<StaffKitchenController>(StaffKitchenController);
    kitchenService = module.get(KitchenService);

    jest.clearAllMocks();
  });

  describe('listBatches', () => {
    it('should return batches when status=PENDING', async () => {
      // Arrange
      const mockBatches = [
        {
          id: 'batch-1',
          productionDate: '2025-01-20',
          status: 'PLANNED',
          taskCount: 1,
          tasks: [
            {
              id: 'unit-1',
              recipeSnapshotId: 'recipe-1',
              recipeName: 'Test Recipe',
              totalProductionG: 1000,
              status: 'PENDING',
              hasPhotos: false,
              hasActualUsage: false,
            },
          ],
        },
      ];

      kitchenService.listBatchesByStatus.mockResolvedValue(mockBatches);

      // Act
      const result = await controller.listBatches('PENDING');

      // Assert
      expect(result.code).toBe(0);
      expect(result.data).toEqual(mockBatches);
      expect(kitchenService.listBatchesByStatus).toHaveBeenCalledWith(
        PackagingUnitStatus.PENDING,
      );
    });

    it('should return 400 for invalid status', async () => {
      // Act
      const result = await controller.listBatches('INVALID_STATUS');

      // Assert
      expect(result.code).not.toBe(0);
      expect(result.message).toContain('Invalid status');
      expect(kitchenService.listBatchesByStatus).not.toHaveBeenCalled();
    });

    it('should return batches when no status provided', async () => {
      // Arrange
      const mockBatches = [
        {
          id: 'batch-1',
          productionDate: '2025-01-20',
          status: 'PLANNED',
          taskCount: 1,
          tasks: [],
        },
      ];

      kitchenService.listBatchesByStatus.mockResolvedValue(mockBatches);

      // Act
      const result = await controller.listBatches(undefined);

      // Assert
      expect(result.code).toBe(0);
      expect(result.data).toEqual(mockBatches);
      expect(kitchenService.listBatchesByStatus).toHaveBeenCalledWith(undefined);
    });

    it('should handle case-insensitive status', async () => {
      // Arrange
      const mockBatches = [];
      kitchenService.listBatchesByStatus.mockResolvedValue(mockBatches);

      // Act
      const result = await controller.listBatches('pending'); // lowercase

      // Assert
      expect(result.code).toBe(0);
      expect(kitchenService.listBatchesByStatus).toHaveBeenCalledWith(
        PackagingUnitStatus.PENDING,
      );
    });
  });
});
