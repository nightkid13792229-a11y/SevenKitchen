import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../utils/config', () => ({
  getBaseUrl: () => 'https://api.example.com/api/v1',
}))

vi.mock('../utils/api', async () => {
  const actual = await vi.importActual<typeof import('../utils/api')>('../utils/api')
  return {
    ...actual,
    request: vi.fn(),
    getToken: () => 'token-123',
  }
})

import { dogApi } from './dogs'
import { request } from '../utils/api'

const mockedRequest = vi.mocked(request)

const uploadFile = vi.fn()

vi.stubGlobal('uni', {
  uploadFile,
  getStorageSync: vi.fn(() => ''),
})

describe('dogApi avatar upload', () => {
  beforeEach(() => {
    uploadFile.mockReset()
  })

  it('uploads a dog avatar through the shared miniapp upload path', async () => {
    uploadFile.mockImplementation((options: any) => {
      options.success({
        statusCode: 201,
        data: JSON.stringify({
          code: 0,
          data: { url: 'https://cdn.example.com/dogs/seven-new.png' },
        }),
      })
    })

    await expect((dogApi as any).uploadAvatar('dog-123', '/tmp/dog-avatar.png')).resolves.toBe(
      'https://cdn.example.com/dogs/seven-new.png',
    )

    expect(uploadFile).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.example.com/api/v1/dogs/dog-123/avatar',
      filePath: '/tmp/dog-avatar.png',
      name: 'file',
      header: expect.objectContaining({
        Authorization: 'Bearer token-123',
      }),
    }))
  })
})

describe('dogApi healthRecords', () => {
  beforeEach(() => {
    mockedRequest.mockReset()
  })

  it('uses independent medical record endpoints for list, create, update, and delete', () => {
    const createPayload = {
      chiefComplaint: 'Limping',
      visitDate: '2026-04-20',
      diagnosis: 'Mild sprain',
      notes: 'Rest for one week',
      treatment: 'Anti-inflammatory medication',
      medications: ['Carprofen'],
      status: 'TREATING' as const,
      followUpDate: '2026-05-01',
      veterinarian: 'Dr. Lin',
      attachments: ['oss://records/xray.png'],
    }
    const updatePayload = {
      notes: null,
      treatment: 'Continue rest',
      attachments: [],
    }

    dogApi.healthRecords.medical.list('dog-1')
    dogApi.healthRecords.medical.create('dog-1', createPayload)
    dogApi.healthRecords.medical.update('dog-1', 'medical-1', updatePayload)
    dogApi.healthRecords.medical.delete('dog-1', 'medical-1')

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/dogs/dog-1/medical-records',
      method: 'GET',
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: '/dogs/dog-1/medical-records',
      method: 'POST',
      data: createPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(3, {
      url: '/dogs/dog-1/medical-records/medical-1',
      method: 'PUT',
      data: updatePayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(4, {
      url: '/dogs/dog-1/medical-records/medical-1',
      method: 'DELETE',
    })
  })

  it('uses independent checkup and allergy record endpoints', () => {
    const checkupPayload = {
      checkupType: 'annual',
      checkupDate: '2026-04-21',
      findings: 'Healthy',
      recommendations: null,
      veterinarian: 'Dr. Zhang',
      attachments: ['oss://records/checkup.pdf'],
    }
    const allergyPayload = {
      allergen: 'Chicken',
      notes: null,
      attachments: [],
    }

    dogApi.healthRecords.checkup.create('dog-1', checkupPayload)
    dogApi.healthRecords.allergy.update('dog-1', 'allergy-1', allergyPayload)

    expect(mockedRequest).toHaveBeenNthCalledWith(1, {
      url: '/dogs/dog-1/checkups',
      method: 'POST',
      data: checkupPayload,
    })
    expect(mockedRequest).toHaveBeenNthCalledWith(2, {
      url: '/dogs/dog-1/allergies/allergy-1',
      method: 'PUT',
      data: allergyPayload,
    })
  })
})

describe('dogApi finishedFoodHistory', () => {
  beforeEach(() => {
    mockedRequest.mockReset()
  })

  it('loads customer-visible finished-food order history for a dog', () => {
    ;(dogApi as any).finishedFoodHistory('dog-1')

    expect(mockedRequest).toHaveBeenCalledWith({
      url: '/dogs/dog-1/finished-food-history',
      method: 'GET',
    })
  })
})
