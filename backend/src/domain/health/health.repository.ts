/**
 * Health Record Repository Interfaces
 * Domain layer repository interfaces (no Prisma dependency)
 */

// Vaccine Record
export interface VaccineRecord {
  id: string
  dogId: string
  vaccineName: string
  vaccinationDate: Date
  nextDueDate: Date | null
  notes: string | null
  status: 'COMPLETED' | 'SCHEDULED' | 'OVERDUE'
  createdAt: Date
  updatedAt: Date
}

export interface VaccineRecordRepository {
  findById(id: string): Promise<VaccineRecord | null>
  findByDogId(dogId: string): Promise<VaccineRecord[]>
  create(data: Omit<VaccineRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<VaccineRecord>
  update(id: string, data: Partial<Omit<VaccineRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>>): Promise<VaccineRecord>
  delete(id: string): Promise<void>
  findUpcoming(dogId: string, days: number): Promise<VaccineRecord[]>
}

// Checkup Record
export interface CheckupRecord {
  id: string
  dogId: string
  checkupType: string
  checkupDate: Date
  findings: string | null
  recommendations: string | null
  veterinarian: string | null
  attachments: string[]
  createdAt: Date
  updatedAt: Date
}

export interface CheckupRecordRepository {
  findById(id: string): Promise<CheckupRecord | null>
  findByDogId(dogId: string): Promise<CheckupRecord[]>
  create(data: Omit<CheckupRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<CheckupRecord>
  update(id: string, data: Partial<Omit<CheckupRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>>): Promise<CheckupRecord>
  delete(id: string): Promise<void>
}

// Medical Record
export interface MedicalRecord {
  id: string
  dogId: string
  visitDate: Date
  chiefComplaint: string
  diagnosis: string
  treatment: string | null
  medications: string[]
  status: 'TREATING' | 'RECOVERED' | 'CHRONIC'
  followUpDate: Date | null
  veterinarian: string | null
  notes: string | null
  attachments: string[]
  createdAt: Date
  updatedAt: Date
}

export interface MedicalRecordRepository {
  findById(id: string): Promise<MedicalRecord | null>
  findByDogId(dogId: string): Promise<MedicalRecord[]>
  findByStatus(dogId: string, status: string): Promise<MedicalRecord[]>
  create(data: Omit<MedicalRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<MedicalRecord>
  update(id: string, data: Partial<Omit<MedicalRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>>): Promise<MedicalRecord>
  delete(id: string): Promise<void>
}

// Allergy Record
export interface AllergyRecord {
  id: string
  dogId: string
  allergen: string
  allergenType: 'FOOD' | 'ENVIRONMENTAL' | 'MEDICATION'
  discoveryDate: Date
  symptoms: string
  severity: 'MILD' | 'MODERATE' | 'SEVERE'
  confirmedBy: 'VET' | 'OWNER'
  treatment: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface AllergyRecordRepository {
  findById(id: string): Promise<AllergyRecord | null>
  findByDogId(dogId: string): Promise<AllergyRecord[]>
  create(data: Omit<AllergyRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AllergyRecord>
  update(id: string, data: Partial<Omit<AllergyRecord, 'id' | 'dogId' | 'createdAt' | 'updatedAt'>>): Promise<AllergyRecord>
  delete(id: string): Promise<void>
}
