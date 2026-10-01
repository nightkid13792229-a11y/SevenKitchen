import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveHealthScanErrorMessage,
  buildDogHealthStateSnapshot,
  buildDietRemindersPayload,
  buildHealthRecordFocusIdentity,
  buildHealthRecordSummary,
  buildHealthAttachmentDeletePath,
  buildHealthAttachmentUploadUrl,
  buildHealthAttachmentFieldHint,
  buildHealthRecordPayload,
  buildHealthRecordSectionPayload,
  doHealthRecordsMatchPersistedPayload,
  findPersistedHealthRecordMatch,
  buildHealthAttachmentDisplayMeta,
  buildCrudHealthRecordPayload,
  createHealthRecordDraft,
  extractHealthAttachmentKey,
  findHealthRecordFocusIndex,
  formatHealthCheckupTypeLabel,
  formatMedicalStatusLabel,
  getHealthCheckupTypeOptions,
  getMedicalStatusOptions,
  getHealthRecordTypeMeta,
  getHealthRecordValidationError,
  hasUnsavedDietReminderChange,
  mergeDogHealthStateSnapshot,
  mergeHealthRecordListWithCachedAttachments,
  normalizeHealthRecordListResponse,
  normalizeSavedHealthRecordResponse,
  parseHealthAttachmentUploadResponse,
  readHealthAttachmentFileSize,
  removeHealthRecordFromList,
  removeHealthRecordAttachmentCache,
  replaceHealthRecordInList,
  resolveDogHealthSelectionState,
  resolveHealthAttachmentPreviewType,
  resolveHealthAttachmentSelectionError,
  resolveHealthAttachmentFileSizeError,
  resolveHealthAttachmentUploadErrorMessage,
  resolveHealthRecordSecondaryActionText,
  mergeScannedReportDrafts,
  shouldDiscardDogHealthProfileResponse,
  shouldUseRemoteHealthRecordSync,
  writeHealthRecordAttachmentCache,
} from './health-records'

