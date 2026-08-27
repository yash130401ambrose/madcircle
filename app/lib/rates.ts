export type RatePair = { type: string; value: number };

export function effectiveCommission(
  affiliate: {
    commissionTypeOverride?: string | null;
    commissionValueOverride?: number | null;
  },
  program: { commissionType: string; commissionValue: number },
): RatePair {
  return {
    type: affiliate.commissionTypeOverride || program.commissionType,
    value:
      affiliate.commissionValueOverride != null
        ? Number(affiliate.commissionValueOverride)
        : Number(program.commissionValue),
  };
}

export function effectiveCustomerDiscount(
  affiliate: {
    customerDiscountTypeOverride?: string | null;
    customerDiscountValueOverride?: number | null;
  },
  program: {
    customerDiscountType?: string | null;
    customerDiscountValue?: number | null;
  },
): RatePair {
  return {
    type: affiliate.customerDiscountTypeOverride || program.customerDiscountType || "PERCENT",
    value:
      affiliate.customerDiscountValueOverride != null
        ? Number(affiliate.customerDiscountValueOverride)
        : Number(program.customerDiscountValue ?? 10),
  };
}

export function formatRate(rate: RatePair) {
  if (rate.type === "FLAT") return `₹${rate.value}`;
  return `${rate.value}%`;
}

/** Parse form: blank override fields → null (use program default). */
export function parseOverrideFromForm(
  form: FormData,
  typeKey: string,
  valueKey: string,
  useDefaultKey: string,
): { type: string | null; value: number | null } {
  const useDefault = form.get(useDefaultKey) === "on";
  if (useDefault) return { type: null, value: null };
  const type = String(form.get(typeKey) || "PERCENT");
  const raw = String(form.get(valueKey) || "").trim();
  if (!raw) return { type: null, value: null };
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) return { type: null, value: null };
  return { type, value };
}

/** Shopify DiscountCodeBasicInput value for percent or fixed amount (INR). */
export function shopifyDiscountValue(rate: RatePair) {
  if (rate.type === "FLAT") {
    return {
      discountAmount: {
        amount: String(rate.value),
        appliesOnEachItem: false,
      },
    };
  }
  return { percentage: Math.min(Math.max(rate.value / 100, 0), 1) };
}
