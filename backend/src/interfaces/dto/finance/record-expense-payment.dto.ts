export class RecordExpensePaymentDto {
  paidAmount!: number;
  paidAt!: string;
  paymentMethod!: string;
  paymentProofUrls!: string[];
  note?: string;
}
