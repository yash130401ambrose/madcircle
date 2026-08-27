import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateMerchant, logActivity } from "../lib/merchant.server";
import { hashPassword, makeReferralCode } from "../lib/affiliate-auth.server";
import { StatusBadge } from "../components/StatusBadge";
import { EMPTY_IMAGE } from "../lib/imagery";
import {
  assertCouponCodeAvailable,
  assertReferralCodeAvailable,
  normalizeCode,
} from "../lib/codes.server";
import { effectiveCustomerDiscount, formatRate, effectiveCommission } from "../lib/rates";
import { ensureShopifyDiscountCode } from "../lib/shopify-discount.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const programs = await prisma.program.findMany({ where: { merchantId: merchant.id } });
  const affiliates = await prisma.affiliate.findMany({
    where: { programId: { in: programs.map((p) => p.id) } },
    include: { program: true },
    orderBy: { createdAt: "desc" },
  });
  return { affiliates, programs, shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const form = await request.formData();
  const intent = String(form.get("intent"));

  if (intent === "invite") {
    const program = await prisma.program.findFirst({ where: { merchantId: merchant.id } });
    if (!program) return { error: "Create a program first" };
    const name = String(form.get("name"));
    const email = String(form.get("email")).toLowerCase();
    const password = String(form.get("password") || "changeme123");
    const customReferral = normalizeCode(String(form.get("referralCode") || ""));
    const customCoupon = normalizeCode(String(form.get("couponCode") || ""));
    const referralCode = customReferral || makeReferralCode(name);
    const couponCode = customCoupon || referralCode.slice(0, 12);

    const refErr = await assertReferralCodeAvailable(referralCode);
    if (refErr) return { error: refErr };
    const couponErr = await assertCouponCodeAvailable(couponCode, merchant.id);
    if (couponErr) return { error: couponErr };

    const createdAff = await prisma.affiliate.create({
      data: {
        programId: program.id,
        email,
        name,
        passwordHash: await hashPassword(password),
        status: program.autoApprove ? "APPROVED" : "PENDING",
        referralCode,
        couponCode,
      },
    });
    const rate = effectiveCustomerDiscount(createdAff, program);
    const created = await ensureShopifyDiscountCode(admin, {
      title: `MadCircle ${name}`,
      code: couponCode,
      rate,
    });
    if (created.id) {
      await prisma.affiliate.update({
        where: { id: createdAff.id },
        data: { shopifyDiscountId: created.id },
      });
    }
    await logActivity(session.shop, `Invited affiliate ${name}`);
  }

  if (intent === "decide") {
    const id = String(form.get("id"));
    const status = String(form.get("status"));
    await prisma.affiliate.update({ where: { id }, data: { status } });
    await logActivity(session.shop, `Affiliate ${id} marked ${status}`);
  }

  return null;
};

export default function Affiliates() {
  const { affiliates, programs } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <div className="mc-shell">
      <TitleBar title="Affiliates" />
      <h1 className="mc-h1">Affiliates</h1>
      <p className="mc-lead">
        Approve applications, then edit referral + coupon codes on each partner’s detail page.
      </p>

      <div className="mc-card" style={{ marginBottom: 20 }}>
        <h2 style={{ marginTop: 0 }}>Invite a partner</h2>
        {actionData && "error" in actionData && actionData.error ? (
          <p style={{ color: "var(--mc-danger)" }}>{actionData.error}</p>
        ) : null}
        {programs.length === 0 ? (
          <p>Create a program in onboarding first.</p>
        ) : (
          <Form method="post">
            <input type="hidden" name="intent" value="invite" />
            <div className="mc-row">
              <input
                className="mc-input"
                name="name"
                placeholder="Name"
                required
                style={{ margin: 0, minWidth: 160 }}
              />
              <input
                className="mc-input"
                name="email"
                type="email"
                placeholder="Email"
                required
                style={{ margin: 0, minWidth: 180 }}
              />
              <input
                className="mc-input"
                name="password"
                placeholder="Temp password"
                style={{ margin: 0, minWidth: 140 }}
              />
            </div>
            <div className="mc-row" style={{ marginTop: 10 }}>
              <input
                className="mc-input"
                name="referralCode"
                placeholder="Referral code (optional)"
                style={{ margin: 0, minWidth: 180 }}
                maxLength={20}
              />
              <input
                className="mc-input"
                name="couponCode"
                placeholder="Coupon code (optional)"
                style={{ margin: 0, minWidth: 180 }}
                maxLength={20}
              />
              <button className="mc-btn" type="submit">
                Invite
              </button>
            </div>
            <p className="mc-lead" style={{ marginBottom: 0, marginTop: 8 }}>
              Leave codes blank to auto-generate. You can always edit them later.
            </p>
          </Form>
        )}
      </div>

      {affiliates.length === 0 ? (
        <div className="mc-card mc-empty">
          <img src={EMPTY_IMAGE} alt="Mountain road at the first bend — no partners yet" />
          <p>No partners yet. Invite someone above or send them the public portal.</p>
        </div>
      ) : (
        <div className="mc-card">
          <table className="mc-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Referral</th>
                <th>Coupon</th>
                <th>Earns</th>
                <th>Customer off</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((a) => {
                const commission = effectiveCommission(a, a.program);
                const discount = effectiveCustomerDiscount(a, a.program);
                return (
                <tr key={a.id}>
                  <td>
                    <Link to={`/app/affiliates/${a.id}`}>{a.name}</Link>
                  </td>
                  <td>{a.email}</td>
                  <td>
                    <code>{a.referralCode}</code>
                  </td>
                  <td>
                    <code>{a.couponCode || "—"}</code>
                  </td>
                  <td>{formatRate(commission)}</td>
                  <td>{formatRate(discount)}</td>
                  <td>
                    <StatusBadge status={a.status} />
                  </td>
                  <td>
                    {a.status === "PENDING" && (
                      <Form method="post" className="mc-row">
                        <input type="hidden" name="intent" value="decide" />
                        <input type="hidden" name="id" value={a.id} />
                        <button className="mc-btn" name="status" value="APPROVED" type="submit">
                          Approve
                        </button>
                        <button
                          className="mc-btn secondary"
                          name="status"
                          value="REJECTED"
                          type="submit"
                        >
                          Reject
                        </button>
                      </Form>
                    )}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
