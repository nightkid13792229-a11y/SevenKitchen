import { FavoritesController } from 'src/interfaces/controllers/favorites.controller';

describe('FavoritesController', () => {
  const user = {
    customerId: 'user-1',
  } as any;

  let controller: FavoritesController;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      recipe: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue(null),
      },
      favoriteRecipe: {
        findMany: jest.fn(),
        create: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
    };

    prisma.$transaction = jest.fn(async (callback: (tx: any) => unknown) =>
      callback(prisma),
    );

    controller = new FavoritesController(prisma);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('adds a favorite to the latest PUBLIC version when called with a business recipe id', async () => {
    prisma.recipe.findUnique.mockResolvedValueOnce(null);
    prisma.recipe.findMany.mockResolvedValueOnce([
      {
        id: 'recipe-v3',
        recipeId: 'recipe-business',
        version: 3,
        status: 'DRAFT',
      },
      {
        id: 'recipe-v2',
        recipeId: 'recipe-business',
        version: 2,
        status: 'PUBLIC',
      },
      {
        id: 'recipe-v1',
        recipeId: 'recipe-business',
        version: 1,
        status: 'PUBLIC',
      },
    ]);
    prisma.favoriteRecipe.findMany.mockResolvedValueOnce([]);
    prisma.favoriteRecipe.groupBy.mockResolvedValueOnce([
      {
        recipeId: 'recipe-v2',
        _count: {
          recipeId: 1,
        },
      },
    ]);

    const response = await controller.addFavorite(user, 'recipe-business');

    expect(response.code).toBe(0);
    expect(prisma.favoriteRecipe.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        recipeId: 'recipe-v2',
      },
    });
    expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['recipe-v3', 'recipe-v2', 'recipe-v1'],
        },
      },
      data: {
        favoriteCount: 0,
      },
    });
    expect(prisma.recipe.update).toHaveBeenCalledWith({
      where: { id: 'recipe-v2' },
      data: { favoriteCount: 1 },
    });
  });

  it('treats favorites on older versions of the same business recipe as already favorited', async () => {
    prisma.recipe.findUnique.mockResolvedValueOnce(null);
    prisma.recipe.findMany.mockResolvedValueOnce([
      {
        id: 'recipe-v2',
        recipeId: 'recipe-business',
        version: 2,
        status: 'PUBLIC',
      },
      {
        id: 'recipe-v1',
        recipeId: 'recipe-business',
        version: 1,
        status: 'PUBLIC',
      },
    ]);
    prisma.favoriteRecipe.findMany.mockResolvedValueOnce([
      {
        id: 'favorite-legacy',
        userId: 'user-1',
        recipeId: 'recipe-v1',
      },
    ]);

    const response = await controller.checkFavorite(user, 'recipe-business');

    expect(response.code).toBe(0);
    expect(response.data).toEqual({ isFavorite: true });
  });

  it('removes all favorites in the same recipe family when called with a business recipe id', async () => {
    prisma.recipe.findUnique.mockResolvedValueOnce(null);
    prisma.recipe.findMany.mockResolvedValueOnce([
      {
        id: 'recipe-v3',
        recipeId: 'recipe-business',
        version: 3,
        status: 'DRAFT',
      },
      {
        id: 'recipe-v2',
        recipeId: 'recipe-business',
        version: 2,
        status: 'PUBLIC',
      },
      {
        id: 'recipe-v1',
        recipeId: 'recipe-business',
        version: 1,
        status: 'PUBLIC',
      },
    ]);
    prisma.favoriteRecipe.findMany.mockResolvedValueOnce([
      {
        id: 'favorite-new',
        userId: 'user-1',
        recipeId: 'recipe-v2',
      },
      {
        id: 'favorite-old',
        userId: 'user-1',
        recipeId: 'recipe-v1',
      },
    ]);
    prisma.favoriteRecipe.groupBy.mockResolvedValueOnce([]);

    const response = await controller.removeFavorite(user, 'recipe-business');

    expect(response.code).toBe(0);
    expect(prisma.favoriteRecipe.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        recipeId: {
          in: ['recipe-v3', 'recipe-v2', 'recipe-v1'],
        },
      },
    });
    expect(prisma.recipe.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['recipe-v3', 'recipe-v2', 'recipe-v1'],
        },
      },
      data: {
        favoriteCount: 0,
      },
    });
  });
});
