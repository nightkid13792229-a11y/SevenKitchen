/**
 * Health Tag Mapping Service
 * Maps legacy enum values to RecipeHealthTag UUIDs
 */

import { Injectable } from '@nestjs/common';
import { RecipeHealthTag } from '@prisma/client';

@Injectable()
export class HealthTagMappingService {
  // Mapping from legacy enum values to new UUIDs
  private readonly enumToUuidMap: Record<string, string> = {
    'HEALTHY': '00000000-0000-0000-0000-000000000001',
    'PICKY_EATER': '00000000-0000-0000-0000-000000000002',
    'SENSITIVE_STOMACH': '00000000-0000-0000-0000-000000000003',
    'PANCREATITIS_SUPPORT': '00000000-0000-0000-0000-000000000004',
    'LOW_FAT': '00000000-0000-0000-0000-000000000005',
    'SKIN_COAT_CARE': '00000000-0000-0000-0000-000000000006',
  };

  // Reverse mapping from UUID to enum
  private readonly uuidToEnumMap: Record<string, string> = {};

  constructor() {
    // Build reverse mapping
    Object.entries(this.enumToUuidMap).forEach(([enumVal, uuid]) => {
      this.uuidToEnumMap[uuid] = enumVal;
    });
  }

  /**
   * Convert legacy enum value to UUID
   */
  enumToUuid(enumValue: string): string | null {
    return this.enumToUuidMap[enumValue] || null;
  }

  /**
   * Convert UUID to legacy enum value
   */
  uuidToEnum(uuid: string): string | null {
    return this.uuidToEnumMap[uuid] || null;
  }

  /**
   * Check if a value is a legacy enum
   */
  isLegacyEnum(value: string): boolean {
    return value in this.enumToUuidMap;
  }

  /**
   * Get all mapped UUIDs
   */
  getAllUuids(): string[] {
    return Object.values(this.enumToUuidMap);
  }

  /**
   * Convert array of legacy enums to array of UUIDs
   */
  enumsToUuids(enumValues: string[]): string[] {
    return enumValues
      .map(enumVal => this.enumToUuid(enumVal))
      .filter((uuid): uuid is string => uuid !== null);
  }

  /**
   * Convert array of UUIDs to array of legacy enums
   */
  uuidsToEnums(uuids: string[]): string[] {
    return uuids
      .map(uuid => this.uuidToEnum(uuid))
      .filter((enumVal): enumVal is string => enumVal !== null);
  }
}
