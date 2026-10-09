import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  VaccineRecordRepository,
  VaccineRecord,
  CheckupRecordRepository,
  CheckupRecord,
  MedicalRecordRepository,
  MedicalRecord,
  AllergyRecordRepository,
  AllergyRecord,
} from '../../domain/health/health.repository';
import { PrismaService } from '../prisma.service';

@Injectable()
export class PrismaVaccineRecordRepository implements VaccineRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<VaccineRecord | null> {
    const record = await this.prisma.vaccineRecord.findUnique({
      where: { id },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findByDogId(dogId: string): Promise<VaccineRecord[]> {
    const records = await this.prisma.vaccineRecord.findMany({
      where: { dogId },
      orderBy: { vaccinationDate: 'desc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async create(
    data: Omit<VaccineRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<VaccineRecord> {
    const record = await this.prisma.vaccineRecord.create({
      data: {
        dogId: data.dogId,
        vaccineName: data.vaccineName,
        vaccinationDate: data.vaccinationDate,
        nextDueDate: data.nextDueDate,
        notes: data.notes,
        status: data.status as any,
        attachments: data.attachments,
        kinds: data.kinds,
        components: data.components,
      },
    });
    return this.mapToDomain(record);
  }

  async update(
    id: string,
    data: Partial<
      Omit<VaccineRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<VaccineRecord> {
    const record = await this.prisma.vaccineRecord.update({
      where: { id },
      data: {
        vaccineName: data.vaccineName,
        vaccinationDate: data.vaccinationDate,
        nextDueDate: data.nextDueDate,
        notes: data.notes,
        status: data.status as any,
        attachments: data.attachments,
        kinds: data.kinds,
        components: data.components,
      },
    });
    return this.mapToDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.vaccineRecord.delete({
      where: { id },
    });
  }

  async findUpcoming(dogId: string, days: number): Promise<VaccineRecord[]> {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    const records = await this.prisma.vaccineRecord.findMany({
      where: {
        dogId,
        nextDueDate: {
          gte: today,
          lte: futureDate,
        },
      },
      orderBy: { nextDueDate: 'asc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  private mapToDomain(
    record: Prisma.VaccineRecordGetPayload<{}>,
  ): VaccineRecord {
    return {
      id: record.id,
      dogId: record.dogId,
      vaccineName: record.vaccineName,
      vaccinationDate: record.vaccinationDate,
      nextDueDate: record.nextDueDate,
      notes: record.notes,
      status: record.status as any,
      attachments: record.attachments,
      kinds: record.kinds,
      components: record.components ?? [],
      // 2026-10-09 安全默认值：迁移前的行读到 undefined 也算 true ✓
      productVerified: (record as { productVerified?: boolean }).productVerified !== false,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

@Injectable()
export class PrismaCheckupRecordRepository implements CheckupRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CheckupRecord | null> {
    const record = await this.prisma.checkupRecord.findUnique({
      where: { id },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findByDogId(dogId: string): Promise<CheckupRecord[]> {
    const records = await this.prisma.checkupRecord.findMany({
      where: { dogId },
      orderBy: { checkupDate: 'desc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async create(
    data: Omit<CheckupRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CheckupRecord> {
    const record = await this.prisma.checkupRecord.create({
      data: {
        dogId: data.dogId,
        checkupType: data.checkupType,
        checkupDate: data.checkupDate,
        findings: data.findings,
        labValues: data.labValues,
        recommendations: data.recommendations,
        veterinarian: data.veterinarian,
        attachments: data.attachments,
      },
    });
    return this.mapToDomain(record);
  }

  async update(
    id: string,
    data: Partial<
      Omit<CheckupRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<CheckupRecord> {
    const record = await this.prisma.checkupRecord.update({
      where: { id },
      data: {
        checkupType: data.checkupType,
        checkupDate: data.checkupDate,
        findings: data.findings,
        labValues: data.labValues,
        recommendations: data.recommendations,
        veterinarian: data.veterinarian,
        attachments: data.attachments,
      },
    });
    return this.mapToDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.checkupRecord.delete({
      where: { id },
    });
  }

  private mapToDomain(
    record: Prisma.CheckupRecordGetPayload<{}>,
  ): CheckupRecord {
    return {
      id: record.id,
      dogId: record.dogId,
      checkupType: record.checkupType,
      checkupDate: record.checkupDate,
      findings: record.findings,
      labValues: record.labValues,
      recommendations: record.recommendations,
      notes: record.notes,
      veterinarian: record.veterinarian,
      attachments: record.attachments,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

@Injectable()
export class PrismaMedicalRecordRepository implements MedicalRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<MedicalRecord | null> {
    const record = await this.prisma.medicalRecord.findUnique({
      where: { id },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findByDogId(dogId: string): Promise<MedicalRecord[]> {
    const records = await this.prisma.medicalRecord.findMany({
      where: { dogId },
      orderBy: { visitDate: 'desc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async findByStatus(dogId: string, status: string): Promise<MedicalRecord[]> {
    const records = await this.prisma.medicalRecord.findMany({
      where: {
        dogId,
        status: status as any,
      },
      orderBy: { visitDate: 'desc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async create(
    data: Omit<MedicalRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<MedicalRecord> {
    const record = await this.prisma.medicalRecord.create({
      data: {
        dogId: data.dogId,
        visitDate: data.visitDate,
        chiefComplaint: data.chiefComplaint,
        diagnosis: data.diagnosis,
        labValues: data.labValues,
        treatment: data.treatment,
        exams: data.exams,
        vitals: data.vitals,
        medications: data.medications,
        status: data.status as any,
        followUpDate: data.followUpDate,
        veterinarian: data.veterinarian,
        notes: data.notes,
        attachments: data.attachments || [],
      },
    });
    return this.mapToDomain(record);
  }

  async update(
    id: string,
    data: Partial<
      Omit<MedicalRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<MedicalRecord> {
    const record = await this.prisma.medicalRecord.update({
      where: { id },
      data: {
        visitDate: data.visitDate,
        chiefComplaint: data.chiefComplaint,
        diagnosis: data.diagnosis,
        labValues: data.labValues,
        treatment: data.treatment,
        exams: data.exams,
        vitals: data.vitals,
        medications: data.medications,
        status: data.status as any,
        followUpDate: data.followUpDate,
        veterinarian: data.veterinarian,
        notes: data.notes,
        attachments: data.attachments,
      },
    });
    return this.mapToDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.medicalRecord.delete({
      where: { id },
    });
  }

  private mapToDomain(
    record: Prisma.MedicalRecordGetPayload<{}>,
  ): MedicalRecord {
    return {
      id: record.id,
      dogId: record.dogId,
      visitDate: record.visitDate,
      chiefComplaint: record.chiefComplaint,
      diagnosis: record.diagnosis,
      labValues: record.labValues,
      treatment: record.treatment,
      exams: record.exams,
      vitals: record.vitals,
      medications: record.medications,
      status: record.status as any,
      followUpDate: record.followUpDate,
      veterinarian: record.veterinarian,
      notes: record.notes,
      attachments: record.attachments || [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

@Injectable()
export class PrismaAllergyRecordRepository implements AllergyRecordRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<AllergyRecord | null> {
    const record = await this.prisma.allergyRecord.findUnique({
      where: { id },
    });
    return record ? this.mapToDomain(record) : null;
  }

  async findByDogId(dogId: string): Promise<AllergyRecord[]> {
    const records = await this.prisma.allergyRecord.findMany({
      where: { dogId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map((r) => this.mapToDomain(r));
  }

  async create(
    data: Omit<AllergyRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AllergyRecord> {
    const record = await this.prisma.allergyRecord.create({
      data: {
        dogId: data.dogId,
        allergen: data.allergen,
        notes: data.notes,
        certainty: data.certainty,
        source: data.source,
        attachments: data.attachments,
      },
    });
    return this.mapToDomain(record);
  }

  async update(
    id: string,
    data: Partial<
      Omit<AllergyRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<AllergyRecord> {
    const record = await this.prisma.allergyRecord.update({
      where: { id },
      data: {
        allergen: data.allergen,
        notes: data.notes,
        certainty: data.certainty,
        source: data.source,
        attachments: data.attachments,
      },
    });
    return this.mapToDomain(record);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.allergyRecord.delete({
      where: { id },
    });
  }

  private mapToDomain(
    record: Prisma.AllergyRecordGetPayload<{}>,
  ): AllergyRecord {
    return {
      id: record.id,
      dogId: record.dogId,
      allergen: record.allergen,
      notes: record.notes,
      certainty: record.certainty,
      source: record.source,
      attachments: record.attachments || [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
