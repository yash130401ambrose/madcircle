import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, redirect, useLoaderData } from "@remix-run/react";
import { requireAffiliate } from "../lib/affiliate-auth.server";
import prisma from "../db.server";
import { matchClaim } from "../lib/claims";
import { unauthenticated } from "../shopify.server";
import { fetchRecentOrdersForClaims } from "../lib/shopify-orders.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const affiliate = await requireAffiliate(request);
  const claims = await prisma.referralClaim.findMany({
    where: { affiliateId: affiliate.id },
    orderBy: { createdAt: "desc" },
  });
  return { claims, status: affiliate.status };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const affiliate = await requireAffiliate(request);
  if (affiliate.status !== "APPROVED") return { error: "Account not approved yet." };
  const form = await request.formData();
  const customerName = String(form.get("customerName") || "");
  const customerPhone = String(form.get("customerPhone") || "");
  const customerAddress = String(form.get("customerAddress") || "");

  let matchCount = 0;
  let matchedOrderId: string | null = null;
  let audit = { mode: "manual", fields: [] as string[] };

  const shop = affiliate.program?.merchant?.shop as string | undefined;
  if (shop) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const orders = await fetchRecentOrdersForClaims(admin, { days: 30, first: 50 });
      const best = matchClaim({ customerName, customerPhone, customerAddress }, orders);
      matchCount = best.count;
      matchedOrderId = best.order?.id ?? null;
      audit = { mode: "auto", fields: best.fields };
    } catch (e) {
      console.warn("Claim auto-match failed", e);
      audit = { mode: "manual", fields: [] };
    }
  }

  const plan = affiliate.program?.merchant?.plan as string | undefined;
  const auto = plan === "GROWTH" || plan === "PRO";
  const status = auto && matchCount >= 2 ? "VERIFIED" : "SUBMITTED";

  await prisma.referralClaim.create({
    data: {
      affiliateId: affiliate.id,
      customerName,
      customerPhone,
      customerAddress,
      matchCount: auto ? matchCount : 0,
      matchedOrderId: auto ? matchedOrderId : null,
      status,
      auditJson: JSON.stringify(audit),
    },
  });

  throw redirect("/partners/claims");
};

export default function ClaimsForm() {
  const { claims } = useLoaderData<typeof loader>();
  return (
    <div className="mc-shell" style={{ maxWidth: 640 }}>
      <h1 className="mc-h1">Claim a sale</h1>
      <p className="mc-lead">
        Use this when the customer didn’t apply your code. Give at least two of name, phone, and
        address. Auto-match only looks at orders from the last 30 days.
      </p>
      <Form method="post" className="mc-card" style={{ marginBottom: 20 }}>
        <label className="mc-label">Customer name</label>
        <input className="mc-input" name="customerName" />
        <label className="mc-label">Phone</label>
        <input className="mc-input" name="customerPhone" />
        <label className="mc-label">Address</label>
        <input className="mc-input" name="customerAddress" />
        <button className="mc-btn" type="submit">
          Submit claim
        </button>
      </Form>
      <div className="mc-card">
        <h2 style={{ marginTop: 0 }}>Your claims</h2>
        <ul>
          {claims.map((c: { id: string; customerName: string; customerPhone: string; status: string; matchCount: number }) => (
            <li key={c.id}>
              {c.customerName || c.customerPhone} — {c.status} ({c.matchCount}/3)
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
