import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DogService } from 'src/application/dog/dog.service';
import { Dog } from 'src/domain/dog/dog.entity';
import {
  ActivityLevel,
  DogGender,
  LifeStageOverride,
  TreatInputMode,
  TreatLevel,
} from 'src/domain';

describe('DogService.deleteDogProfile', () => {
  const createDog = (ownerId = 'customer-1') =>
    new Dog(
      'dog-1',
      ownerId,
      'Seven',
      'breed-1',
      null,
      new Date('2023-01-01'),
      DogGender.MALE,
      true,
      6.7,
      5,
      ActivityLevel.NORMAL,
      LifeStageOverride.NONE,
      null,
      2,
      TreatInputMode.ESTIMATE_LEVEL,
      TreatLevel.LOW,
      null,
      null,
      null,
      null,
      452,
    );

  const createService = () => {
    const dogRepository = {
      findById: jest.fn(),
      findByOwnerId: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const dogBreedRepository = {
      findById: jest.fn(),
      findAll: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };

    const recipeRepository = {
      findById: jest.fn(),
      findByIdAndVersion: jest.fn(),
      findPublicRecipes: jest.fn(),
    };

    const prisma = {
      order: {
        count: jest.fn(),
      },
    };

    return {
      dogRepository,
      prisma,
      service: new DogService(
        dogRepository as any,
        dogBreedRepository as any,
        recipeRepository as any,
        prisma as any,
      ),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes the dog when it belongs to the customer and has no active orders', async () => {
    const { service, dogRepository, prisma } = createService();
    dogRepository.findById.mockResolvedValue(createDog());
    prisma.order.count.mockResolvedValue(0);

    await expect(service.deleteDogProfile('customer-1', 'dog-1')).resolves.toBeUndefined();

    expect(prisma.order.count).toHaveBeenCalledWith({
      where: {
        dogId: 'dog-1',
      },
    });
    expect(dogRepository.delete).toHaveBeenCalledWith('dog-1');
  });

  it('throws not found when the dog does not exist', async () => {
    const { service, dogRepository } = createService();
    dogRepository.findById.mockResolvedValue(null);

    await expect(service.deleteDogProfile('customer-1', 'dog-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws forbidden when the dog belongs to another customer', async () => {
    const { service, dogRepository } = createService();
    dogRepository.findById.mockResolvedValue(createDog('customer-2'));

    await expect(service.deleteDogProfile('customer-1', 'dog-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws bad request when the dog has related orders', async () => {
    const { service, dogRepository, prisma } = createService();
    dogRepository.findById.mockResolvedValue(createDog());
    prisma.order.count.mockResolvedValue(2);

    await expect(service.deleteDogProfile('customer-1', 'dog-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(dogRepository.delete).not.toHaveBeenCalled();
  });
});
