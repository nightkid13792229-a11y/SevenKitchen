import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma.service';
import { CreateExpenseTemplateDto } from '../../interfaces/dto/finance/create-expense-template.dto';

const isTemplateDue = (template: any, now: Date) => {
  const current = new Date(now);
  if (template.interval === 'MONTHLY') {
    return current.getDate() >= Number(template.dayOfMonth ?? 1);
  }

  return (
    current.getMonth() + 1 === Number(template.monthOfYear) &&
    current.getDate() >= Number(template.dayOfMonth ?? 1)
  );
};

const buildTemplateBillWindow = (template: any, now: Date) => {
  const current = new Date(now);
  const recognitionStart = new Date(
    current.getFullYear(),
    current.getMonth(),
    1,
  );
  const recognitionEnd = new Date(
    current.getFullYear(),
    current.getMonth() + Number(template.servicePeriodMonths ?? 1),
    0,
  );
  const dueAt = new Date(current);
  dueAt.setDate(Number(template.dayOfMonth ?? current.getDate()));
  dueAt.setHours(12, 0, 0, 0);

  return {
    title: String(template.titleTemplate)
      .replace('{{year}}', String(current.getFullYear()))
      .replace('{{month}}', String(current.getMonth() + 1)),
    recognitionStart,
    recognitionEnd,
    dueAt,
  };
};

const buildTemplateBillNumber = (now: Date) =>
  `FB${[
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('')}${Math.random().toString().slice(2, 5)}`;

@Injectable()
export class ExpenseTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  createTemplate(createdById: string, dto: CreateExpenseTemplateDto) {
    return this.prisma.expenseTemplate.create({
      data: {
        ...dto,
        createdById,
      },
    });
  }

  listTemplates() {
    return this.prisma.expenseTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ interval: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async generateDueBills(now: Date, createdById: string) {
    const templates = await this.prisma.expenseTemplate.findMany({
      where: { isActive: true },
    });

    const createdBills = [];
    for (const template of templates) {
      if (!isTemplateDue(template, now)) {
        continue;
      }

      const { title, recognitionStart, recognitionEnd, dueAt } =
        buildTemplateBillWindow(template, now);

      const existing = await this.prisma.expenseBill.findFirst({
        where: {
          templateId: template.id,
          recognitionStart,
          recognitionEnd,
        },
      });
      if (existing) {
        continue;
      }

      createdBills.push(
        await this.prisma.expenseBill.create({
          data: {
            billNumber: buildTemplateBillNumber(now),
            title,
            category: template.category,
            status: 'PENDING_PAYMENT',
            payeeName: template.payeeName,
            amount: template.defaultAmount,
            recognitionStart,
            recognitionEnd,
            dueAt,
            templateId: template.id,
            createdById,
          },
        }),
      );
    }

    return createdBills;
  }
}
