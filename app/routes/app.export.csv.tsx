import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateMerchant } from "../lib/merchant.server";
import { formatInr } from "../lib/format";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const programs = await prisma.program.findMany({ where: { merchantId: merchant.id } });
  const programIds = programs.map((p: { id: string }) => p.id);
  const affiliates = programIds.length
    ? await prisma.affiliate.findMany({ where: { programId: { in: programIds } } })
    : [];
  const affiliateIds = affiliates.map((a: { id: string }) => a.id);
  const commissions = affiliateIds.length
    ? await prisma.commission.findMany({ where: { affiliateId: { in: affiliateIds } } })
    : [];

  const byAffiliate = new Map<string, Array<{ status: string; amountPaise: number }>>();
  for (const c of commissions as Array<{
    affiliateId: string;
    status: string;
    amountPaise: number;
  }>) {
    const list = byAffiliate.get(c.affiliateId) || [];
    list.push(c);
    byAffiliate.set(c.affiliateId, list);
  }

  const header = ["affiliate", "email", "pending_inr", "approved_inr", "paid_inr"];
  const lines = affiliates.map((a: { id: string; name: string; email: string }) => {
    const list = byAffiliate.get(a.id) || [];
    const pending = list
      .filter((c) => c.status === "PENDING")
      .reduce((s, c) => s + c.amountPaise, 0);
    const approved = list
      .filter((c) => c.status === "APPROVED")
      .reduce((s, c) => s + c.amountPaise, 0);
    const paid = list.filter((c) => c.status === "PAID").reduce((s, c) => s + c.amountPaise, 0);
    return [a.name, a.email, formatInr(pending), formatInr(approved), formatInr(paid)].join(",");
  });
  const csv = [header.join(","), ...lines].join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": "attachment; filename=madcircle-commissions.csv",
    },
  });
};