describe('health-records', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('creates a blank medical draft with local id and attachment list', () => {
    const record = createHealthRecordDraft('medical')

    expect(record.__localId).toBeTruthy()
    expect(record.chiefComplaint).toBe('')
    expect(record.visitDate).toBe('')
    expect(record.diagnosis).toBe('')
    expect(record.notes).toBe('')
    expect(record.attachments).toEqual([])
  })

  it('creates a blank checkup draft with checkup fields', () => {
    const record = createHealthRecordDraft('checkup')

    expect(record.__localId).toBeTruthy()
    expect(record.checkupType).toBe('')
    expect(record.checkupDate).toBe('')
    expect(record.notes).toBe('')
    expect(record.attachments).toEqual([])
  })

  it('validates required medical fields', () => {
    expect(
      getHealthRecordValidationError('medical', {
        chiefComplaint: '',
        visitDate: '',
        diagnosis: '',
        notes: '',
        attachments: [],
      }),
    ).toBe('请补充症状或疾病')
  })

  it('validates required checkup fields', () => {
    expect(
      getHealthRecordValidationError('checkup', {
        checkupType: 'ROUTINE',
        checkupDate: '',
        notes: '',
        attachments: [],
      }),
    ).toBe('请补充体检日期')
  })

  it('rejects unsupported checkup type values before sending them to the API', () => {
    expect(
      getHealthRecordValidationError('checkup', {
        checkupType: '222',
        checkupDate: '2025-04-28',
        notes: '',
        attachments: [],
      }),
    ).toBe('请选择体检类型')
  })

  it('validates required allergy fields', () => {
    expect(
      getHealthRecordValidationError('allergy', {
        allergen: '',
        notes: '疑似对鸡肉过敏',
        attachments: [],
      }),
    ).toBe('请补充过敏原')
  })

  it('builds a medical payload with trimmed strings and attachments', () => {
    expect(
      buildHealthRecordPayload('medical', {
        chiefComplaint: ' 胃炎 ',
        visitDate: '2026-04-07',
        diagnosis: ' 轻度胃炎 ',
        notes: ' 需要复查 ',
        attachments: ['https://cdn.test/medical-records/a.png'],
      }),
    ).toEqual({
      chiefComplaint: '胃炎',
      visitDate: '2026-04-07',
      diagnosis: '轻度胃炎',
      // 2026-09-28：疾病状态缺省是「待确认」——系统不替兽医断言是不是慢性病
      status: 'PENDING_CONFIRMATION',
      notes: '需要复查',
      attachments: ['https://cdn.test/medical-records/a.png'],
    })
  })

  it('keeps checkup notes in the overview record shape used by dog profile updates', () => {
    expect(
      buildHealthRecordPayload('checkup', {
        checkupType: '年度体检',
        checkupDate: '2026-04-07',
        notes: ' 皮肤状态稳定 ',
        attachments: ['https://cdn.test/checkup-records/a.pdf'],
      }),
    ).toEqual({
      checkupType: 'ROUTINE',
      checkupDate: '2026-04-07',
      notes: '皮肤状态稳定',
      attachments: ['https://cdn.test/checkup-records/a.pdf'],
    })
  })

  it('returns display metadata for segmented health record types', () => {
    expect(getHealthRecordTypeMeta('medical')).toMatchObject({
      label: '病史',
      addLabel: '新增病史',
      emptyTitle: '还没有病史记录',
      accentClass: 'health-records--medical',
    })
    expect(getHealthRecordTypeMeta('checkup')).toMatchObject({
      label: '体检',
      addLabel: '新增体检',
      emptyTitle: '还没有体检记录',
      accentClass: 'health-records--checkup',
    })
    expect(getHealthRecordTypeMeta('allergy')).toMatchObject({
      label: '过敏',
      addLabel: '新增过敏',
      emptyTitle: '还没有过敏记录',
      accentClass: 'health-records--allergy',
    })
  })

  it('builds checkup CRUD payloads with findings while preserving attachments', () => {
    expect(
      buildCrudHealthRecordPayload('checkup', {
        checkupType: ' 年度体检 ',
        checkupDate: '2026-04-07',
        notes: ' 皮肤状态稳定 ',
        attachments: [
          'https://cdn.test/checkup-records/a.pdf',
          { url: ' https://cdn.test/checkup-records/b.png ' },
        ],
      }),
    ).toEqual({
      checkupType: 'ROUTINE',
      checkupDate: '2026-04-07',
      findings: '皮肤状态稳定',
      attachments: [
        'https://cdn.test/checkup-records/a.pdf',
        'https://cdn.test/checkup-records/b.png',
      ],
    })
  })

  it('exposes backend-compatible checkup type options with readable labels', () => {
    expect(getHealthCheckupTypeOptions()).toEqual([
      { value: 'ROUTINE', label: '常规体检' },
      { value: 'PRE_PURCHASE', label: '购前体检' },
      { value: 'SENIOR_WELLNESS', label: '老年健康检查' },
      { value: 'PRE_ANESTHESIA', label: '麻醉前检查' },
      { value: 'EMERGENCY', label: '急诊检查' },
      { value: 'FOLLOW_UP', label: '复查' },
    ])
    expect(formatHealthCheckupTypeLabel('ROUTINE')).toBe('常规体检')
    expect(formatHealthCheckupTypeLabel('年度体检')).toBe('常规体检')
  })

  it('normalizes wrapped independent health record list responses', () => {
    expect(
      normalizeHealthRecordListResponse({
        code: 0,
        data: {
          records: [
            {
              id: 'checkup-1',
              checkupType: '年度体检',
              findings: '皮肤状态稳定',
              attachments: [
                'https://cdn.test/checkup-records/a.pdf',
                { url: ' https://cdn.test/checkup-records/b.png ' },
              ],
            },
          ],
        },
      }),
    ).toEqual([
      {
        id: 'checkup-1',
        checkupType: '年度体检',
        findings: '皮肤状态稳定',
        notes: '皮肤状态稳定',
        attachments: [
          'https://cdn.test/checkup-records/a.pdf',
          'https://cdn.test/checkup-records/b.png',
        ],
      },
    ])

    expect(normalizeHealthRecordListResponse({ code: 0, data: {} })).toEqual([])
  })

  it('keeps submitted attachments when a save response omits them', () => {
    expect(
      normalizeSavedHealthRecordResponse(
        {
          id: 'medical-1',
          chiefComplaint: '急性肠胃炎',
          visitDate: '2026-04-28',
          diagnosis: '急性肠胃炎',
        },
        {
          chiefComplaint: '急性肠胃炎',
          visitDate: '2026-04-28',
          diagnosis: '急性肠胃炎',
          attachments: ['https://cdn.test/medical-records/report.png'],
        },
      ),
    ).toMatchObject({
      id: 'medical-1',
      attachments: ['https://cdn.test/medical-records/report.png'],
    })
  })

  it('restores saved attachments from cache when a reloaded list omits them', () => {
    const storage: Record<string, any> = {}
    vi.stubGlobal('uni', {
      getStorageSync: (key: string) => storage[key],
      setStorageSync: (key: string, value: any) => {
        storage[key] = value
      },
      removeStorageSync: (key: string) => {
        delete storage[key]
      },
    })

    writeHealthRecordAttachmentCache('dog-1', 'medical', {
      id: 'medical-1',
      chiefComplaint: '急性肠胃炎',
      visitDate: '2026-04-28',
      diagnosis: '急性肠胃炎',
      attachments: ['https://cdn.test/medical-records/report.png'],
    })

    expect(
      mergeHealthRecordListWithCachedAttachments('dog-1', 'medical', [
        {
          id: 'medical-1',
          chiefComplaint: '急性肠胃炎',
          visitDate: '2026-04-28',
          diagnosis: '急性肠胃炎',
          attachments: [],
        },
      ]),
    ).toEqual([
      {
        id: 'medical-1',
        chiefComplaint: '急性肠胃炎',
        visitDate: '2026-04-28',
        diagnosis: '急性肠胃炎',
        attachments: ['https://cdn.test/medical-records/report.png'],
      },
    ])

    removeHealthRecordAttachmentCache('dog-1', 'medical', { id: 'medical-1' })

    expect(
      mergeHealthRecordListWithCachedAttachments('dog-1', 'medical', [
        { id: 'medical-1', attachments: [] },
      ]),
    ).toEqual([{ id: 'medical-1', attachments: [] }])
  })

  it('replaces matching health records and prepends new records', () => {
    const records = [
      { id: 'record-1', notes: '保留' },
      { id: 'record-2', notes: '旧记录' },
    ]

    expect(
      replaceHealthRecordInList(records, { id: 'record-2', notes: '新记录' }),
    ).toEqual([
      { id: 'record-1', notes: '保留' },
      { id: 'record-2', notes: '新记录' },
    ])
    expect(
      replaceHealthRecordInList(records, { id: 'record-3', notes: '新增记录' }),
    ).toEqual([
      { id: 'record-3', notes: '新增记录' },
      { id: 'record-1', notes: '保留' },
      { id: 'record-2', notes: '旧记录' },
    ])
  })

  it('removes only the matching health record by id', () => {
    expect(
      removeHealthRecordFromList(
        [
          { id: 'record-1', notes: '保留' },
          { id: 'record-2', notes: '删除' },
          { id: 'record-3', notes: '也保留' },
        ],
        'record-2',
      ),
    ).toEqual([
      { id: 'record-1', notes: '保留' },
      { id: 'record-3', notes: '也保留' },
    ])
  })

  it('builds an allergy payload with trimmed fields', () => {
    expect(
      buildHealthRecordPayload('allergy', {
        allergen: ' 鸡肉 ',
        notes: ' 轻微腹泻 ',
        attachments: ['https://cdn.test/allergy-records/a.pdf'],
      }),
    ).toEqual({
      allergen: '鸡肉',
      notes: '轻微腹泻',
      attachments: ['https://cdn.test/allergy-records/a.pdf'],
    })
  })

  it('normalizes diet reminders to nullable payload values', () => {
    expect(
      buildDietRemindersPayload({
        allergyFoods: ' 鸡肉 ',
        pickyFoods: '   ',
      }),
    ).toEqual({
      allergyFoods: '鸡肉',
      pickyFoods: null,
    })
  })

  it('omits legacy allergyFoods when only picky foods are being updated', () => {
    expect(
      buildDietRemindersPayload({
        pickyFoods: ' 西兰花 ',
      }),
    ).toEqual({
      pickyFoods: '西兰花',
    })
  })

  it('carries preferred foods（喜欢吃的食材）alongside picky foods', () => {
    // 2026-09-27：这一列配方设计器与 AI 早就在读，但顾客端一直没有入口。
    expect(
      buildDietRemindersPayload({
        preferredFoods: ' 鸡胸肉、南瓜 ',
        pickyFoods: '胡萝卜',
      }),
    ).toEqual({
      preferredFoods: '鸡胸肉、南瓜',
      pickyFoods: '胡萝卜',
    })

    // 只清空喜欢吃的，不影响不爱吃的
    expect(
      buildDietRemindersPayload({
        preferredFoods: '',
        pickyFoods: '胡萝卜',
      }),
    ).toEqual({
      preferredFoods: null,
      pickyFoods: '胡萝卜',
    })
  })

  it('detects unsaved diet reminder changes with trimmed values', () => {
    expect(hasUnsavedDietReminderChange(' 胡萝卜 ', '胡萝卜')).toBe(false)
    expect(hasUnsavedDietReminderChange('胡萝卜、鸡肉', '胡萝卜')).toBe(true)
  })

  /**
   * 疾病状态（2026-09-28，落实老板拍板的决策 5）
   *
   * 顾客自述的疾病（例如食谱定制页填的）曾被系统直接标成 CHRONIC（慢性），
   * 生产上真实发生过一次（"肠胃敏感"被标成慢性）。而"是不是慢性病"
   * 只有兽医能判断 —— 系统不该替他们下结论。
   */
  describe('疾病状态', () => {
    it('缺省是「待确认」，而不是默认的「治疗中」', () => {
      const payload = buildHealthRecordPayload('medical', {
        chiefComplaint: '肠胃敏感',
        visitDate: '2026-09-01',
        diagnosis: '',
        notes: '',
        attachments: [],
      })

      expect(payload.status).toBe('PENDING_CONFIRMATION')
    })

    it('顾客自己选过的状态会原样提交', () => {
      for (const status of ['TREATING', 'RECOVERED', 'CHRONIC']) {
        const payload = buildHealthRecordPayload('medical', {
          chiefComplaint: '胃炎',
          visitDate: '2026-09-01',
          diagnosis: '',
          notes: '',
          attachments: [],
          status,
        })

        expect(payload.status).toBe(status)
      }
    })

    it('非法状态回落到「待确认」，不会把脏值写给后端', () => {
      const payload = buildHealthRecordPayload('medical', {
        chiefComplaint: '胃炎',
        visitDate: '2026-09-01',
        diagnosis: '',
        notes: '',
        attachments: [],
        status: 'SOMETHING_ELSE',
      })

      expect(payload.status).toBe('PENDING_CONFIRMATION')
    })

    it('新建病史草稿默认「待确认」', () => {
      expect(createHealthRecordDraft('medical').status).toBe(
        'PENDING_CONFIRMATION',
      )
    })

    it('状态有中文文案，并且会出现在病史卡片摘要里', () => {
      expect(formatMedicalStatusLabel('PENDING_CONFIRMATION')).toBe('待确认')
      expect(getMedicalStatusOptions().map(option => option.value)).toEqual([
        'PENDING_CONFIRMATION',
        'TREATING',
        'RECOVERED',
        'CHRONIC',
      ])

      const summary = buildHealthRecordSummary('medical', {
        chiefComplaint: '肠胃敏感',
        visitDate: '2026-09-01',
        diagnosis: '',
        status: 'PENDING_CONFIRMATION',
        attachments: [],
      })

      expect(summary.detail).toContain('待确认')
    })
  })

  it('resolves empty dog selections separately from loading errors', () => {
    expect(resolveDogHealthSelectionState([], 'dog-1')).toEqual({
      hasNoDogs: true,
      selectedIndex: -1,
      selectedDogId: '',
    })
  })

  it('selects the preferred dog when opening health records with a dog id', () => {
    expect(
      resolveDogHealthSelectionState([
        { id: 'dog-1', name: '七七' },
        { id: 'dog-2', name: '饭团' },
      ], 'dog-2'),
    ).toEqual({
      hasNoDogs: false,
      selectedIndex: 1,
      selectedDogId: 'dog-2',
    })
  })

  it('discards stale health profile responses that no longer match the active request', () => {
    expect(
      shouldDiscardDogHealthProfileResponse({
        requestedDogId: 'dog-1',
        latestRequestedDogId: 'dog-2',
      }),
    ).toBe(true)

    expect(
      shouldDiscardDogHealthProfileResponse({
        requestedDogId: 'dog-2',
        latestRequestedDogId: 'dog-2',
      }),
    ).toBe(false)
  })

  it('builds a partial profile update payload for a single health record section', () => {
    expect(
      buildHealthRecordSectionPayload('medical', [
        {
          chiefComplaint: ' 胃炎 ',
          visitDate: '2026-04-07',
          diagnosis: ' 轻度胃炎 ',
          notes: ' 需要复查 ',
          attachments: ['https://cdn.test/medical-records/a.png'],
        },
      ]),
    ).toEqual({
      medicalRecords: [
        {
          status: 'PENDING_CONFIRMATION',
          chiefComplaint: '胃炎',
          visitDate: '2026-04-07',
          diagnosis: '轻度胃炎',
          notes: '需要复查',
          attachments: ['https://cdn.test/medical-records/a.png'],
        },
      ],
    })
  })

  it('matches a newly persisted health record when the server adds an id', () => {
    expect(
      doHealthRecordsMatchPersistedPayload(
        'medical',
        {
          __localId: 'medical-local-1',
          chiefComplaint: '急性胰腺炎。',
          visitDate: '2026-03-26',
          diagnosis: '急性胰腺炎。',
          notes: '急性胰腺炎的补充说明。',
          attachments: ['https://cdn.example.com/medical-records/report.png'],
        },
        {
          id: 'medical-server-1',
          chiefComplaint: '急性胰腺炎。',
          visitDate: '2026-03-26',
          diagnosis: '急性胰腺炎。',
          notes: '急性胰腺炎的补充说明。',
          attachments: ['https://cdn.example.com/medical-records/report.png'],
        },
      ),
    ).toBe(true)
  })

  it('matches optional empty notes after the backend normalizes them to null', () => {
    expect(
      doHealthRecordsMatchPersistedPayload(
        'checkup',
        {
          checkupType: '年度体检',
          checkupDate: '2026-03-26',
          notes: '',
          attachments: [],
        },
        {
          id: 'checkup-server-1',
          checkupType: '年度体检',
          checkupDate: '2026-03-26',
          notes: null,
          attachments: [],
        },
      ),
    ).toBe(true)
  })

  it('falls back to payload matching when the backend replaces a saved record id', () => {
    expect(
      findPersistedHealthRecordMatch(
        'checkup',
        [
          {
            id: 'new-checkup-id',
            checkupType: '666',
            checkupDate: '2026-04-27',
            notes: '777888',
            attachments: [],
          },
        ],
        {
          id: 'old-checkup-id',
          checkupType: '666',
          checkupDate: '2026-04-27',
          notes: '777888',
          attachments: [],
        },
      ),
    ).toEqual({
      id: 'new-checkup-id',
      checkupType: '666',
      checkupDate: '2026-04-27',
      notes: '777888',
      attachments: [],
    })
  })

  it('builds upload urls for each record type', () => {
    expect(buildHealthAttachmentUploadUrl('http://127.0.0.1:3011/api/v1', 'medical')).toBe(
      'http://127.0.0.1:3011/api/v1/dogs/medical-records/upload-attachment',
    )
    expect(buildHealthAttachmentUploadUrl('http://127.0.0.1:3011/api/v1', 'checkup')).toBe(
      'http://127.0.0.1:3011/api/v1/dogs/checkup-records/upload-attachment',
    )
    expect(buildHealthAttachmentUploadUrl('http://127.0.0.1:3011/api/v1', 'allergy')).toBe(
      'http://127.0.0.1:3011/api/v1/health/upload-image',
    )
  })

  it('builds delete paths for each record type', () => {
    expect(buildHealthAttachmentDeletePath('medical')).toBe('/dogs/medical-records/attachments')
    expect(buildHealthAttachmentDeletePath('checkup')).toBe('/dogs/checkup-records/attachments')
    expect(buildHealthAttachmentDeletePath('allergy')).toBe('/health/attachments')
  })

  it('extracts COS keys from uploaded attachment urls', () => {
    expect(
      extractHealthAttachmentKey('https://cdn.example.com/medical-records/1710000000-test.pdf'),
    ).toBe('medical-records/1710000000-test.pdf')
    expect(
      extractHealthAttachmentKey('https://bucket.cos.ap-shanghai.myqcloud.com/checkup-records/a.png'),
    ).toBe('checkup-records/a.png')
  })

  it('parses upload responses and returns url/key pair', () => {
    expect(
      parseHealthAttachmentUploadResponse({
        statusCode: 201,
        data: JSON.stringify({
          code: 0,
          message: 'Success',
          data: {
            url: 'https://cdn.example.com/allergy-records/a.pdf',
            key: 'allergy-records/a.pdf',
          },
        }),
      }),
    ).toEqual({
      url: 'https://cdn.example.com/allergy-records/a.pdf',
      key: 'allergy-records/a.pdf',
    })
  })

  it('preserves backend messages for failed health attachment uploads', () => {
    expect(() =>
      parseHealthAttachmentUploadResponse({
        statusCode: 500,
        data: JSON.stringify({
          code: 500,
          message: 'COS credentials not configured',
        }),
      }),
    ).toThrow('COS credentials not configured')
  })

  it('maps html 413 upload responses to the attachment size limit hint', () => {
    expect(() =>
      parseHealthAttachmentUploadResponse({
        statusCode: 413,
        data: '<html><body><h1>413 Request Entity Too Large</h1></body></html>',
      }),
    ).toThrow('服务器当前上传上限过小，请联系管理员调整')
  })

  it('maps COS-related upload failures to a friendly localized hint', () => {
    expect(
      resolveHealthAttachmentUploadErrorMessage(new Error('COS credentials not configured')),
    ).toBe('附件上传功能暂未配置，请稍后再试')
    expect(
      resolveHealthAttachmentUploadErrorMessage(new Error('Failed to upload attachment')),
    ).toBe('附件上传功能暂未配置，请稍后再试')
    expect(
      resolveHealthAttachmentUploadErrorMessage(new Error('Failed to upload file')),
    ).toBe('附件上传功能暂未配置，请稍后再试')
    expect(
      resolveHealthAttachmentUploadErrorMessage(new Error('Failed to upload image to COS')),
    ).toBe('附件上传功能暂未配置，请稍后再试')
  })

  it('keeps meaningful validation errors for health attachments', () => {
    expect(
      resolveHealthAttachmentUploadErrorMessage(new Error('文件大小不能超过 10MB')),
    ).toBe('文件大小不能超过 10MB')
  })

  it('validates attachment selection type for PDF uploads', () => {
    expect(resolveHealthAttachmentSelectionError('pdf', 'report.pdf')).toBeNull()
    expect(resolveHealthAttachmentSelectionError('pdf', 'photo.png')).toBe('请选择 PDF 文件')
  })

  it('rejects files larger than the supported upload size', () => {
    expect(resolveHealthAttachmentFileSizeError(10 * 1024 * 1024)).toBeNull()
    expect(resolveHealthAttachmentFileSizeError(10 * 1024 * 1024 + 1)).toBe(
      '单个附件不能超过 10MB',
    )
  })

  it('reads file size from the mini program file API when selection result omits size', async () => {
    const getFileInfo = vi.fn(({ filePath, success }: any) => {
      expect(filePath).toBe('/tmp/health-record.jpg')
      success({ size: 1024 * 1024 + 128 })
    })

    vi.stubGlobal('uni', {
      getFileInfo,
    })

    await expect(readHealthAttachmentFileSize('/tmp/health-record.jpg')).resolves.toBe(
      1024 * 1024 + 128,
    )
  })

  it('returns null when file size cannot be resolved from the mini program file API', async () => {
    const getFileInfo = vi.fn(({ fail }: any) => {
      fail(new Error('not found'))
    })

    vi.stubGlobal('uni', {
      getFileInfo,
    })

    await expect(readHealthAttachmentFileSize('/tmp/missing-health-record.jpg')).resolves.toBeNull()
  })

  it('builds a clearer attachment hint with preview and size guidance', () => {
    expect(buildHealthAttachmentFieldHint()).toBe(
      '支持 JPG、PNG、GIF、WEBP、HEIC、HEIF 或 PDF，单个文件不超过 10MB，上传后可点击预览。',
    )
  })

  it('detects preview type from attachment urls', () => {
    expect(resolveHealthAttachmentPreviewType('https://cdn.example.com/a.pdf')).toBe('pdf')
    expect(resolveHealthAttachmentPreviewType('https://cdn.example.com/a.png')).toBe('image')
    expect(resolveHealthAttachmentPreviewType('https://cdn.example.com/a.bin')).toBe('file')
  })

  it('builds clear clickable display metadata for uploaded attachments', () => {
    expect(
      buildHealthAttachmentDisplayMeta(
        'https://cdn.example.com/health/%E4%BD%93%E6%A3%80%E6%8A%A5%E5%91%8A.pdf',
        0,
      ),
    ).toEqual({
      title: 'PDF 附件 1',
      detail: '体检报告.pdf · 点击预览',
    })

    expect(
      buildHealthAttachmentDisplayMeta('https://cdn.example.com/health/image.png', 1),
    ).toEqual({
      title: '图片附件 2',
      detail: 'image.png · 点击预览',
    })
  })

  it('shows attachment count in collapsed health record summaries', () => {
    expect(
      buildHealthRecordSummary('medical', {
        chiefComplaint: '胃炎',
        visitDate: '2026-04-07',
        diagnosis: '',
        attachments: [
          'https://cdn.example.com/health/a.png',
          'https://cdn.example.com/health/b.pdf',
        ],
      }),
    ).toEqual({
      title: '胃炎',
      detail: '2026-04-07 · 含 2 个附件',
    })
  })

  it('uses clearer reset labels for saved and unsaved records', () => {
    expect(resolveHealthRecordSecondaryActionText(false, true)).toBe('取消新增')
    expect(resolveHealthRecordSecondaryActionText(true, true)).toBe('撤销修改')
    expect(resolveHealthRecordSecondaryActionText(true, false)).toBeNull()
  })

  it('builds a stable focus identity for records with or without persisted ids', () => {
    expect(
      buildHealthRecordFocusIdentity('medical', {
        id: 'medical-1',
        chiefComplaint: '胃炎',
        visitDate: '2026-04-07',
        diagnosis: '轻度胃炎',
      }),
    ).toBe('id:medical-1')

    expect(
      buildHealthRecordFocusIdentity('allergy', {
        allergen: '鸡肉',
        notes: '已暂停尝试',
      }),
    ).toBe('allergy:鸡肉|已暂停尝试')
  })

  it('finds the last-focused record index from its identity', () => {
    const records = [
      { id: 'medical-1', chiefComplaint: '腹泻', visitDate: '2026-04-01', diagnosis: '轻度肠胃炎' },
      { id: 'medical-2', chiefComplaint: '胃炎', visitDate: '2026-04-07', diagnosis: '轻度胃炎' },
    ]

    expect(findHealthRecordFocusIndex('medical', records, 'id:medical-2')).toBe(1)
    expect(findHealthRecordFocusIndex('medical', records, 'id:missing')).toBe(-1)
  })

  it('builds a normalized health snapshot from profile data', () => {
    expect(
      buildDogHealthStateSnapshot({
        medicalRecords: [{ chiefComplaint: '腹泻' }],
        checkupRecords: null,
        allergyRecords: undefined,
        pickyFoods: '西兰花',
      }),
    ).toEqual({
      medicalRecords: [{ chiefComplaint: '腹泻' }],
      checkupRecords: [],
      allergyRecords: [],
      pickyFoods: '西兰花',
    })
  })

  it('preserves unrelated health sections when incoming profile omits them', () => {
    expect(
      mergeDogHealthStateSnapshot(
        {
          medicalRecords: [{ chiefComplaint: '腹泻' }],
          checkupRecords: [{ checkupType: '年度体检' }],
          allergyRecords: [],
          pickyFoods: '西兰花',
        },
        {
          allergyRecords: [{ allergen: '鸡肉' }],
        },
      ),
    ).toEqual({
      medicalRecords: [{ chiefComplaint: '腹泻' }],
      checkupRecords: [{ checkupType: '年度体检' }],
      allergyRecords: [{ allergen: '鸡肉' }],
      pickyFoods: '西兰花',
    })
  })

  it('preserves cached health record sections when incoming profile returns null fields', () => {
    expect(
      mergeDogHealthStateSnapshot(
        {
          medicalRecords: [{ chiefComplaint: '腹泻' }],
          checkupRecords: [{ checkupType: '年度体检' }],
          allergyRecords: [{ allergen: '鸡肉' }],
          pickyFoods: '西兰花',
        },
        {
          medicalRecords: null,
          checkupRecords: null,
          allergyRecords: [{ allergen: '牛肉' }],
        },
      ),
    ).toEqual({
      medicalRecords: [{ chiefComplaint: '腹泻' }],
      checkupRecords: [{ checkupType: '年度体检' }],
      allergyRecords: [{ allergen: '牛肉' }],
      pickyFoods: '西兰花',
    })
  })

  it('respects explicit empty health fields from server responses', () => {
    expect(
      mergeDogHealthStateSnapshot(
        {
          medicalRecords: [{ chiefComplaint: '腹泻' }],
          checkupRecords: [{ checkupType: '年度体检' }],
          allergyRecords: [{ allergen: '鸡肉' }],
          pickyFoods: '西兰花',
        },
        {
          medicalRecords: [],
          checkupRecords: [],
          allergyRecords: [],
          pickyFoods: '',
        },
      ),
    ).toEqual({
      medicalRecords: [],
      checkupRecords: [],
      allergyRecords: [],
      pickyFoods: '',
    })
  })

  it('only enables remote health sync when a persisted dog id exists', () => {
    expect(shouldUseRemoteHealthRecordSync('')).toBe(false)
    expect(shouldUseRemoteHealthRecordSync('   ')).toBe(false)
    expect(shouldUseRemoteHealthRecordSync(null)).toBe(false)
    expect(shouldUseRemoteHealthRecordSync('dog-123')).toBe(true)
  })

  it('builds concise collapsed summaries for saved health records', () => {
    expect(
      buildHealthRecordSummary('medical', {
        chiefComplaint: '腹泻',
        visitDate: '2026-04-07',
        diagnosis: '急性肠胃炎',
      }),
    ).toEqual({
      title: '腹泻',
      detail: '2026-04-07 · 急性肠胃炎',
    })

    expect(
      buildHealthRecordSummary('checkup', {
        checkupType: 'ROUTINE',
        checkupDate: '2026-04-01',
      }),
    ).toEqual({
      title: '常规体检',
      detail: '2026-04-01',
    })

    expect(
      buildHealthRecordSummary('allergy', {
        allergen: '鸡肉',
        notes: '食用后腹泻',
      }),
    ).toEqual({
      title: '鸡肉',
      detail: '食用后腹泻',
    })
  })
})

