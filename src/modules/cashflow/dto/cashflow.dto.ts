// src/modules/cashflow/cashflow.dto.ts

export interface CashflowRevenueInput {
  description: string;
  productId?: string;
  unitPrice: number;
  quantity: number;
  total: number;
  currency: string;
  exchangeRate: number;
}

export interface CashflowCostInput {
  description: string;
  // vendorId?: string;
  costPerUnit: number;
  quantity: number;
  currency: string;
  exchangeRate: number;
  total: number;
}

export interface SaveCashflowDTO {
  orderNumber: string;
  revenueItems: CashflowRevenueInput[];
  costItems: CashflowCostInput[];
}
