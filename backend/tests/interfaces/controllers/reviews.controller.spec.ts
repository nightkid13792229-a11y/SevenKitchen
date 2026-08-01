import { ReviewsController } from 'src/interfaces/controllers/reviews.controller';

describe('ReviewsController content security', () => {
  it('does not save an admin review when WeChat flags its content', async () => {
    const prisma = {
      recipe: {
        findFirst: jest.fn().mockResolvedValue({ id: 'recipe-1' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ wechatOpenid: 'openid-1' }),
      },
      recipeReview: {
        create: jest.fn(),
      },
    };
    const wechatService = {
      checkTextContent: jest.fn().mockResolvedValue({ safe: false }),
    };
    const controller = new ReviewsController(
      prisma as any,
      {} as any,
      wechatService as any,
    );

    const response = await controller.createAdminReview(
      { customerId: 'admin-1', role: 'ADMIN' } as any,
      {
        recipeId: 'recipe-1',
        ratingEase: 5,
        ratingValue: 5,
        ratingTaste: 5,
        content: '风险文本',
      },
    );

    expect(response.code).toBe(400);
    expect(response.message).toBe(
      '发布失败：内容含违规或不适宜信息，请修改后重试',
    );
    expect(prisma.recipeReview.create).not.toHaveBeenCalled();
  });

  it('saves a customer review only after WeChat marks its content safe', async () => {
    const prisma = {
      recipe: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'recipe-1', recipeId: 'recipe-business-1' }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ wechatOpenid: 'openid-1' }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue([
          {
            items: [{ recipeSnapshot: { id: 'recipe-1' } }],
          },
        ]),
      },
      recipeReview: {
        create: jest.fn().mockResolvedValue({ id: 'review-1' }),
      },
    };
    const wechatService = {
      checkTextContent: jest.fn().mockResolvedValue({ safe: true }),
    };
    const controller = new ReviewsController(
      prisma as any,
      {} as any,
      wechatService as any,
    );

    const response = await controller.createReview(
      { customerId: 'customer-1', role: 'CUSTOMER' } as any,
      'recipe-1',
      {
        ratingEase: 5,
        ratingValue: 5,
        ratingTaste: 5,
        content: '制作顺利，小狗很喜欢。',
      },
    );

    expect(wechatService.checkTextContent).toHaveBeenCalledWith(
      '制作顺利，小狗很喜欢。',
      'openid-1',
    );
    expect(prisma.recipeReview.create).toHaveBeenCalledTimes(1);
    expect(response.code).toBe(0);
  });
});