/**
 * 识别失败文案（2026-10-01）。
 *
 * 病根：识别走腾讯云 OCR，它自己的报错会被后端原样抛出来 ——
 * 服务没开通时是「服务未开通，请前往控制台开通相应服务」，
 * 弹给顾客只会让人一头雾水。这里锁住"基础设施类报错必须换成顾客能懂的话"。
 */
describe('识别失败文案', () => {
  it('腾讯云"服务未开通"换成能懂的话，且给出下一步', () => {
    expect(
      resolveHealthScanErrorMessage('服务未开通，请前往控制台开通相应服务'),
    ).toContain('手动填写')
    expect(resolveHealthScanErrorMessage('FailedOperation.UnOpenError')).toContain('手动填写')
  })

  it('密钥没配 / 鉴权失败同样归到"功能还没准备好"', () => {
    expect(resolveHealthScanErrorMessage('腾讯云 OCR 密钥未配置')).toContain('正在开通中')
    expect(resolveHealthScanErrorMessage('AuthFailure.SignatureFailure')).toContain('正在开通中')
  })

  it('频率超限让顾客稍后再试', () => {
    expect(resolveHealthScanErrorMessage('RequestLimitExceeded')).toContain('稍等')
  })

  it('超时提示可以再试一次', () => {
    expect(resolveHealthScanErrorMessage('request timeout')).toContain('再试一次')
  })

  it('后端本来就说给顾客听的话照原样显示', () => {
    const friendly = '没识别到内容，请换一张更清晰的图片'
    expect(resolveHealthScanErrorMessage(friendly)).toBe(friendly)
  })

  it('没有报错信息时给一句兜底，而不是空字符串', () => {
    expect(resolveHealthScanErrorMessage('')).toContain('手工填写')
    expect(resolveHealthScanErrorMessage(undefined)).toContain('手工填写')
  })
})

