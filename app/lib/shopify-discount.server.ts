import { effectiveCustomerDiscount, shopifyDiscountValue, type RatePair } from "./rates";

type AdminGraphql = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

/** Best-effort create of a basic discount code for this partner’s coupon. */
export async function ensureShopifyDiscountCode(
  admin: AdminGraphql,
  opts: {
    title: string;
    code: string;
    rate: RatePair;
  },
) {
  try {
    const res = await admin.graphql(
      `#graphql
      mutation discount($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode { id }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          basicCodeDiscount: {
            title: opts.title,
            code: opts.code,
            startsAt: new Date().toISOString(),
            customerSelection: { all: true },
            customerGets: {
              value: shopifyDiscountValue(opts.rate),
              items: { all: true },
            },
            usageLimit: null,
          },
        },
      },
    );
    const json = (await res.json()) as {
      data?: {
        discountCodeBasicCreate?: {
          codeDiscountNode?: { id: string } | null;
          userErrors?: Array<{ message: string }>;
        };
      };
    };
    const id = json.data?.discountCodeBasicCreate?.codeDiscountNode?.id || "";
    return { id, errors: json.data?.discountCodeBasicCreate?.userErrors || [] };
  } catch (e) {
    return { id: "", errors: [{ message: e instanceof Error ? e.message : "Discount create failed" }] };
  }
}

export function discountRateForAffiliate(
  affiliate: {
    customerDiscountTypeOverride?: string | null;
    customerDiscountValueOverride?: number | null;
  },
  program: {
    customerDiscountType?: string | null;
    customerDiscountValue?: number | null;
  },
) {
  return effectiveCustomerDiscount(affiliate, program);
}
