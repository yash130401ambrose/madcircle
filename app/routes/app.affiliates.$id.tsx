import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { formatInr } from "../lib/format";
import { StatusBadge } from "../components/StatusBadge";
import { profileCompleteness } from "../lib/profile.server";
import { updateAffiliateCodes } from "../lib/codes.server";
import { getOrCreateMerchant, logActivity } from "../lib/merchant.server";
import {
  effectiveCommission,
  effectiveCustomerDiscount,
  formatRate,
  parseOverrideFromForm,
} from "../lib/rates";
import { ensureShopifyDiscountCode } from "../lib/shopify-discount.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: params.id },
    include: { commissions: true, program: true },
  });
  if (!affiliate) throw new Response("Not found", { status: 404 });
  if (affiliate.program?.merchantId !== merchant.id) {
    throw new Response("Not found", { status: 404 });
  }
  const program = affiliate.program;
  const commissions = (affiliate.commissions || []) as Array<{
    status: string;
    amountPaise: number;
    id: string;
    shopifyOrderName?: string;
    shopifyOrderId: string;
    source: string;
  }>;
  const earned = commissions.reduce(
    (s, c) => s + (c.status === "VOID" ? 0 : c.amountPaise),
    0,
  );
  const origin = (process.env.SHOPIFY_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const commissionRate = effectiveCommission(affiliate, program);
  const discountRate = effectiveCustomerDiscount(affiliate, program);
  return {
    affiliate,
    program,
    earned,
    completeness: profileCompleteness(affiliate),
    link: `${origin}/r/${affiliate.referralCode}`,
    commissionRate,
    discountRate,
    usingProgramCommission: affiliate.commissionValueOverride == null,
    usingProgramDiscount: affiliate.customerDiscountValueOverride == null,
  };
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: params.id },
    include: { program: true },
  });
  if (!affiliate || affiliate.program?.merchantId !== merchant.id) {
    return { error: "Not found" };
  }

  const form = await request.formData();
  const intent = String(form.get("intent") || "codes");

  if (intent === "codes") {
    const result = await updateAffiliateCodes({
      affiliateId: affiliate.id,
      referralCode: String(form.get("referralCode") || ""),
      couponCode: String(form.get("couponCode") || ""),
    });
    if ("error" in result && result.error) return { error: result.error };
    await logActivity(
      session.shop,
      `Updated codes for ${affiliate.name}: ${result.affiliate?.referralCode} / ${result.affiliate?.couponCode}`,
    );
    return { ok: true, which: "codes" };
  }

  if (intent === "rates") {
    const commission = parseOverrideFromForm(
      form,
      "commissionType",
      "commissionValue",
      "useProgramCommission",
    );
    const discount = parseOverrideFromForm(
      form,
      "customerDiscountType",
      "customerDiscountValue",
      "useProgramDiscount",
    );

    const updated = await prisma.affiliate.update({
      where: { id: affiliate.id },
      data: {
        commissionTypeOverride: commission.type,
        commissionValueOverride: commission.value,
        customerDiscountTypeOverride: discount.type,
        customerDiscountValueOverride: discount.value,
      },
    });

    const rate = effectiveCustomerDiscount(updated, affiliate.program);
    let discountNote = "";
    if (updated.couponCode) {
      const created = await ensureShopifyDiscountCode(admin, {
        title: `MadCircle ${updated.name}`,
        code: updated.couponCode,
        rate,
      });
      if (created.id) {
        await prisma.affiliate.update({
          where: { id: updated.id },
          data: { shopifyDiscountId: created.id },
        });
      } else if (created.errors.length) {
        discountNote =
          " Rates saved in MadCircle. Shopify discount may need a manual update in Admin → Discounts.";
      }
    }

    await logActivity(
      session.shop,
      `Updated rates for ${affiliate.name}: commission ${formatRate(effectiveCommission(updated, affiliate.program))}, customer ${formatRate(rate)}`,
    );
    return { ok: true, which: "rates", discountNote };
  }

  return { error: "Unknown action" };
};

