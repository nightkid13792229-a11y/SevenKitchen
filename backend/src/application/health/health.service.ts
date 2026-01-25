import { Injectable, NotFoundException, ForbiddenException, Inject } from '@nestjs/common'
import { plainToInstance } from 'class-transformer'
import {
  PrismaVaccineRecordRepository,
  PrismaCheckupRecordRepository,
  PrismaMedicalRecordRepository,
  PrismaAllergyRecordRepository
} from '../../infrastructure/repositories/prisma-health.repository'
import {
  VaccineRecordResponseDto,
  VaccineRecordListResponseDto
} from '../../interfaces/dto/health/vaccine-response.dto'
import {
  CheckupRecordResponseDto,
  CheckupRecordListResponseDto
} from '../../interfaces/dto/health/checkup-response.dto'
import {
  MedicalRecordResponseDto,
  MedicalRecordListResponseDto
} from '../../interfaces/dto/health/medical-record-response.dto'
import {
  AllergyRecordResponseDto,
  AllergyRecordListResponseDto
} from '../../interfaces/dto/health/allergy-response.dto'
import { CreateVaccineDto } from '../../interfaces/dto/health/create-vaccine.dto'
import { UpdateVaccineDto } from '../../interfaces/dto/health/update-vaccine.dto'
import { CreateCheckupDto } from '../../interfaces/dto/health/create-checkup.dto'
import { UpdateCheckupDto } from '../../interfaces/dto/health/update-checkup.dto'
import { CreateMedicalRecordDto } from '../../interfaces/dto/health/create-medical-record.dto'
import { UpdateMedicalRecordDto } from '../../interfaces/dto/health/update-medical-record.dto'
import { CreateAllergyDto } from '../../interfaces/dto/health/create-allergy.dto'
import { UpdateAllergyDto } from '../../interfaces/dto/health/update-allergy.dto'
import { PrismaDogRepository } from '../../infrastructure/repositories/prisma-dog.repository'
import { DOG_REPOSITORY } from '../dog/dog.service'

// Repository tokens
export const VACCINE_RECORD_REPOSITORY = 'VACCINE_RECORD_REPOSITORY'
export const CHECKUP_RECORD_REPOSITORY = 'CHECKUP_RECORD_REPOSITORY'
export const MEDICAL_RECORD_REPOSITORY = 'MEDICAL_RECORD_REPOSITORY'
export const ALLERGY_RECORD_REPOSITORY = 'ALLERGY_RECORD_REPOSITORY'

@Injectable()
export class HealthService {
  constructor(
    @Inject(VACCINE_RECORD_REPOSITORY)
    private readonly vaccineRecordRepo: PrismaVaccineRecordRepository,
    @Inject(CHECKUP_RECORD_REPOSITORY)
    private readonly checkupRecordRepo: PrismaCheckupRecordRepository,
    @Inject(MEDICAL_RECORD_REPOSITORY)
    private readonly medicalRecordRepo: PrismaMedicalRecordRepository,
    @Inject(ALLERGY_RECORD_REPOSITORY)
    private readonly allergyRecordRepo: PrismaAllergyRecordRepository,
    @Inject(DOG_REPOSITORY)
    private readonly dogRepo: PrismaDogRepository
  ) {}

  // ==================== Vaccine Records ====================

