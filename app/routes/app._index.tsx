import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateMerchant } from "../lib/merchant.server";
import { formatInr } from "../lib/format";
import { EMPTY_IMAGE } from "../lib/imagery";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  if (!merchant.onboardedAt) throw redirect("/app/onboarding");

  const programs = await prisma.program.findMany({ where: { merchantId: merchant.id } });
  const affiliates = await prisma.affiliate.findMany({
    where: { programId: { in: programs.map((p) => p.id) } },
  });
  const commissions = await prisma.commission.findMany({
    where: { affiliateId: { in: affiliates.map((a) => a.id) } },
  });
  const activity = await prisma.activity.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const liability = commissions
    .filter((c) => c.status !== "PAID" && c.status !== "VOID")
    .reduce((sum, c) => sum + c.amountPaise, 0);
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const ordersThisMonth = commissions.filter(
    (c) => !c.isOverride && new Date(c.createdAt) >= start && c.status !== "VOID",
  ).length;
  const top = [...affiliates]
    .map((a) => ({
      ...a,
      earned: commissions.filter((c) => c.affiliateId === a.id).reduce((s, c) => s + c.amountPaise, 0),
    }))
    .sort((a, b) => b.earned - a.earned)[0];

  return {
    shop: session.shop,
    liability,
    activeAffiliates: affiliates.filter((a) => a.status === "APPROVED").length,
    ordersThisMonth,
    topName: top?.name ?? "—",
    topEarned: top?.earned ?? 0,
    pendingApps: affiliates.filter((a) => a.status === "PENDING").length,
    activity,
    hasAffiliates: affiliates.length > 0,
  };
};

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="mc-shell">
      <TitleBar title="MadCircle" />
      <h1 className="mc-h1">Partner program</h1>
      <p className="mc-lead">
        Track what you owe Hangover Fix trade partners. Payouts stay on your bank or UPI — MadCircle
        only keeps the ledger.
      </p>

      <div className="mc-grid-kpi">
        <div className="mc-card">
          <p className="mc-kpi-label">Commission liability</p>
          <p className="mc-kpi-value">{formatInr(data.liability)}</p>
        </div>
        <div className="mc-card">
          <p className="mc-kpi-label">Active affiliates</p>
          <p className="mc-kpi-value">{data.activeAffiliates}</p>
        </div>
        <div className="mc-card">
          <p className="mc-kpi-label">Orders tracked this month</p>
          <p className="mc-kpi-value">{data.ordersThisMonth}</p>
        </div>
        <div className="mc-card">
          <p className="mc-kpi-label">Top affiliate</p>
          <p className="mc-kpi-value" style={{ fontSize: 18 }}>
            {data.topName}
          </p>
        </div>
      </div>

      {data.pendingApps > 0 && (
        <div className="mc-card" style={{ marginBottom: 16 }}>
          <strong>{data.pendingApps}</strong> application{data.pendingApps === 1 ? "" : "s"} waiting
          for review. This is where you approve new trade partners.
        </div>
      )}

      {!data.hasAffiliates ? (
        <div className="mc-card mc-empty">
          <img src={EMPTY_IMAGE} alt="Winding mountain road at the first switchback — empty partner list" />
          <h2>No affiliates yet</h2>
          <p>
            Invite wedding planners and retailers to your Hangover Fix partner portal. Their first
            attributed order will show up here.
          </p>
        </div>
      ) : (
        <div className="mc-card">
          <h2 style={{ marginTop: 0 }}>Recent activity</h2>
          <table className="mc-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
              </tr>
            </thead>
            <tbody>
              {data.activity.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.createdAt).toLocaleString("en-IN")}</td>
                  <td>{row.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ marginTop: 16, color: "#6e6e73", fontSize: 13 }}>
        Store: {data.shop} · Plan: Pro (Nutriline launch)
      </p>
    </div>
  );
}