/**
 * 一次选多张图 → 合成一条记录（2026-10-01 第九期）。
 *
 * 老板定的规则：一次选中的多张图当成同一份资料。
 * 一份 3 页的体检报告 = 1 条记录 + 3 张原图，不是 3 条各说一半的记录。
 * 疫苗本不走这里（一张本子是好几针，合并会把几针并成一针）。
 */
describe('多页报告合成一条记录', () => {
  const IMG_1 = 'https://img.sevenkitchen.cloud/health/page-1.jpg'
  const IMG_2 = 'https://img.sevenkitchen.cloud/health/page-2.jpg'
  const IMG_3 = 'https://img.sevenkitchen.cloud/health/page-3.jpg'

  it('没有草稿时返回空数组，不炸', () => {
    expect(mergeScannedReportDrafts([])).toEqual([])
    expect(mergeScannedReportDrafts(null)).toEqual([])
    expect(mergeScannedReportDrafts(undefined)).toEqual([])
  })

  it('只有一张时原样返回（也补上 attachments 字段）', () => {
    const merged = mergeScannedReportDrafts([
      { checkupDate: '2026-09-01', findings: '未见异常', attachments: [IMG_1] },
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].findings).toBe('未见异常')
    expect(merged[0].attachments).toEqual([IMG_1])
  })

  it('三页体检报告 → 一条记录，三段内容各归各位', () => {
    const merged = mergeScannedReportDrafts([
      { checkupDate: '2026-09-01', checkupType: 'ROUTINE', findings: '血常规正常', attachments: [IMG_1] },
      { checkupDate: '', checkupType: '', findings: '生化轻度升高', recommendations: '两周后复查', attachments: [IMG_2] },
      { checkupDate: '', checkupType: '', notes: '医生说注意饮水', attachments: [IMG_3] },
    ])

    expect(merged).toHaveLength(1)
    expect(merged[0].checkupDate).toBe('2026-09-01')
    expect(merged[0].checkupType).toBe('ROUTINE')
    expect(merged[0].findings).toBe('血常规正常\n生化轻度升高')
    expect(merged[0].recommendations).toBe('两周后复查')
    expect(merged[0].notes).toBe('医生说注意饮水')
  })

  it('三页的原图全部留下，按页序、不重复', () => {
    const merged = mergeScannedReportDrafts([
      { findings: 'A', attachments: [IMG_1] },
      { findings: 'B', attachments: [IMG_2] },
      // 同一页被选两次（或两页指向同一张图）只留一份
      { findings: 'C', attachments: [IMG_2, IMG_3] },
    ])

    expect(merged[0].attachments).toEqual([IMG_1, IMG_2, IMG_3])
  })

  it('日期、类型、兽医这类"只有一个答案"的字段以第一页为准，不被后面的页覆盖', () => {
    const merged = mergeScannedReportDrafts([
      { visitDate: '2026-09-01', veterinarian: '王医生', diagnosis: '肠胃炎', attachments: [] },
      { visitDate: '2026-09-02', veterinarian: '李医生', diagnosis: '', attachments: [] },
    ])

    expect(merged[0].visitDate).toBe('2026-09-01')
    expect(merged[0].veterinarian).toBe('王医生')
  })

  it('第一页没读到的字段用后面的页补上', () => {
    const merged = mergeScannedReportDrafts([
      { visitDate: '', diagnosis: '', chiefComplaint: '呕吐', attachments: [] },
      { visitDate: '2026-09-03', diagnosis: '急性胃炎', chiefComplaint: '', attachments: [] },
    ])

    expect(merged[0].visitDate).toBe('2026-09-03')
    expect(merged[0].diagnosis).toBe('急性胃炎')
    expect(merged[0].chiefComplaint).toBe('呕吐')
  })

  it('两页写着同一句话时不重复抄（双面扫描、复印件很常见）', () => {
    const merged = mergeScannedReportDrafts([
      { findings: '未见明显异常', attachments: [] },
      { findings: '未见明显异常', attachments: [] },
    ])

    expect(merged[0].findings).toBe('未见明显异常')
  })

  it('用药清单去重合并（数组字段）', () => {
    const merged = mergeScannedReportDrafts([
      { medications: ['阿莫西林'], attachments: [] },
      { medications: ['阿莫西林', '益生菌'], attachments: [] },
    ])

    expect(merged[0].medications).toEqual(['阿莫西林', '益生菌'])
  })

  it('不制造空值：缺少的字段留空数组/空串，不返回 undefined', () => {
    const merged = mergeScannedReportDrafts([
      { findings: 'A', attachments: [] },
      { findings: 'B', attachments: [] },
    ])

    expect(Array.isArray(merged[0].attachments)).toBe(true)
    expect(merged[0].attachments).toEqual([])
  })

  it('不丢掉身份类字段（状态、本地 key）', () => {
    const merged = mergeScannedReportDrafts([
      { status: 'PENDING_CONFIRMATION', findings: 'A', attachments: [] },
      { findings: 'B', attachments: [] },
    ])

    expect(merged[0].status).toBe('PENDING_CONFIRMATION')
  })
})
