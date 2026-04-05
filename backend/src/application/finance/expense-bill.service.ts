import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CreateExpenseBillDto } from '../../interfaces/dto/finance/create-expense-bill.dto';
import { RecordExpensePaymentDto } from '../../interfaces/dto/finance/record-expense-payment.dto';

const resolveExpenseBillRange = (range: {
  preset?: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH';
}) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (range.preset === 'THIS_WEEK') {
    const day = now.getDay() || 7;
    start.setDate(now.getDate() - day + 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (range.preset === 'THIS_MONTH') {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    end.setMonth(now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const buildBillNumber = () => {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const suffix = Date.now().toString().slice(-3);
  return `FB${datePart}${suffix}`;
};

@Injectable()
export class ExpenseBillService {
  constructor(private readonly prisma: PrismaService) {}

  async createBill(createdById: string, dto: CreateExpenseBillDto) {
    return this.prisma.expenseBill.create({
      data: {
        billNumber: buildBillNumber(),
        title: dto.title,
        category: dto.category,
        payeeName: dto.payeeName,
        amount: dto.amount,
        recognitionStart: new Date(dto.recognitionStart),
        recognitionEnd: new Date(dto.recognitionEnd),
        dueAt: new Date(dto.dueAt),
        note: dto.note ?? null,
        templateId: dto.templateId ?? null,
        createdById,
        status: 'PENDING_PAYMENT',
      },
    });
  }

  async recordPayment(
    billId: string,
    paidById: string,
    dto: RecordExpensePaymentDto,
  ) {
    await this.prisma.expenseBillPayment.create({
      data: {
        billId,
        paidAmount: dto.paidAmount,
        paidAt: new Date(dto.paidAt),
        paidById,
        paymentMethod: dto.paymentMethod,
        paymentProofUrls: dto.paymentProofUrls,
        note: dto.note ?? null,
      },
    });

    const totalPaid = await this.prisma.expenseBillPayment.aggregate({
      where: { billId },
      _sum: { paidAmount: true },
    });

    const bill = await this.prisma.expenseBill.findUniqueOrThrow({
      where: { id: billId },
    });
    const nextStatus =
      Number(totalPaid._sum.paidAmount ?? 0) >= Number(bill.amount)
        ? 'PAID'
        : 'PARTIALLY_PAID';

    return this.prisma.expenseBill.update({
      where: { id: billId },
      data: { status: nextStatus },
    });
  }

  listBills(range: { preset?: 'TODAY' | 'THIS_WEEK' | 'THIS_MONTH' }) {
    const { start, end } = resolveExpenseBillRange(range);

    return this.prisma.expenseBill.findMany({
      where: {
        recognitionStart: { lte: end },
        recognitionEnd: { gte: start },
      },
      include: {
        payments: {
          orderBy: { paidAt: 'desc' },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    });
  }
}
