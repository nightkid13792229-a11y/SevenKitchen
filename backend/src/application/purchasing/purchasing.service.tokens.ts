/**
 * Purchasing Service DI Tokens
 * 采购服务依赖注入Token定义
 */

import { PurchaseListRepository } from '../../domain/purchasing/purchase-list.repository';
import { PurchaseRecordRepository } from '../../domain/purchasing/purchase-record.repository';
import { ReimbursementRepository } from '../../domain/purchasing/reimbursement.repository';

export const PURCHASE_LIST_REPOSITORY = Symbol('PurchaseListRepository');
export const PURCHASE_RECORD_REPOSITORY = Symbol('PurchaseRecordRepository');
export const REIMBURSEMENT_REPOSITORY = Symbol('ReimbursementRepository');

export const PurchasingServiceDiTokens = {
  PurchaseListRepository: PURCHASE_LIST_REPOSITORY,
  PurchaseRecordRepository: PURCHASE_RECORD_REPOSITORY,
  ReimbursementRepository: REIMBURSEMENT_REPOSITORY,
} as const;
