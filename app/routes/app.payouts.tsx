import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData, useRouteError } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateMerchant, logActivity } from "../lib/merchant.server";
import { formatInr } from "../lib/format";
import { attributeOrder } from "../lib/commissions.server";
import { fetchRecentPaidOrders, tagOrderWithAffiliate } from "../lib/shopify-orders.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const programs = await prisma.program.findMany({ where: { merchantId: merchant.id } });
  const programIds = programs.map((p: { id: string }) => p.id);
  const affiliates = programIds.length
    ? await prisma.affiliate.findMany({
        where: { programId: { in: programIds } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const affiliateIds = affiliates.map((a: { id: string }) => a.id);
  const commissions = affiliateIds.length
    ? await prisma.commission.findMany({
        where: { affiliateId: { in: affiliateIds } },
      })
    : [];

  const byAffiliate = new Map<string, Array<{ id: string; status: string; amountPaise: number }>>();
  for (const c of commissions as Array<{
    id: string;
    affiliateId: string;
    status: string;
    amountPaise: number;
  }>) {
    const list = byAffiliate.get(c.affiliateId) || [];
    list.push(c);
    byAffiliate.set(c.affiliateId, list);
  }

  const rows = affiliates.map((a: { id: string; name: string; email: string }) => {
    const list = byAffiliate.get(a.id) || [];
    const pending = list.filter((c) => c.status === "PENDING");
    const approved = list.filter((c) => c.status === "APPROVED");
    return {
      id: a.id,
      name: a.name,
      email: a.email,
      pendingPaise: pending.reduce((s, c) => s + c.amountPaise, 0),
      approvedPaise: approved.reduce((s, c) => s + c.amountPaise, 0),
      pendingIds: pending.map((c) => c.id),
      approvedIds: approved.map((c) => c.id),
    };
  });

  return { rows };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "sync") {
    const orders = await fetchRecentPaidOrders(admin, { first: 25 });
    let attributed = 0;
    let skipped = 0;
    for (const order of orders) {
      const refMatch = order.landingSite.match(/(?:mc_ref|madcircle_ref)=([A-Z0-9]+)/i);
      const result = await attributeOrder({
        shop: session.shop,
        shopifyOrderId: order.id,
        shopifyOrderName: order.name,
        orderTotalPaise: order.totalPaise,
        discountCodes: order.discountCodes,
        referralCode: refMatch?.[1]?.toUpperCase() ?? null,
      });
      if (result && "commission" in result && result.commission) {
        attributed += 1;
        try {
          await tagOrderWithAffiliate(admin, {
            orderGid: order.id,
            referralCode: order.discountCodes[0] || refMatch?.[1] || "madcircle",
          });
        } catch {
          // best-effort
        }
      } else {
        skipped += 1;
      }
    }
    await logActivity(
      session.shop,
      `Synced paid orders: ${attributed} attributed, ${skipped} skipped (${orders.length} scanned)`,
    );
    return { synced: true, attributed, skipped, scanned: orders.length };
  }

  const affiliateId = String(form.get("affiliateId"));
  const ids = String(form.get("ids") || "")
    .split(",")
    .filter(Boolean);
  const note = String(form.get("note") || "");

  if (intent === "approve") {
    await prisma.commission.updateMany({
      where: { id: { in: ids } },
      data: { status: "APPROVED" },
    });
    await logActivity(session.shop, `Approved commissions for ${affiliateId}`);
  }

  if (intent === "pay") {
    const amountPaise = Number(form.get("amountPaise") || 0);
    const payout = await prisma.payout.create({
      data: {
        affiliateId,
        amountPaise,
        status: "PAID",
        referenceNote: note,
        paidAt: new Date(),
      },
    });
    await prisma.commission.updateMany({
      where: { id: { in: ids } },
      data: { status: "PAID", payoutId: payout.id, note },
    });
    await logActivity(session.shop, `Marked payout for ${affiliateId}: ${note}`);
  }

  return null;
};

export default function Payouts() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const rows = data?.rows ?? [];

  return (
    <div className="mc-shell">
      <TitleBar title="Payouts" />
      <h1 className="mc-h1">Payouts</h1>
      <p className="mc-lead">
        Mark commissions approved, then paid with a UPI or bank reference. Money never moves through
        MadCircle.
      </p>

      <div className="mc-row" style={{ marginBottom: 16, justifyContent: "space-between" }}>
        <a href="/app/export.csv">Download CSV of amounts owed</a>
        <Form method="post">
          <input type="hidden" name="intent" value="sync" />
          <button className="mc-btn secondary" type="submit">
            Sync paid orders
          </button>
        </Form>
      </div>

      {actionData && "synced" in actionData && actionData.synced ? (
        <p style={{ color: "var(--mc-success)", marginBottom: 16 }}>
          Synced {actionData.scanned} paid orders → {actionData.attributed} new commission
          {actionData.attributed === 1 ? "" : "s"}, {actionData.skipped} skipped.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="mc-card">
          <p className="mc-lead" style={{ marginBottom: 0 }}>
            No affiliates yet. Invite partners first, then commissions will show here for payout.
          </p>
        </div>
      ) : (
        <div className="mc-card">
          <table className="mc-table">
            <thead>
              <tr>
                <th>Affiliate</th>
                <th>Pending</th>
                <th>Approved (owed)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.name}
                    <div style={{ color: "#6e6e73", fontSize: 12 }}>{row.email}</div>
                  </td>
                  <td>{formatInr(row.pendingPaise)}</td>
                  <td>{formatInr(row.approvedPaise)}</td>
                  <td>
                    <Form method="post" className="mc-row">
                      <input type="hidden" name="affiliateId" value={row.id} />
                      {row.pendingPaise > 0 && (
                        <>
                          <input type="hidden" name="ids" value={row.pendingIds.join(",")} />
                          <button
                            className="mc-btn secondary"
                            name="intent"
                            value="approve"
                            type="submit"
                          >
                            Approve pending
                          </button>
                        </>
                      )}
                      {row.approvedPaise > 0 && (
                        <>
                          <input type="hidden" name="ids" value={row.approvedIds.join(",")} />
                          <input type="hidden" name="amountPaise" value={row.approvedPaise} />
                          <input
                            className="mc-input"
                            name="note"
                            placeholder="UPI / bank ref"
                            style={{ margin: 0, width: 160 }}
                          />
                          <button className="mc-btn" name="intent" value="pay" type="submit">
                            Mark paid
                          </button>
                        </>
                      )}
                    </Form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
