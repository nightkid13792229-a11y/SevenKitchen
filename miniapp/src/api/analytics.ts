import { request } from '../utils/api'

export const analyticsApi = {
  trackDogProfileEvent: (data: Record<string, any>) =>
    request({
      url: '/analytics/dog-profile/events',
      method: 'POST',
      data,
      quiet: true,
      suppressErrorToast: true,
    }),
}
