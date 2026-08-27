import prisma from "../db.server";

export async function getOrCreateMerchant(shop: string) {
  return prisma.merchant.upsert({
    where: { shop },
    create: {
      shop,
      plan: "PRO",
      currency: "INR",
    },
    update: {},
  });
}

export async function logActivity(shop: string, message: string) {
  await prisma.activity.create({ data: { shop, message } });
}

export function monthlyOrderCap(plan: string) {
  if (plan === "FREE") return 50;
  return Number.POSITIVE_INFINITY;
}
