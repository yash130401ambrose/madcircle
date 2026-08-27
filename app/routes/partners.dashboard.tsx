import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import {
  destroyAffiliateSession,
  requireAffiliate,
  switchAffiliateSession,
} from "../lib/affiliate-auth.server";
import { formatInr } from "../lib/format";
import { StatusBadge } from "../components/StatusBadge";
import prisma from "../db.server";
import {
  parseProfileFromForm,
  profileCompleteness,
  syncProfileByEmail,
} from "../lib/profile.server";
import { uploadAffiliateAvatar } from "../lib/storage.server";
import {
  effectiveCommission,
  effectiveCustomerDiscount,
  formatRate,
} from "../lib/rates";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const affiliate = await requireAffiliate(request);
  const origin = new URL(request.url).origin;
  const commissions = await prisma.commission.findMany({
    where: { affiliateId: affiliate.id },
    orderBy: { createdAt: "desc" },
  });
  const clicks = await prisma.click.count({ where: { affiliateId: affiliate.id } });
  const earned = commissions
    .filter((c: { status: string }) => c.status !== "VOID")
    .reduce((s: number, c: { amountPaise: number }) => s + c.amountPaise, 0);
  const pending = commissions
    .filter((c: { status: string }) => c.status === "PENDING" || c.status === "APPROVED")
    .reduce((s: number, c: { amountPaise: number }) => s + c.amountPaise, 0);

  const memberships = await prisma.affiliate.findMany({
    where: { email: affiliate.email },
    include: { program: { include: { merchant: true } } },
    orderBy: { createdAt: "desc" },
  });

  const completeness = profileCompleteness(affiliate);
  const program = (affiliate as { program?: Record<string, unknown> }).program;
  const commissionRate = program
    ? effectiveCommission(affiliate, program as { commissionType: string; commissionValue: number })
    : null;
  const discountRate = program
    ? effectiveCustomerDiscount(
        affiliate,
        program as {
          customerDiscountType?: string | null;
          customerDiscountValue?: number | null;
        },
      )
    : null;

  return {
    affiliate,
    memberships,
    completeness,
    link: `${origin}/r/${affiliate.referralCode}`,
    clicks,
    earned,
    pending,
    commissions,
    commissionRate,
    discountRate,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const intent = String(form.get("intent") || "logout");

  if (intent === "logout") {
    return destroyAffiliateSession(request);
  }

  const affiliate = await requireAffiliate(request);

  if (intent === "switch") {
    const nextId = String(form.get("affiliateId") || "");
    const next = await prisma.affiliate.findUnique({ where: { id: nextId } });
    if (!next || next.email !== affiliate.email) return { error: "Invalid membership." };
    return switchAffiliateSession(request, next.id, "/partners/dashboard");
  }

  if (intent === "profile") {
    const profile = parseProfileFromForm(form);
    const name = String(form.get("name") || "").trim();
    const phone = String(form.get("phone") || "").trim();
    const photo = form.get("photo");
    let photoUrl = affiliate.photoUrl as string;
    if (photo instanceof File && photo.size > 0) {
      try {
        const uploaded = await uploadAffiliateAvatar(affiliate.id, photo);
        if (uploaded) photoUrl = uploaded;
      } catch (e) {
        return { error: e instanceof Error ? e.message : "Photo upload failed" };
      }
    }
    await syncProfileByEmail(affiliate.email, {
      ...profile,
      name: name || affiliate.name,
      phone,
      photoUrl,
    });
    return { ok: true };
  }

  if (intent === "codes") {
    const { updateAffiliateCodes } = await import("../lib/codes.server");
    const result = await updateAffiliateCodes({
      affiliateId: affiliate.id,
      referralCode: String(form.get("referralCode") || ""),
      couponCode: String(form.get("couponCode") || ""),
    });
    if ("error" in result && result.error) return { error: result.error };
    return { codesOk: true };
  }

  return { error: "Unknown action" };
};

