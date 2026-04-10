import { Test } from '@nestjs/testing';
import { DogProfileAnalyticsController } from 'src/interfaces/controllers/dog-profile-analytics.controller';
import { DogProfileAnalyticsService } from 'src/application/analytics/dog-profile-analytics.service';
import { AuthGuard } from 'src/interfaces/auth';
import { JwtAuthService } from 'src/interfaces/auth';

describe('DogProfileAnalyticsController', () => {
  it('forwards one track request to the analytics service', async () => {
    const track = jest.fn().mockResolvedValue({ id: 'evt-1' });
    const moduleRef = await Test.createTestingModule({
      controllers: [DogProfileAnalyticsController],
      providers: [
        { provide: DogProfileAnalyticsService, useValue: { track } },
        { provide: AuthGuard, useValue: { canActivate: jest.fn().mockReturnValue(true) } },
        { provide: JwtAuthService, useValue: { validateToken: jest.fn() } },
      ],
    }).compile();

    const controller = moduleRef.get(DogProfileAnalyticsController);

    await controller.trackEvent(
      {
        eventName: 'dog_profile_create_started',
        mode: 'create',
        entrySource: 'dog_list',
        stepName: 'basic_info',
      } as any,
      { customerId: 'customer-a' } as any,
    );

    expect(track).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: 'customer-a',
        eventName: 'dog_profile_create_started',
      }),
    );
  });
});
