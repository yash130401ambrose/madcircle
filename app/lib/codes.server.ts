import prisma from "../db.server";

/** Uppercase A–Z / 0–9 only, 4–20 chars. */
export function normalizeCode(raw: string) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function validateCodeFormat(code: string, label = "Code") {
  if (code.length < 4 || code.length > 20) {
    return `${label} must be 4–20 letters or numbers.`;
  }
  return null;
}

export async function assertReferralCodeAvailable(code: string, exceptAffiliateId?: string) {
  const formatError = validateCodeFormat(code, "Referral code");
  if (formatError) return formatError;
  const existing = await prisma.affiliate.findUnique({ where: { referralCode: code } });
  if (existing && existing.id !== exceptAffiliateId) {
    return "That referral code is already taken.";
  }
  return null;
}

/** Coupon should be unique among affiliates on the same merchant. */
export async function assertCouponCodeAvailable(
  code: string,
  merchantId: string,
  exceptAffiliateId?: string,
) {
  const formatError = validateCodeFormat(code, "Coupon code");
  if (formatError) return formatError;
  const programs = await prisma.program.findMany({
    where: { merchantId },
    select: { id: true },
  });
  const pids = programs.map((p: { id: string }) => p.id);
  if (!pids.length) return null;
  const rivals = await prisma.affiliate.findMany({
    where: { programId: { in: pids } },
  });
  const clash = rivals.find(
    (a: { id: string; couponCode?: string | null }) =>
      a.couponCode &&
      a.couponCode.toUpperCase() === code &&
      a.id !== exceptAffiliateId,
  );
  if (clash) return "That coupon code is already used by another partner on this brand.";
  return null;
}

export async function updateAffiliateCodes(opts: {
  affiliateId: string;
  referralCode?: string;
  couponCode?: string;
}) {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: opts.affiliateId },
    include: { program: true },
  });
  if (!affiliate) return { error: "Affiliate not found." };

  const data: Record<string, string> = {};

  if (opts.referralCode != null) {
    const referralCode = normalizeCode(opts.referralCode);
    const err = await assertReferralCodeAvailable(referralCode, affiliate.id);
    if (err) return { error: err };
    data.referralCode = referralCode;
  }

  if (opts.couponCode != null) {
    const couponCode = normalizeCode(opts.couponCode);
    const merchantId = affiliate.program?.merchantId as string | undefined;
    if (!merchantId) return { error: "Program missing for this affiliate." };
    const err = await assertCouponCodeAvailable(couponCode, merchantId, affiliate.id);
    if (err) return { error: err };
    data.couponCode = couponCode;
  }

  if (!Object.keys(data).length) return { error: "Nothing to update." };

  const updated = await prisma.affiliate.update({
    where: { id: affiliate.id },
    data,
  });
  return { affiliate: updated };
}
