// src/modules/cashflow/cashflow.dto.ts

export interface CashflowRevenueInput {
  description: string;
  productId: string;
  unitPrice: number;
  quantity: number;
  total: number; // Dalam IDR (Base Currency)
  currency: string; // 'IDR', 'USD', etc.
  exchangeRate: number; // 1 jika IDR
}

export interface CashflowCostInput {
  description: string;
  vendorId: string;
  costPerUnit: number; // Dalam mata uang asli (misal 5 USD)
  quantity: number;
  currency: string; // 'USD'
  exchangeRate: number; // 15000
  total: number; // Hasil konversi ke IDR: 5 * 15000 * quantity
}

export interface SaveCashflowDTO {
  poNumber: string;
  revenueItems: CashflowRevenueInput[];
  costItems: CashflowCostInput[];
}
