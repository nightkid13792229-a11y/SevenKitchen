/**
 * Breed Management Types
 * 品种管理相关类型定义
 */

import { DogSizeCategory } from './dog'

export type { DogSizeCategory } from './dog'

/**
 * 系统预定义品种
 * 对应数据库 DogBreed 表
 */
export interface DogBreed {
  id: string
  name: string
  sizeCategory: DogSizeCategory
  growthCurveType: string
  adultAgeMonths: number
  seniorAgeYears: number
  averageAdultWeightKg: number | null
  isCommon?: boolean
  createdAt: string
  updatedAt: string
}

/**
 * 品种表单数据（用于创建/编辑）
 */
export interface BreedForm {
  id?: string
  name: string
  sizeCategory: DogSizeCategory
  adultAgeMonths: number
  seniorAgeYears: number
  averageAdultWeightKg: number
  isCommon?: boolean
}

/**
 * 用户自定义品种统计
 * 从 Dog 表聚合查询得出
 */
export interface CustomBreedStats {
  breedName: string
  usageCount: number
  firstUsedAt: string
  avgWeight: number
  estimatedSizeCategory: DogSizeCategory
}

/**
 * 品种使用情况检查结果
 */
export interface BreedUsageCheck {
  count: number
  dogs: Array<{
    id: string
    name: string
    ownerId: string
  }>
}