export default function AffiliateDetail() {
  const {
    affiliate,
    program,
    earned,
    completeness,
    link,
    commissionRate,
    discountRate,
    usingProgramCommission,
    usingProgramDiscount,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <div className="mc-shell">
      <TitleBar title={affiliate.name} />
      <p>
        <Link to="/app/affiliates">← Affiliates</Link>
      </p>
      <div className="mc-row" style={{ gap: 16, marginBottom: 12 }}>
        {affiliate.photoUrl ? (
          <img src={affiliate.photoUrl} alt="" className="mc-avatar" />
        ) : (
          <div className="mc-avatar mc-avatar-empty">{affiliate.name.slice(0, 1)}</div>
        )}
        <div>
          <h1 className="mc-h1">{affiliate.name}</h1>
          <p className="mc-lead" style={{ marginBottom: 0 }}>
            {affiliate.email} · PAN {affiliate.pan || "—"} · GSTIN {affiliate.gstin || "—"}
          </p>
        </div>
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Creator profile ({completeness}%)</h2>
        <p>{affiliate.bio || "No bio yet."}</p>
        <p className="mc-lead">
          {[affiliate.city, affiliate.niches, affiliate.audienceBand].filter(Boolean).join(" · ") ||
            "Location / niches not set"}
        </p>
        <p className="mc-lead">
          {[affiliate.instagram, affiliate.youtube, affiliate.linkedin].filter(Boolean).join(" · ") ||
            "No socials"}
        </p>
        <p className="mc-lead">
          Directory: {affiliate.profilePublic ? "Public" : "Hidden"}
        </p>
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Commission & customer discount</h2>
        <p className="mc-lead">
          Program defaults: commission {formatRate({ type: program.commissionType, value: program.commissionValue })}{" "}
          · customer discount{" "}
          {formatRate({
            type: program.customerDiscountType || "PERCENT",
            value: program.customerDiscountValue ?? 10,
          })}
          . Override below for this partner only.
        </p>
        <p className="mc-lead">
          Effective now: earns {formatRate(commissionRate)} · customers get {formatRate(discountRate)} off
        </p>
        {actionData && "ok" in actionData && actionData.ok && actionData.which === "rates" ? (
          <p style={{ color: "var(--mc-success)" }}>
            Rates saved.
            {"discountNote" in actionData && actionData.discountNote
              ? actionData.discountNote
              : ""}
          </p>
        ) : null}
        {actionData && "error" in actionData && actionData.error ? (
          <p style={{ color: "var(--mc-danger)" }}>{actionData.error}</p>
        ) : null}
        <Form method="post">
          <input type="hidden" name="intent" value="rates" />
          <label className="mc-label">
            <input
              type="checkbox"
              name="useProgramCommission"
              defaultChecked={usingProgramCommission}
            />{" "}
            Use program default commission
          </label>
          <label className="mc-label">Partner commission type</label>
          <select
            className="mc-select"
            name="commissionType"
            defaultValue={affiliate.commissionTypeOverride || program.commissionType}
          >
            <option value="PERCENT">Percent of order</option>
            <option value="FLAT">Flat ₹</option>
          </select>
          <label className="mc-label">Partner commission value</label>
          <input
            className="mc-input"
            name="commissionValue"
            type="number"
            step="0.5"
            min={0}
            defaultValue={
              affiliate.commissionValueOverride != null
                ? affiliate.commissionValueOverride
                : program.commissionValue
            }
          />

          <label className="mc-label" style={{ marginTop: 12 }}>
            <input
              type="checkbox"
              name="useProgramDiscount"
              defaultChecked={usingProgramDiscount}
            />{" "}
            Use program default customer discount
          </label>
          <label className="mc-label">Customer discount type</label>
          <select
            className="mc-select"
            name="customerDiscountType"
            defaultValue={
              affiliate.customerDiscountTypeOverride || program.customerDiscountType || "PERCENT"
            }
          >
            <option value="PERCENT">Percent off</option>
            <option value="FLAT">Flat ₹ off</option>
          </select>
          <label className="mc-label">Customer discount value</label>
          <input
            className="mc-input"
            name="customerDiscountValue"
            type="number"
            step="0.5"
            min={0}
            defaultValue={
              affiliate.customerDiscountValueOverride != null
                ? affiliate.customerDiscountValueOverride
                : program.customerDiscountValue ?? 10
            }
          />
          <button className="mc-btn" type="submit">
            Save rates
          </button>
        </Form>
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Codes</h2>
        <p className="mc-lead">
          Two codes per partner: <strong>referral</strong> powers the tracking link;{" "}
          <strong>coupon</strong> is what shoppers type at checkout. They can match or differ.
          Changing the referral code breaks old shared links.
        </p>
        <p className="mc-lead">
          Live link:{" "}
          <a href={link} target="_blank" rel="noreferrer">
            {link}
          </a>
        </p>
        {actionData && "ok" in actionData && actionData.ok && actionData.which === "codes" ? (
          <p style={{ color: "var(--mc-success)" }}>Codes saved.</p>
        ) : null}
        <Form method="post">
          <input type="hidden" name="intent" value="codes" />
          <label className="mc-label">Referral code (link)</label>
          <input
            className="mc-input"
            name="referralCode"
            defaultValue={affiliate.referralCode}
            required
            minLength={4}
            maxLength={20}
            pattern="[A-Za-z0-9]+"
            title="Letters and numbers only"
          />
          <label className="mc-label">Coupon code (checkout)</label>
          <input
            className="mc-input"
            name="couponCode"
            defaultValue={affiliate.couponCode || ""}
            required
            minLength={4}
            maxLength={20}
            pattern="[A-Za-z0-9]+"
            title="Letters and numbers only"
          />
          <button className="mc-btn" type="submit">
            Save codes
          </button>
        </Form>
      </div>

      <div className="mc-grid-kpi">
        <div className="mc-card">
          <p className="mc-kpi-label">Lifetime commission</p>
          <p className="mc-kpi-value">{formatInr(earned)}</p>
        </div>
        <div className="mc-card">
          <p className="mc-kpi-label">Status</p>
          <StatusBadge status={affiliate.status} />
        </div>
      </div>
      <div className="mc-card">
        <h2 style={{ marginTop: 0 }}>Commission history</h2>
        <table className="mc-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Source</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(
              affiliate.commissions as Array<{
                id: string;
                shopifyOrderName?: string;
                shopifyOrderId: string;
                source: string;
                amountPaise: number;
                status: string;
              }>
            ).map((c) => (
              <tr key={c.id}>
                <td>{c.shopifyOrderName || c.shopifyOrderId}</td>
                <td>{c.source}</td>
                <td>{formatInr(c.amountPaise)}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