export default function PartnerDashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const a = data.affiliate;
  const programName =
    (a as { program?: { name?: string; merchant?: { publicName?: string; shopName?: string } } })
      .program?.name || "program";
  const brandName =
    (a as { program?: { merchant?: { publicName?: string; shopName?: string } } }).program?.merchant
      ?.publicName ||
    (a as { program?: { merchant?: { shopName?: string } } }).program?.merchant?.shopName ||
    programName;

  return (
    <div className="mc-shell">
      <div className="mc-row" style={{ justifyContent: "space-between" }}>
        <div className="mc-row" style={{ gap: 16 }}>
          {a.photoUrl ? (
            <img src={a.photoUrl} alt="" className="mc-avatar" />
          ) : (
            <div className="mc-avatar mc-avatar-empty">{a.name.slice(0, 1)}</div>
          )}
          <div>
            <h1 className="mc-h1">Hi, {a.name}</h1>
            <p className="mc-lead" style={{ marginBottom: 0 }}>
              Active: {brandName} · Profile {data.completeness}% complete
            </p>
          </div>
        </div>
        <div className="mc-row">
          <Link to="/partners/brands" className="mc-btn secondary" style={{ textDecoration: "none" }}>
            Browse brands
          </Link>
          <Form method="post">
            <input type="hidden" name="intent" value="logout" />
            <button className="mc-btn secondary" type="submit">
              Log out
            </button>
          </Form>
        </div>
      </div>

      <StatusBadge status={a.status} />
      {a.status !== "APPROVED" && (
        <p className="mc-lead">Your application is still in review. Stats unlock after approval.</p>
      )}

      {data.memberships.length > 1 && (
        <div className="mc-card" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Your brand memberships</h2>
          <div className="mc-directory">
            {data.memberships.map(
              (m: {
                id: string;
                status: string;
                program?: { name?: string; merchant?: { publicName?: string; shopName?: string } };
              }) => (
                <Form method="post" key={m.id} className="mc-directory-card">
                  <input type="hidden" name="intent" value="switch" />
                  <input type="hidden" name="affiliateId" value={m.id} />
                  <strong>
                    {m.program?.merchant?.publicName ||
                      m.program?.merchant?.shopName ||
                      m.program?.name}
                  </strong>
                  <p className="mc-lead" style={{ marginBottom: 8 }}>
                    {m.program?.name} · {m.status}
                    {m.id === a.id ? " · viewing" : ""}
                  </p>
                  {m.id !== a.id && (
                    <button className="mc-btn secondary" type="submit">
                      Switch
                    </button>
                  )}
                </Form>
              ),
            )}
          </div>
        </div>
      )}

      <div className="mc-grid-kpi">
        <div className="mc-card">
          <p className="mc-kpi-label">Commission earned</p>
          <p className="mc-kpi-value">{formatInr(data.earned)}</p>
        </div>
        <div className="mc-card">
          <p className="mc-kpi-label">Pending / unpaid</p>
          <p className="mc-kpi-value">{formatInr(data.pending)}</p>
        </div>
        <div className="mc-card">
          <p className="mc-kpi-label">You earn</p>
          <p className="mc-kpi-value" style={{ fontSize: 22 }}>
            {data.commissionRate ? formatRate(data.commissionRate) : "—"}
          </p>
        </div>
        <div className="mc-card">
          <p className="mc-kpi-label">Customers get</p>
          <p className="mc-kpi-value" style={{ fontSize: 22 }}>
            {data.discountRate ? `${formatRate(data.discountRate)} off` : "—"}
          </p>
        </div>
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <p className="mc-kpi-label">Referral link</p>
        <p>
          <a href={data.link}>{data.link}</a>
        </p>
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Edit your codes</h2>
        <p className="mc-lead">
          Referral code = your tracking link. Coupon code = what customers enter at checkout.
          You can keep them the same or set two different ones. Old links stop working if you
          change the referral code.
        </p>
        {actionData && "codesOk" in actionData && actionData.codesOk ? (
          <p style={{ color: "var(--mc-success)" }}>Codes updated.</p>
        ) : null}
        {actionData && "error" in actionData && actionData.error ? (
          <p style={{ color: "var(--mc-danger)" }}>{actionData.error}</p>
        ) : null}
        <Form method="post">
          <input type="hidden" name="intent" value="codes" />
          <label className="mc-label">Referral code</label>
          <input
            className="mc-input"
            name="referralCode"
            defaultValue={a.referralCode}
            required
            minLength={4}
            maxLength={20}
            pattern="[A-Za-z0-9]+"
          />
          <label className="mc-label">Coupon code</label>
          <input
            className="mc-input"
            name="couponCode"
            defaultValue={a.couponCode || ""}
            required
            minLength={4}
            maxLength={20}
            pattern="[A-Za-z0-9]+"
          />
          <button className="mc-btn" type="submit">
            Save codes
          </button>
        </Form>
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Your public profile</h2>
        <p className="mc-lead">What brands see in the MadCircle creator directory.</p>
        {actionData && "ok" in actionData && actionData.ok ? (
          <p style={{ color: "var(--mc-success)" }}>Profile saved across all your brand memberships.</p>
        ) : null}
        {actionData && "error" in actionData && actionData.error ? (
          <p style={{ color: "var(--mc-danger)" }}>{actionData.error}</p>
        ) : null}
        <Form method="post" encType="multipart/form-data">
          <input type="hidden" name="intent" value="profile" />
          <label className="mc-label">Name</label>
          <input className="mc-input" name="name" defaultValue={a.name} />
          <label className="mc-label">Phone</label>
          <input className="mc-input" name="phone" defaultValue={a.phone || ""} />
          <label className="mc-label">Photo</label>
          <input className="mc-input" name="photo" type="file" accept="image/*" />
          <label className="mc-label">Bio</label>
          <textarea className="mc-textarea" name="bio" rows={3} defaultValue={a.bio || ""} />
          <label className="mc-label">City</label>
          <input className="mc-input" name="city" defaultValue={a.city || ""} />
          <label className="mc-label">Niches</label>
          <input className="mc-input" name="niches" defaultValue={a.niches || ""} />
          <label className="mc-label">Audience</label>
          <select className="mc-select" name="audienceBand" defaultValue={a.audienceBand || ""}>
            <option value="">Prefer not to say</option>
            <option value="<1k">&lt;1k</option>
            <option value="1k-10k">1k–10k</option>
            <option value="10k-50k">10k–50k</option>
            <option value="50k-100k">50k–100k</option>
            <option value="100k+">100k+</option>
            <option value="offline">Mostly offline / trade</option>
          </select>
          <label className="mc-label">Instagram</label>
          <input className="mc-input" name="instagram" defaultValue={a.instagram || ""} />
          <label className="mc-label">YouTube</label>
          <input className="mc-input" name="youtube" defaultValue={a.youtube || ""} />
          <label className="mc-label">LinkedIn</label>
          <input className="mc-input" name="linkedin" defaultValue={a.linkedin || ""} />
          <label className="mc-label">
            <input type="checkbox" name="profilePublic" defaultChecked={a.profilePublic !== false} />{" "}
            Listed in creator directory
          </label>
          <button className="mc-btn" type="submit">
            Save profile
          </button>
        </Form>
      </div>

      <div className="mc-card">
        <h2 style={{ marginTop: 0 }}>Payout history</h2>
        <table className="mc-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {data.commissions.map((c: { id: string; shopifyOrderName: string; amountPaise: number; status: string; note: string }) => (
              <tr key={c.id}>
                <td>{c.shopifyOrderName}</td>
                <td>{formatInr(c.amountPaise)}</td>
                <td>
                  <StatusBadge status={c.status} />
                </td>
                <td>{c.note || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 16 }}>
          <Link to="/partners/claims">File a missed-attribution claim →</Link>
        </p>
      </div>
    </div>
  );
}
