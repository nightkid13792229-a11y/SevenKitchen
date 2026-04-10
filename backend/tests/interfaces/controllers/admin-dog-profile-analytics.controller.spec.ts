import { Test } from '@nestjs/testing';
import { AdminDogProfileAnalyticsController } from 'src/interfaces/controllers/admin-dog-profile-analytics.controller';
import { DogProfileAnalyticsService } from 'src/application/analytics/dog-profile-analytics.service';
import { AuthGuard } from 'src/interfaces/auth';
import { JwtAuthService } from 'src/interfaces/auth';
import { AdminGuard } from 'src/interfaces/guards/role.guard';

describe('AdminDogProfileAnalyticsController', () => {
  it('returns the analytics summary for a requested date range', async () => {
    const getSummary = jest.fn().mockResolvedValue({
      createFunnel: {
        started: 10,
        basicCompleted: 8,
        recommendationSucceeded: 6,
        submitted: 5,
      },
      editFunnel: { moduleOpened: 7, calcSucceeded: 5, saved: 4 },
      riskSignals: { draftRestored: 2, calcFailed: 1, submitFailed: 1, healthSkipped: 3 },
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminDogProfileAnalyticsController],
      providers: [
        { provide: DogProfileAnalyticsService, useValue: { getSummary } },
        { provide: AuthGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: AdminGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: JwtAuthService, useValue: { validateToken: jest.fn() } },
      ],
    }).compile();

    const controller = moduleRef.get(AdminDogProfileAnalyticsController);
    await expect(
      controller.getSummary('2026-04-01T00:00:00.000Z', '2026-04-07T00:00:00.000Z'),
    ).resolves.toEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          createFunnel: expect.objectContaining({ started: 10 }),
        }),
      }),
    );
  });
});
