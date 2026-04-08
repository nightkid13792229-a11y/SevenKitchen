import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { FinanceRangeDto } from '../../interfaces/dto/finance/finance-range.dto';
import { FINANCE_EXPENSE_CATEGORY_LABELS } from './finance-categories';

type ReimbursementCustomFee = {
  amount?: number | string | null;
  category?: string | null;
};

const startOfDay = (input: Date) => {
  const result = new Date(input);
  result.setHours(0, 0, 0, 0);
  return result;
};

const endOfDay = (input: Date) => {
  const result = new Date(input);
  result.setHours(23, 59, 59, 999);
  return result;
};

const addDays = (input: Date, days: number) => {
  const result = new Date(input);
  result.setDate(result.getDate() + days);
  return result;
};

const dayDiffInclusive = (start: Date, end: Date) =>
  Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;

@Injectable()
export class FinanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveRange(range: FinanceRangeDto) {
    const now = new Date();

    if (range.preset === 'THIS_WEEK') {
      const day = now.getDay() || 7;
      const start = startOfDay(addDays(now, -day + 1));
      return {
        start,
        end: endOfDay(addDays(start, 6)),
      };
    }

    if (range.preset === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        start: startOfDay(start),
        end: endOfDay(end),
      };
    }

    return {
      start: startOfDay(now),
      end: endOfDay(now),
    };
  }

  private extractSnapshotCost(snapshot: any): number {
    if (!snapshot) return 0;
    return Number(snapshot.totalProductCost ?? snapshot.total_cost ?? 0);
  }

  private expandReimbursementExpenses(reimbursements: Array<any>) {
    return reimbursements.flatMap((item) => {
      const customFees: ReimbursementCustomFee[] = Array.isArray(item.customFees)
        ? item.customFees
        : [];
      const customFeeTotal = customFees.reduce(
        (sum: number, fee: ReimbursementCustomFee) =>
          sum + Number(fee.amount ?? 0),
        0,
      );
      const rawMaterialAmount =
        Number(item.totalActualCost) -
        Number(item.platformShippingFee ?? 0) -
        Number(item.platformPackagingFee ?? 0) -
        customFeeTotal;

      const rows = [
        {
          category: 'RAW_MATERIAL',
          amount: rawMaterialAmount > 0 ? rawMaterialAmount : 0,
        },
      ];

      if (item.platformShippingFee) {
        rows.push({
          category: 'LOGISTICS_DELIVERY',
          amount: Number(item.platformShippingFee),
        });
      }

      if (item.platformPackagingFee) {
        rows.push({
          category: 'PACKAGING_SUPPLIES',
          amount: Number(item.platformPackagingFee),
        });
      }

      for (const fee of customFees) {
        const categoryMap: Record<string, string> = {
          RENT: 'RENT',
          UTILITIES: 'UTILITIES',
          PAYROLL: 'PAYROLL',
          TOOLS: 'ADMINISTRATIVE',
          SUNDRIES: 'OTHER',
          OTHER: 'OTHER',
        };

        rows.push({
          category: categoryMap[String(fee.category ?? 'OTHER')] ?? 'OTHER',
          amount: Number(fee.amount ?? 0),
        });
      }

      return rows;
    });
  }

  private allocateExpenseBills(bills: Array<any>, start: Date, end: Date) {
    return bills.map((bill) => {
      const recognitionStart = new Date(bill.recognitionStart);
      const recognitionEnd = new Date(bill.recognitionEnd);
      const overlapStart = start > recognitionStart ? start : recognitionStart;
      const overlapEnd = end < recognitionEnd ? end : recognitionEnd;
      const totalDays = dayDiffInclusive(recognitionStart, recognitionEnd);
      const overlapDays =
        overlapStart <= overlapEnd
          ? dayDiffInclusive(overlapStart, overlapEnd)
          : 0;

      return {
        category: bill.category,
        amount:
          overlapDays > 0 ? (Number(bill.amount) / totalDays) * overlapDays : 0,
      };
    });
  }

  private calculatePendingPayables(bills: Array<any>, payments: Array<any>) {
    return bills.reduce((sum, bill) => {
      const paid = payments
        .filter((payment) => payment.billId === bill.id)
        .reduce(
          (innerSum, payment) => innerSum + Number(payment.paidAmount ?? 0),
          0,
        );

      return sum + Math.max(Number(bill.amount) - paid, 0);
    }, 0);
  }

  async getOverview(range: FinanceRangeDto) {
    const { start, end } = this.resolveRange(range);

    const [paidOrders, shippedOrders, reimbursements, bills, billPayments] =
      await Promise.all([
        this.prisma.order.findMany({
          where: { paidAt: { gte: start, lte: end }, cancelledAt: null },
          select: { id: true, amountTotal: true, paidAt: true },
        }),
        this.prisma.order.findMany({
          where: { shippedAt: { gte: start, lte: end }, cancelledAt: null },
          select: { id: true, amountTotal: true, shippedAt: true },
        }),
        this.prisma.reimbursement.findMany({
          where: { status: 'REIMBURSED', paidAt: { gte: start, lte: end } },
          select: {
            id: true,
            totalActualCost: true,
            paidAt: true,
            platformShippingFee: true,
            platformPackagingFee: true,
            customFees: true,
          },
        }),
        this.prisma.expenseBill.findMany({
          where: {
            status: { in: ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID'] },
            recognitionStart: { lte: end },
            recognitionEnd: { gte: start },
          },
        }),
        this.prisma.expenseBillPayment.findMany({
          where: { paidAt: { lte: end } },
        }),
      ]);

    const cashIn = paidOrders.reduce(
      (sum, item) => sum + Number(item.amountTotal),
      0,
    );
    const operatingRevenue = shippedOrders.reduce(
      (sum, item) => sum + Number(item.amountTotal),
      0,
    );
    const reimbursedCashOut = reimbursements.reduce(
      (sum, item) => sum + Number(item.totalActualCost),
      0,
    );
    const billCashOut = billPayments.reduce((sum, item) => {
      const paidAt = new Date(item.paidAt);
      return paidAt >= start && paidAt <= end
        ? sum + Number(item.paidAmount)
        : sum;
    }, 0);
    const recognizedExpense = [
      ...this.expandReimbursementExpenses(reimbursements),
      ...this.allocateExpenseBills(bills, start, end),
    ];
    const actualExpense = recognizedExpense.reduce(
      (sum, item) => sum + item.amount,
      0,
    );

    return {
      cashIn,
      operatingRevenue,
      actualExpense,
      operatingBalance: operatingRevenue - actualExpense,
      cashOut: reimbursedCashOut + billCashOut,
      netCashflow: cashIn - reimbursedCashOut - billCashOut,
      pendingPayables: this.calculatePendingPayables(bills, billPayments),
    };
  }

  async getExpenseAnalysis(range: FinanceRangeDto) {
    const { start, end } = this.resolveRange(range);
    const [reimbursements, bills] = await Promise.all([
      this.prisma.reimbursement.findMany({
        where: { status: 'REIMBURSED', paidAt: { gte: start, lte: end } },
        select: {
          totalActualCost: true,
          platformShippingFee: true,
          platformPackagingFee: true,
          customFees: true,
        },
      }),
      this.prisma.expenseBill.findMany({
        where: {
          recognitionStart: { lte: end },
          recognitionEnd: { gte: start },
          status: { in: ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAID'] },
        },
      }),
    ]);

    const categoryMap = new Map<string, number>();

    for (const row of [
      ...this.expandReimbursementExpenses(reimbursements),
      ...this.allocateExpenseBills(bills, start, end),
    ]) {
      categoryMap.set(
        row.category,
        (categoryMap.get(row.category) ?? 0) + row.amount,
      );
    }

    return {
      categories: Array.from(categoryMap.entries()).map(([category, amount]) => ({
        category,
        label: FINANCE_EXPENSE_CATEGORY_LABELS[
          category as keyof typeof FINANCE_EXPENSE_CATEGORY_LABELS
        ] ?? category,
        amount,
      })),
    };
  }

  async getContributionAnalysis(
    range: FinanceRangeDto,
    groupBy: 'ORDER' | 'RECIPE',
  ) {
    const { start, end } = this.resolveRange(range);
    const shippedOrders = await this.prisma.order.findMany({
      where: { shippedAt: { gte: start, lte: end }, cancelledAt: null },
      include: { items: true },
    });

    return shippedOrders.map((order) => ({
      orderId: order.id,
      groupKey:
        groupBy === 'ORDER'
          ? order.id
          : this.extractRecipeName(order.items[0]?.recipeSnapshot),
      revenue: Number(order.amountTotal),
      contributionCost: this.extractSnapshotCost(order.pricingBreakdownSnapshot),
      isEstimatedCost: true,
      label: '经营贡献分析，非正式财务利润',
    }));
  }

  private extractRecipeName(snapshot: unknown): string {
    if (
      snapshot &&
      typeof snapshot === 'object' &&
      'name' in snapshot &&
      typeof (snapshot as { name?: unknown }).name === 'string'
    ) {
      return (snapshot as { name: string }).name;
    }

    return '未命名食谱';
  }
}
