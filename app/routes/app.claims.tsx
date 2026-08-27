import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateMerchant, logActivity } from "../lib/merchant.server";
import { StatusBadge } from "../components/StatusBadge";
import { attributeOrder } from "../lib/commissions.server";
import { fetchOrderTotalPaise, tagOrderWithAffiliate } from "../lib/shopify-orders.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const programs = await prisma.program.findMany({ where: { merchantId: merchant.id } });
  const affiliates = await prisma.affiliate.findMany({
    where: { programId: { in: programs.map((a: { id: string }) => a.id) } },
    select: { id: true },
  });
  const claims = await prisma.referralClaim.findMany({
    where: { affiliateId: { in: affiliates.map((a: { id: string }) => a.id) } },
    include: { affiliate: true },
    orderBy: { createdAt: "desc" },
  });
  return { claims };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get("id"));
  const intent = String(form.get("intent"));
  const claim = await prisma.referralClaim.findUnique({
    where: { id },
    include: { affiliate: true },
  });
  if (!claim) return null;

  if (intent === "reject") {
    await prisma.referralClaim.update({ where: { id }, data: { status: "REJECTED" } });
    await logActivity(session.shop, `Claim ${id} rejected`);
  }

  if (intent === "approve" && claim.matchedOrderId) {
    const orderTotalPaise = await fetchOrderTotalPaise(admin, claim.matchedOrderId);
    await prisma.referralClaim.update({ where: { id }, data: { status: "APPROVED" } });
    await attributeOrder({
      shop: session.shop,
      shopifyOrderId: claim.matchedOrderId,
      shopifyOrderName: claim.matchedOrderId,
      orderTotalPaise,
      discountCodes: [],
      referralCode: claim.affiliate.referralCode,
    });
    try {
      await tagOrderWithAffiliate(admin, {
        orderGid: claim.matchedOrderId,
        referralCode: claim.affiliate.referralCode,
      });
    } catch {
      // tagging is best-effort
    }
    await logActivity(session.shop, `Claim ${id} approved`);
  }

  return null;
};

export default function Claims() {
  const { claims } = useLoaderData<typeof loader>();
  return (
    <div className="mc-shell">
      <TitleBar title="Referral claims" />
      <h1 className="mc-h1">Referral claims</h1>
      <p className="mc-lead">
        When a cookie or coupon misses checkout, partners can claim a sale. Growth+ auto-matches 2 of
        3 identity fields; you still approve the payout.
      </p>
      <div className="mc-card">
        <table className="mc-table">
          <thead>
            <tr>
              <th>Affiliate</th>
              <th>Customer</th>
              <th>Match</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {claims.map(
              (c: {
                id: string;
                customerName: string;
                customerPhone: string;
                customerAddress: string;
                matchCount: number;
                matchedOrderId?: string | null;
                status: string;
                affiliate: { name: string };
              }) => (
                <tr key={c.id}>
                  <td>{c.affiliate.name}</td>
                  <td>
                    {c.customerName}
                    <div style={{ fontSize: 12, color: "#6e6e73" }}>
                      {c.customerPhone} · {c.customerAddress}
                    </div>
                  </td>
                  <td>
                    {c.matchCount}/3 {c.matchedOrderId ? `· ${c.matchedOrderId}` : ""}
                  </td>
                  <td>
                    <StatusBadge status={c.status} />
                  </td>
                  <td>
                    <Form method="post" className="mc-row">
                      <input type="hidden" name="id" value={c.id} />
                      <button className="mc-btn" name="intent" value="approve" type="submit">
                        Approve
                      </button>
                      <button className="mc-btn secondary" name="intent" value="reject" type="submit">
                        Reject
                      </button>
                    </Form>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
