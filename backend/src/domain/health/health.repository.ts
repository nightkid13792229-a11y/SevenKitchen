/**
 * Health Record Repository Interfaces
 * Domain layer repository interfaces (no Prisma dependency)
 */

import type { AllergyCertainty } from '@prisma/client';

// Vaccine Record
export interface VaccineRecord {
  id: string;
  dogId: string;
  vaccineName: string;
  vaccinationDate: Date;
  nextDueDate: Date | null;
  notes: string | null;
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE';
  /// 报告原件（2026-10-01 新增）：拍疫苗本识别时存下的原图 URL 数组
  attachments: string[];
  /// 归成的疫苗类别（2026-10-05）：core / rabies / lepto / other，可多值。
  /// 空数组 = 老记录，读时按名字兼容推导。
  kinds: string[];
  /** 这一针含哪些病种（2026-10-06）—— 类别由它推导 */
  components: string[];
  /**
   * 产品名有没有被人工核对过（2026-10-09 安全默认值）。
   *
   * true（默认）= 算数；false = **不算进计划**，直到顾客点「我已对照本子核对」。
   * 理由见 prisma schema 里的注释：错算成"没打"只是多提醒一次，
   * 错算成"打了"会让狗真的漏打 ✗✗。
   */
  productVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface VaccineRecordRepository {
  findById(id: string): Promise<VaccineRecord | null>;
  findByDogId(dogId: string): Promise<VaccineRecord[]>;
  create(
    data: Omit<VaccineRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<VaccineRecord>;
  update(
    id: string,
    data: Partial<
      Omit<VaccineRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<VaccineRecord>;
  delete(id: string): Promise<void>;
  findUpcoming(dogId: string, days: number): Promise<VaccineRecord[]>;
}

// Checkup Record
export interface CheckupRecord {
  id: string;
  dogId: string;
  checkupType: string;
  checkupDate: Date;
  findings: string | null;
  /** 化验数据原文（逐项一行），2026-10-02 新增 */
  labValues: string | null;
  recommendations: string | null;
  /// 备注；2026-10-01 第五期新增（此前只有病史表有 notes）
  notes: string | null;
  veterinarian: string | null;
  attachments: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CheckupRecordRepository {
  findById(id: string): Promise<CheckupRecord | null>;
  findByDogId(dogId: string): Promise<CheckupRecord[]>;
  create(
    data: Omit<CheckupRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<CheckupRecord>;
  update(
    id: string,
    data: Partial<
      Omit<CheckupRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<CheckupRecord>;
  delete(id: string): Promise<void>;
}

// Medical Record
export interface MedicalRecord {
  id: string;
  dogId: string;
  visitDate: Date;
  chiefComplaint: string;
  diagnosis: string;
  /** 化验数据原文（这次就诊做的化验），2026-10-02 新增 */
  labValues: string | null;
  treatment: string | null;
  /** 这次做的检查（2026-10-02） */
  exams: string | null;
  /** 体征：体温、体重、BCS（2026-10-02） */
  vitals: string | null;
  medications: string[];
  /**
   * 病史状态。
   *
   * ⚠️ 必须与 Prisma 的 MedicalStatus 枚举保持一致。
   * 2026-10-01 修复：PENDING_CONFIRMATION（待确认）早在 2026-09-28 就加进了
   * 数据库（顾客自述的疾病不再被系统臆断为慢性），但这一行和 DTO 的枚举
   * 一直没同步 —— 于是"新增一条病史、不动状态下拉直接保存"整条链路都存不进去。
   */
  status: 'PENDING_CONFIRMATION' | 'TREATING' | 'RECOVERED' | 'CHRONIC';
  followUpDate: Date | null;
  veterinarian: string | null;
  notes: string | null;
  attachments: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MedicalRecordRepository {
  findById(id: string): Promise<MedicalRecord | null>;
  findByDogId(dogId: string): Promise<MedicalRecord[]>;
  findByStatus(dogId: string, status: string): Promise<MedicalRecord[]>;
  create(
    data: Omit<MedicalRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<MedicalRecord>;
  update(
    id: string,
    data: Partial<
      Omit<MedicalRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<MedicalRecord>;
  delete(id: string): Promise<void>;
}

// Allergy Record
export interface AllergyRecord {
  id: string;
  dogId: string;
  allergen: string;
  notes: string | null;
  /**
   * 可信度（2026-10-04 第一期）。
   * 确诊（CONFIRMED）的过敏原会让含它的食谱**直接不进推荐**；
   * 可疑 / 待排查保留但重罚；已排除（RULED_OUT）不再避开。
   */
  certainty: AllergyCertainty;
  /** 来源：REPORT / OWNER / STAFF / ORDER / PLAN */
  source: string;
  attachments: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AllergyRecordRepository {
  findById(id: string): Promise<AllergyRecord | null>;
  findByDogId(dogId: string): Promise<AllergyRecord[]>;
  create(
    data: Omit<AllergyRecord, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AllergyRecord>;
  update(
    id: string,
    data: Partial<
      Omit<AllergyRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>
    >,
  ): Promise<AllergyRecord>;
  delete(id: string): Promise<void>;
}
