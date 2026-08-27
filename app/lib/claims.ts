import { fuzzyScore, normalizePhone } from "./format";

export type OrderIdentity = {
  id: string;
  name: string;
  phone: string;
  address: string;
};

export function matchClaim(
  claim: { customerName: string; customerPhone: string; customerAddress: string },
  orders: OrderIdentity[],
) {
  let best: { order: OrderIdentity; count: number; fields: string[] } | null = null;

  for (const order of orders) {
    const fields: string[] = [];
    if (claim.customerPhone && normalizePhone(claim.customerPhone) === normalizePhone(order.phone)) {
      fields.push("phone");
    }
    if (claim.customerName && fuzzyScore(claim.customerName, order.name) >= 0.7) {
      fields.push("name");
    }
    if (claim.customerAddress && fuzzyScore(claim.customerAddress, order.address) >= 0.7) {
      fields.push("address");
    }
    if (!best || fields.length > best.count) {
      best = { order, count: fields.length, fields };
    }
  }

  return best ?? { order: null, count: 0, fields: [] as string[] };
}
