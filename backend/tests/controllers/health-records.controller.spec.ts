import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateCheckupDto } from '../../src/interfaces/dto/health/create-checkup.dto';
import { UpdateCheckupDto } from '../../src/interfaces/dto/health/update-checkup.dto';
import { UpdateMedicalRecordDto } from '../../src/interfaces/dto/health/update-medical-record.dto';
import { MedicalRecordResponseDto } from '../../src/interfaces/dto/health/medical-record-response.dto';

describe('Health record DTO compatibility', () => {
  it('accepts free-text checkup types on create and update', async () => {
    const createDto = plainToInstance(CreateCheckupDto, {
      checkupType: '牙齿复查',
      checkupDate: '2026-04-27',
      findings: '牙龈状态稳定',
    });
    const updateDto = plainToInstance(UpdateCheckupDto, {
      checkupType: '术后复查',
    });

    await expect(validate(createDto)).resolves.toHaveLength(0);
    await expect(validate(updateDto)).resolves.toHaveLength(0);
  });

  it('accepts medical attachments on update DTO', async () => {
    const dto = plainToInstance(UpdateMedicalRecordDto, {
      attachments: ['https://cdn.example.com/medical-records/report.pdf'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('exposes medical attachments in response DTO', () => {
    const dto = plainToInstance(
      MedicalRecordResponseDto,
      {
        id: 'medical-1',
        dogId: 'dog-1',
        visitDate: new Date('2026-04-27T00:00:00.000Z'),
        chiefComplaint: '急性胰腺炎',
        diagnosis: '急性胰腺炎',
        treatment: null,
        medications: [],
        status: 'TREATING',
        followUpDate: null,
        veterinarian: null,
        notes: '补充说明',
        attachments: ['https://cdn.example.com/medical-records/report.pdf'],
        createdAt: new Date('2026-04-27T00:00:00.000Z'),
        updatedAt: new Date('2026-04-27T00:00:00.000Z'),
      },
      { excludeExtraneousValues: true },
    );

    expect(dto.attachments).toEqual([
      'https://cdn.example.com/medical-records/report.pdf',
    ]);
  });
});
