import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  CreateMedicalRecordDto,
  MedicalStatus,
} from '../../../src/interfaces/dto/health/create-medical-record.dto';
import { UpdateMedicalRecordDto } from '../../../src/interfaces/dto/health/update-medical-record.dto';
import { CreateCheckupDto } from '../../../src/interfaces/dto/health/create-checkup.dto';

/**
 * 病史 / 体检 DTO 回归测试。
 *
 * 为什么补这组：2026-09-28 给数据库的 MedicalStatus 加了 PENDING_CONFIRMATION
 * （顾客自述的疾病不再被系统臆断为慢性），但 DTO 里的枚举一直没同步。
 * 而小程序保存新病史时**默认就是这个状态** —— 于是"新增一条病史、不动状态
 * 直接保存"会被后端拒掉。这条链路上一个测试都没有，所以几个月没人发现。
 */
describe('health record DTOs', () => {
  describe('CreateMedicalRecordDto 的状态枚举', () => {
    const base = {
      visitDate: '2026-10-01',
      chiefComplaint: '呕吐两次',
      diagnosis: '急性胃炎',
    };

    function validate(payload: Record<string, unknown>) {
      const dto = plainToInstance(CreateMedicalRecordDto, payload);
      return validateSync(dto as object, { whitelist: true });
    }

    it('DTO 枚举与数据库保持一致，包含 PENDING_CONFIRMATION', () => {
      expect(Object.values(MedicalStatus).sort()).toEqual(
        ['CHRONIC', 'PENDING_CONFIRMATION', 'RECOVERED', 'TREATING'].sort(),
      );
    });

    // 这条就是那个线上缺陷：小程序新增病史的默认状态，必须能通过校验
    it('小程序默认状态「待确认」可以通过校验（回归）', () => {
      const errors = validate({ ...base, status: 'PENDING_CONFIRMATION' });
      expect(errors).toEqual([]);
    });

    it('其余三个状态也都通过', () => {
      for (const status of ['TREATING', 'RECOVERED', 'CHRONIC']) {
        expect(validate({ ...base, status })).toEqual([]);
      }
    });

    it('不传状态时通过（由数据库给默认值）', () => {
      expect(validate(base)).toEqual([]);
    });

    it('非法状态仍然被拒绝', () => {
      const errors = validate({ ...base, status: 'NOT_A_STATUS' });
      expect(errors.map((error) => error.property)).toEqual(['status']);
    });
  });

  describe('UpdateMedicalRecordDto', () => {
    it('复用同一套状态枚举，同样接受「待确认」', () => {
      const dto = plainToInstance(UpdateMedicalRecordDto, {
        status: 'PENDING_CONFIRMATION',
      });
      expect(validateSync(dto as object, { whitelist: true })).toEqual([]);
    });
  });

  describe('CreateCheckupDto', () => {
    it('接受体检的检查结论 / 医生建议 / 兽医（合并病历表单要发这三个字段）', () => {
      const dto = plainToInstance(CreateCheckupDto, {
        checkupType: 'ROUTINE',
        checkupDate: '2026-10-01',
        findings: '血常规未见明显异常',
        recommendations: '半年后复查',
        veterinarian: '张医生',
        attachments: ['report.jpg'],
      });
      expect(validateSync(dto as object, { whitelist: true })).toEqual([]);
    });

    it('检查结论落在 findings 上（小程序内部叫 notes，保存时要改名）', () => {
      const dto = plainToInstance(CreateCheckupDto, {
        checkupType: 'ROUTINE',
        checkupDate: '2026-10-01',
        findings: '未见异常',
        notes: '这个字段后端不收',
      });
      const validated = validateSync(dto as object, { whitelist: true });
      expect(validated).toEqual([]);
      // whitelist 会把 DTO 里没有的 notes 剥掉
      expect((dto as Record<string, unknown>).notes).toBeUndefined();
      expect((dto as Record<string, unknown>).findings).toBe('未见异常');
    });
  });
});
