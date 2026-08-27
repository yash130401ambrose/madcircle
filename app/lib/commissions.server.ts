import prisma from "../db.server";
import { monthlyOrderCap } from "./merchant.server";
import { effectiveCommission } from "./rates";

export async function countTrackedOrdersThisMonth(shop: string) {
  const merchant = await prisma.merchant.findUnique({ where: { shop } });
  if (!merchant) return 0;
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const programs = await prisma.program.findMany({
    where: { merchantId: merchant.id },
    select: { id: true },
  });
  const affiliates = await prisma.affiliate.findMany({
    where: { programId: { in: programs.map((p) => p.id) } },
    select: { id: true },
  });
  return prisma.commission.count({
    where: {
      affiliateId: { in: affiliates.map((a) => a.id) },
      isOverride: false,
      createdAt: { gte: start },
      status: { not: "VOID" },
    },
  });
}

export function computeCommissionPaise(orderTotalPaise: number, type: string, value: number) {
  if (type === "FLAT") return Math.round(value * 100);
  return Math.round((orderTotalPaise * value) / 100);
}

export async function attributeOrder(input: {
  shop: string;
  shopifyOrderId: string;
  shopifyOrderName: string;
  orderTotalPaise: number;
  discountCodes: string[];
  referralCode?: string | null;
}) {
  const merchant = await prisma.merchant.findUnique({ where: { shop: input.shop } });
  if (!merchant) return null;

  const tracked = await countTrackedOrdersThisMonth(input.shop);
  if (tracked >= monthlyOrderCap(merchant.plan)) {
    return { skipped: "cap" as const };
  }

  const existing = await prisma.commission.findFirst({
    where: { shopifyOrderId: input.shopifyOrderId, isOverride: false },
  });
  if (existing) return { skipped: "duplicate" as const };

  let affiliate = input.referralCode
    ? await prisma.affiliate.findUnique({ where: { referralCode: input.referralCode } })
    : null;

  if (!affiliate && input.discountCodes.length) {
    affiliate = await prisma.affiliate.findFirst({
      where: {
        couponCode: { in: input.discountCodes.map((c) => c.toUpperCase()) },
        program: { merchantId: merchant.id },
      },
    });
  }

  if (!affiliate || affiliate.status !== "APPROVED") return { skipped: "no_affiliate" as const };

  const blocked = await prisma.blockListEntry.findFirst({
    where: {
      shop: input.shop,
      OR: [
        { kind: "EMAIL", value: affiliate.email },
        { kind: "PHONE", value: affiliate.phone },
        { kind: "COUPON", value: affiliate.couponCode ?? "" },
      ],
    },
  });
  if (blocked) {
    await prisma.activity.create({
      data: {
        shop: input.shop,
        message: `Blocked attribution for ${affiliate.name} (${blocked.kind}: ${blocked.value})`,
      },
    });
    return { skipped: "blocked" as const };
  }

  const program = await prisma.program.findUnique({ where: { id: affiliate.programId } });
  if (!program) return null;

  const source =
    input.discountCodes.length &&
    affiliate.couponCode &&
    input.discountCodes.map((c) => c.toUpperCase()).includes(String(affiliate.couponCode).toUpperCase())
      ? "COUPON"
      : "COOKIE";

  const rate = effectiveCommission(affiliate, program);
  const amountPaise = computeCommissionPaise(input.orderTotalPaise, rate.type, rate.value);

  const commission = await prisma.commission.create({
    data: {
      affiliateId: affiliate.id,
      shopifyOrderId: input.shopifyOrderId,
      shopifyOrderName: input.shopifyOrderName,
      orderTotalPaise: input.orderTotalPaise,
      amountPaise,
      source,
      status: "PENDING",
    },
  });

  if (program.mlmEnabled && affiliate.parentId) {
    const override = computeCommissionPaise(
      input.orderTotalPaise,
      "PERCENT",
      program.mlmOverridePercent,
    );
    await prisma.commission.create({
      data: {
        affiliateId: affiliate.parentId,
        shopifyOrderId: input.shopifyOrderId,
        shopifyOrderName: input.shopifyOrderName,
        orderTotalPaise: input.orderTotalPaise,
        amountPaise: override,
        source: "OVERRIDE",
        status: "PENDING",
        isOverride: true,
      },
    });
  }

  await prisma.activity.create({
    data: {
      shop: input.shop,
      message: `Order ${input.shopifyOrderName} attributed to ${affiliate.name} (${formatSource(source)}, ${rate.type === "FLAT" ? `₹${rate.value}` : `${rate.value}%`})`,
    },
  });

  return { commission };
}

function formatSource(source: string) {
  return source.toLowerCase();
}