  async createVaccineRecord(
    customerId: string,
    dto: CreateVaccineDto & { dogId: string }
  ): Promise<VaccineRecordResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId)

    const record = await this.vaccineRecordRepo.create({
      dogId: dto.dogId,
      vaccineName: dto.vaccineName,
      vaccinationDate: new Date(dto.vaccinationDate),
      nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
      notes: dto.notes ?? null,
      status: dto.status || 'COMPLETED'
    })

    return this.mapVaccineRecordToDto(record)
  }

  async getVaccineRecords(dogId: string, customerId: string): Promise<VaccineRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId)

    const records = await this.vaccineRecordRepo.findByDogId(dogId)

    return {
      total: records.length,
      records: records.map(r => this.mapVaccineRecordToDto(r))
    }
  }

  async getVaccineRecord(id: string, customerId: string): Promise<VaccineRecordResponseDto> {
    const record = await this.vaccineRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Vaccine record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    return this.mapVaccineRecordToDto(record)
  }

  async updateVaccineRecord(
    id: string,
    customerId: string,
    dto: UpdateVaccineDto
  ): Promise<VaccineRecordResponseDto> {
    const record = await this.vaccineRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Vaccine record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    const updated = await this.vaccineRecordRepo.update(id, {
      vaccineName: dto.vaccineName ?? undefined,
      vaccinationDate: dto.vaccinationDate ? new Date(dto.vaccinationDate) : undefined,
      nextDueDate: dto.nextDueDate ? new Date(dto.nextDueDate) : null,
      notes: dto.notes ?? null,
      status: dto.status ?? undefined
    })

    return this.mapVaccineRecordToDto(updated)
  }

  async deleteVaccineRecord(id: string, customerId: string): Promise<void> {
    const record = await this.vaccineRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Vaccine record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    await this.vaccineRecordRepo.delete(id)
  }

  async getUpcomingVaccines(dogId: string, customerId: string, days: number = 30): Promise<VaccineRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId)

    const records = await this.vaccineRecordRepo.findUpcoming(dogId, days)

    return {
      total: records.length,
      records: records.map(r => this.mapVaccineRecordToDto(r))
    }
  }

  // ==================== Checkup Records ====================

  async createCheckupRecord(
    customerId: string,
    dto: CreateCheckupDto & { dogId: string }
  ): Promise<CheckupRecordResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId)

    const record = await this.checkupRecordRepo.create({
      dogId: dto.dogId,
      checkupType: dto.checkupType,
      checkupDate: new Date(dto.checkupDate),
      findings: dto.findings ?? null,
      recommendations: dto.recommendations ?? null,
      veterinarian: dto.veterinarian ?? null,
      attachments: dto.attachments || []
    })

    return this.mapCheckupRecordToDto(record)
  }

  async getCheckupRecords(dogId: string, customerId: string): Promise<CheckupRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId)

    const records = await this.checkupRecordRepo.findByDogId(dogId)

    return {
      total: records.length,
      records: records.map(r => this.mapCheckupRecordToDto(r))
    }
  }

  async getCheckupRecord(id: string, customerId: string): Promise<CheckupRecordResponseDto> {
    const record = await this.checkupRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Checkup record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    return this.mapCheckupRecordToDto(record)
  }

  async updateCheckupRecord(
    id: string,
    customerId: string,
    dto: UpdateCheckupDto
  ): Promise<CheckupRecordResponseDto> {
    const record = await this.checkupRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Checkup record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    const updated = await this.checkupRecordRepo.update(id, {
      checkupType: dto.checkupType ?? undefined,
      checkupDate: dto.checkupDate ? new Date(dto.checkupDate) : undefined,
      findings: dto.findings ?? null,
      recommendations: dto.recommendations ?? null,
      veterinarian: dto.veterinarian ?? null,
      attachments: dto.attachments ?? undefined
    })

    return this.mapCheckupRecordToDto(updated)
  }

  async deleteCheckupRecord(id: string, customerId: string): Promise<void> {
    const record = await this.checkupRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Checkup record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    await this.checkupRecordRepo.delete(id)
  }

  // ==================== Medical Records ====================

  async createMedicalRecord(
    customerId: string,
    dto: CreateMedicalRecordDto & { dogId: string }
  ): Promise<MedicalRecordResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId)

    const record = await this.medicalRecordRepo.create({
      dogId: dto.dogId,
      visitDate: new Date(dto.visitDate),
      chiefComplaint: dto.chiefComplaint,
      diagnosis: dto.diagnosis,
      treatment: dto.treatment ?? null,
      medications: dto.medications || [],
      status: dto.status || 'TREATING',
      followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
      veterinarian: dto.veterinarian ?? null,
      notes: dto.notes ?? null,
      attachments: dto.attachments || []
    })

    return this.mapMedicalRecordToDto(record)
  }

  async getMedicalRecords(dogId: string, customerId: string, status?: string): Promise<MedicalRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId)

    const records = status
      ? await this.medicalRecordRepo.findByStatus(dogId, status)
      : await this.medicalRecordRepo.findByDogId(dogId)

    return {
      total: records.length,
      records: records.map(r => this.mapMedicalRecordToDto(r))
    }
  }

  async getMedicalRecord(id: string, customerId: string): Promise<MedicalRecordResponseDto> {
    const record = await this.medicalRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Medical record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    return this.mapMedicalRecordToDto(record)
  }

  async updateMedicalRecord(
    id: string,
    customerId: string,
    dto: UpdateMedicalRecordDto
  ): Promise<MedicalRecordResponseDto> {
    const record = await this.medicalRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Medical record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    const updated = await this.medicalRecordRepo.update(id, {
      visitDate: dto.visitDate ? new Date(dto.visitDate) : undefined,
      chiefComplaint: dto.chiefComplaint ?? undefined,
      diagnosis: dto.diagnosis ?? undefined,
      treatment: dto.treatment ?? null,
      medications: dto.medications ?? undefined,
      status: dto.status ?? undefined,
      followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : null,
      veterinarian: dto.veterinarian ?? null,
      notes: dto.notes ?? null
    })

    return this.mapMedicalRecordToDto(updated)
  }

  async deleteMedicalRecord(id: string, customerId: string): Promise<void> {
    const record = await this.medicalRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Medical record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    await this.medicalRecordRepo.delete(id)
  }

  // ==================== Allergy Records ====================

  async createAllergyRecord(
    customerId: string,
    dto: CreateAllergyDto & { dogId: string }
  ): Promise<AllergyRecordResponseDto> {
    await this.verifyDogOwnership(dto.dogId, customerId)

    const record = await this.allergyRecordRepo.create({
      dogId: dto.dogId,
      allergen: dto.allergen,
      allergenType: dto.allergenType,
      discoveryDate: new Date(dto.discoveryDate),
      symptoms: dto.symptoms,
      severity: dto.severity || 'MILD',
      confirmedBy: dto.confirmedBy || 'VET',
      treatment: dto.treatment ?? null,
      notes: dto.notes ?? null,
      attachments: dto.attachments ?? []
    })

    return this.mapAllergyRecordToDto(record)
  }

  async getAllergyRecords(dogId: string, customerId: string): Promise<AllergyRecordListResponseDto> {
    await this.verifyDogOwnership(dogId, customerId)

    const records = await this.allergyRecordRepo.findByDogId(dogId)

    return {
      total: records.length,
      records: records.map(r => this.mapAllergyRecordToDto(r))
    }
  }

  async getAllergyRecord(id: string, customerId: string): Promise<AllergyRecordResponseDto> {
    const record = await this.allergyRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Allergy record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    return this.mapAllergyRecordToDto(record)
  }

  async updateAllergyRecord(
    id: string,
    customerId: string,
    dto: UpdateAllergyDto
  ): Promise<AllergyRecordResponseDto> {
    const record = await this.allergyRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Allergy record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    const updated = await this.allergyRecordRepo.update(id, {
      allergen: dto.allergen ?? undefined,
      allergenType: dto.allergenType ?? undefined,
      discoveryDate: dto.discoveryDate ? new Date(dto.discoveryDate) : undefined,
      symptoms: dto.symptoms ?? undefined,
      severity: dto.severity ?? undefined,
      confirmedBy: dto.confirmedBy ?? undefined,
      treatment: dto.treatment ?? null,
      notes: dto.notes ?? null,
      attachments: dto.attachments ?? undefined
    })

    return this.mapAllergyRecordToDto(updated)
  }

  async deleteAllergyRecord(id: string, customerId: string): Promise<void> {
    const record = await this.allergyRecordRepo.findById(id)
    if (!record) {
      throw new NotFoundException('Allergy record not found')
    }

    await this.verifyDogOwnership(record.dogId, customerId)

    await this.allergyRecordRepo.delete(id)
  }

  // ==================== Helper Methods ====================

  private async verifyDogOwnership(dogId: string, customerId: string): Promise<void> {
    const dog = await this.dogRepo.findById(dogId)
    if (!dog) {
      throw new NotFoundException('Dog not found')
    }
    if (dog.ownerId !== customerId) {
      throw new ForbiddenException('Access denied')
    }
  }

  private mapVaccineRecordToDto(record: any): VaccineRecordResponseDto {
    return plainToInstance(VaccineRecordResponseDto, {
      id: record.id,
      dogId: record.dogId,
      vaccineName: record.vaccineName,
      vaccinationDate: record.vaccinationDate,
      nextDueDate: record.nextDueDate,
      notes: record.notes,
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    })
  }

  private mapCheckupRecordToDto(record: any): CheckupRecordResponseDto {
    return plainToInstance(CheckupRecordResponseDto, {
      id: record.id,
      dogId: record.dogId,
      checkupType: record.checkupType,
      checkupDate: record.checkupDate,
      weightKg: record.weightKg,
      bcsScore: record.bcsScore,
      heartRate: record.heartRate,
      temperature: record.temperature,
      findings: record.findings,
      recommendations: record.recommendations,
      veterinarian: record.veterinarian,
      attachments: record.attachments,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    })
  }

  private mapMedicalRecordToDto(record: any): MedicalRecordResponseDto {
    return plainToInstance(MedicalRecordResponseDto, {
      id: record.id,
      dogId: record.dogId,
      visitDate: record.visitDate,
      chiefComplaint: record.chiefComplaint,
      diagnosis: record.diagnosis,
      treatment: record.treatment,
      medications: record.medications,
      status: record.status,
      followUpDate: record.followUpDate,
      veterinarian: record.veterinarian,
      notes: record.notes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    })
  }

  private mapAllergyRecordToDto(record: any): AllergyRecordResponseDto {
    return plainToInstance(AllergyRecordResponseDto, {
      id: record.id,
      dogId: record.dogId,
      allergen: record.allergen,
      allergenType: record.allergenType,
      discoveryDate: record.discoveryDate,
      symptoms: record.symptoms,
      severity: record.severity,
      confirmedBy: record.confirmedBy,
      treatment: record.treatment,
      notes: record.notes,
      attachments: record.attachments || [],
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    })
  }
}
