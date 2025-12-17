/**
 * StaffKitchenController Unit Tests
 * Phase 8.12: Tests for staff kitchen API endpoints
 */

import { Test, TestingModule } from '@nestjs/testing';
import { StaffKitchenController } from './staff-kitchen.controller';
import { KitchenService } from '../../application/kitchen/kitchen.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
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

  describe('updateTask', () => {
    it('should return 400 when neither actualWeightG nor ingredientsActual is provided', async () => {
      // Act
      const result = await controller.updateTask('task-1', {} as any);

      // Assert
      expect(result.code).not.toBe(0);
      expect(result.message).toContain('actualWeightG or ingredientsActual');
      expect(kitchenService.updateTask).not.toHaveBeenCalled();
    });

    it('should return 400 when ingredientsActual has invalid structure', async () => {
      // Act
      const result = await controller.updateTask('task-1', {
        ingredientsActual: [{ ingredientId: '', actual_g: 100 }],
      } as any);

      // Assert
      expect(result.code).not.toBe(0);
      expect(result.message).toContain('ingredientId');
      expect(kitchenService.updateTask).not.toHaveBeenCalled();
    });

    it('should return 400 when actual_g is negative', async () => {
      // Act
      const result = await controller.updateTask('task-1', {
        ingredientsActual: [{ ingredientId: 'ing-1', actual_g: -10 }],
      } as any);

      // Assert
      expect(result.code).not.toBe(0);
      expect(result.message).toContain('non-negative number');
      expect(kitchenService.updateTask).not.toHaveBeenCalled();
    });

    it('should return 400 when ingredient not found in snapshot', async () => {
      // Arrange
      kitchenService.updateTask.mockRejectedValue(
        new BadRequestException('Ingredient ing-999 not found in recipe snapshot'),
      );

      // Act
      const result = await controller.updateTask('task-1', {
        ingredientsActual: [{ ingredientId: 'ing-999', actual_g: 100 }],
      } as any);

      // Assert
      expect(result.code).not.toBe(0);
      expect(result.message).toContain('not found in recipe snapshot');
      expect(kitchenService.updateTask).toHaveBeenCalled();
    });

    it('should return 404 when task not found', async () => {
      // Arrange
      kitchenService.updateTask.mockRejectedValue(
        new NotFoundException('Task (PackagingUnit) not found: task-999'),
      );

      // Act
      const result = await controller.updateTask('task-999', {
        ingredientsActual: [{ ingredientId: 'ing-1', actual_g: 100 }],
      } as any);

      // Assert
      expect(result.code).not.toBe(0);
      expect(result.message).toContain('not found');
      expect(kitchenService.updateTask).toHaveBeenCalled();
    });

    it('should successfully update task with valid payload', async () => {
      // Arrange
      const mockUnit = {
        id: 'task-1',
        status: PackagingUnitStatus.COMPLETED,
        ingredientsUsageSnapshot: {
          'ing-1': { required_g: 700, actual_g: 720 },
        },
        photosRaw: ['photo1.jpg'],
        photosCooked: [],
        photosPortioned: [],
      };
      kitchenService.updateTask.mockResolvedValue(mockUnit as any);

      // Act
      const result = await controller.updateTask('task-1', {
        ingredientsActual: [{ ingredientId: 'ing-1', actual_g: 720 }],
        status: PackagingUnitStatus.COMPLETED,
      } as any);

      // Assert
      expect(result.code).toBe(0);
      expect(result.data.id).toBe('task-1');
      expect(result.data.status).toBe(PackagingUnitStatus.COMPLETED);
      expect(kitchenService.updateTask).toHaveBeenCalledWith('task-1', expect.any(Object));
    });
  });
});
