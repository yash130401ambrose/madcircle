import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import prisma from "../db.server";
import {
  createAffiliateSession,
  hashPassword,
  makeReferralCode,
} from "../lib/affiliate-auth.server";
import { isValidGstin, isValidPan } from "../lib/format";
import { parseProfileFromForm } from "../lib/profile.server";
import { uploadAffiliateAvatar } from "../lib/storage.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const preselect = url.searchParams.get("program") || "";
  const programs = await prisma.network.listPublicPrograms();
  const fallback = await prisma.program.findFirst({ orderBy: { createdAt: "asc" } });
  const list =
    programs.length > 0
      ? programs
      : fallback
        ? [{ ...fallback, merchant: null }]
        : [];
  return { programs: list, preselect };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const programId = String(form.get("programId") || "");
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program || program.status !== "ACTIVE") {
    return { error: "Choose an open program." };
  }

  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").toLowerCase().trim();
  const password = String(form.get("password") || "");
  const phone = String(form.get("phone") || "");
  const pan = String(form.get("pan") || "").toUpperCase();
  const gstin = String(form.get("gstin") || "").toUpperCase();
  const parentCode = String(form.get("parentCode") || "").toUpperCase();
  const profile = parseProfileFromForm(form);

  if (!name || !email || password.length < 8) {
    return { error: "Name, email, and 8+ character password required." };
  }
  if (program.collectPanGst) {
    if (!isValidPan(pan)) return { error: "PAN format looks invalid." };
    if (!isValidGstin(gstin)) return { error: "GSTIN format looks invalid." };
  }

  const existing = await prisma.affiliate.findFirst({ where: { email, programId: program.id } });
  if (existing) return { error: "You already applied to this program. Log in instead." };

  const parent = parentCode
    ? await prisma.affiliate.findUnique({ where: { referralCode: parentCode } })
    : null;

  const referralCode = makeReferralCode(name);
  const affiliate = await prisma.affiliate.create({
    data: {
      programId: program.id,
      name,
      email,
      phone,
      pan,
      gstin,
      passwordHash: await hashPassword(password),
      status: program.autoApprove ? "APPROVED" : "PENDING",
      referralCode,
      couponCode: referralCode.slice(0, 12),
      parentId: parent?.id,
      ...profile,
    },
  });

  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    try {
      const photoUrl = await uploadAffiliateAvatar(affiliate.id, photo);
      if (photoUrl) {
        await prisma.affiliate.update({ where: { id: affiliate.id }, data: { photoUrl } });
      }
    } catch {
      // Profile still created without photo
    }
  }

  return createAffiliateSession(affiliate.id, "/partners/dashboard");
};

export default function Signup() {
  const { programs, preselect } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <div className="mc-shell" style={{ maxWidth: 560 }}>
      <h1 className="mc-h1">Apply as a partner</h1>
      <p className="mc-lead">
        Pick a brand program, then add your profile. Brands see the same record in their Shopify app.
      </p>
      {!programs.length ? (
        <p>No programs are open yet. Check back soon.</p>
      ) : (
        <Form method="post" encType="multipart/form-data" className="mc-card">
          {actionData && "error" in actionData && actionData.error ? (
            <p style={{ color: "var(--mc-danger)" }}>{actionData.error}</p>
          ) : null}
          <label className="mc-label">Program</label>
          <select
            className="mc-select"
            name="programId"
            required
            defaultValue={preselect || programs[0]?.id}
          >
            {programs.map((p: { id: string; name: string; merchant?: { publicName?: string; shopName?: string } | null }) => (
              <option key={p.id} value={p.id}>
                {p.merchant?.publicName || p.merchant?.shopName || p.name} — {p.name}
              </option>
            ))}
          </select>
          <label className="mc-label">Full name</label>
          <input className="mc-input" name="name" required />
          <label className="mc-label">Email</label>
          <input className="mc-input" name="email" type="email" required />
          <label className="mc-label">Password</label>
          <input className="mc-input" name="password" type="password" minLength={8} required />
          <label className="mc-label">Phone</label>
          <input className="mc-input" name="phone" />
          <label className="mc-label">Photo</label>
          <input className="mc-input" name="photo" type="file" accept="image/*" />
          <label className="mc-label">Bio</label>
          <textarea className="mc-textarea" name="bio" rows={3} placeholder="One or two lines about how you sell" />
          <label className="mc-label">City / region</label>
          <input className="mc-input" name="city" placeholder="Mumbai" />
          <label className="mc-label">Niches (comma-separated)</label>
          <input className="mc-input" name="niches" placeholder="Wedding planner, retailer, creator" />
          <label className="mc-label">Audience size</label>
          <select className="mc-select" name="audienceBand" defaultValue="">
            <option value="">Prefer not to say</option>
            <option value="<1k">&lt;1k</option>
            <option value="1k-10k">1k–10k</option>
            <option value="10k-50k">10k–50k</option>
            <option value="50k-100k">50k–100k</option>
            <option value="100k+">100k+</option>
            <option value="offline">Mostly offline / trade</option>
          </select>
          <label className="mc-label">Instagram</label>
          <input className="mc-input" name="instagram" placeholder="@handle or URL" />
          <label className="mc-label">YouTube</label>
          <input className="mc-input" name="youtube" />
          <label className="mc-label">LinkedIn</label>
          <input className="mc-input" name="linkedin" />
          <label className="mc-label">
            <input type="checkbox" name="profilePublic" defaultChecked /> Show me in the creator directory
          </label>
          <label className="mc-label">PAN</label>
          <input className="mc-input" name="pan" maxLength={10} />
          <label className="mc-label">GSTIN</label>
          <input className="mc-input" name="gstin" maxLength={15} />
          <label className="mc-label">Invited by (referral code)</label>
          <input className="mc-input" name="parentCode" />
          <button className="mc-btn" type="submit">
            Submit application
          </button>
          <p className="mc-lead" style={{ marginTop: 12, marginBottom: 0 }}>
            Already applied? <Link to="/partners/login">Log in</Link>
          </p>
        </Form>
      )}
    </div>
  );
}
