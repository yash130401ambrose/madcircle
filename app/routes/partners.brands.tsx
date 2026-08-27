import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { requireAffiliateOptional } from "../lib/affiliate-auth.server";
import prisma from "../db.server";
import { copyMembershipFromTemplate } from "../lib/profile.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const affiliate = await requireAffiliateOptional(request);
  const programs = await prisma.network.listPublicPrograms();
  let joined = new Set<string>();
  if (affiliate) {
    const mine = await prisma.affiliate.findMany({ where: { email: affiliate.email } });
    joined = new Set(mine.map((m: { programId: string }) => m.programId));
  }
  return { programs, joined: [...joined], loggedIn: Boolean(affiliate) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const affiliate = await requireAffiliateOptional(request);
  if (!affiliate) return { error: "Log in to apply to a brand." };

  const form = await request.formData();
  const programId = String(form.get("programId") || "");
  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program || !program.openForApplications || program.status !== "ACTIVE") {
    return { error: "This program is not accepting applications." };
  }

  const result = await copyMembershipFromTemplate({
    programId: program.id,
    email: affiliate.email,
    name: affiliate.name,
    passwordHash: affiliate.passwordHash,
    template: affiliate,
    autoApprove: program.autoApprove,
  });

  if (!result.created) {
    return { error: "You already have a membership on this program." };
  }

  return { ok: true, status: result.affiliate.status };
};

export default function PartnerBrands() {
  const { programs, joined, loggedIn } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const joinedSet = new Set(joined);

  return (
    <div className="mc-shell">
      <h1 className="mc-h1">Open brand programs</h1>
      <p className="mc-lead">
        Apply once — MadCircle writes the same Affiliate row your brand sees in Shopify Admin.
      </p>
      {actionData && "ok" in actionData && actionData.ok ? (
        <p style={{ color: "var(--mc-success)" }}>
          Application submitted ({String(actionData.status)}). Check your dashboard memberships.
        </p>
      ) : null}
      {actionData && "error" in actionData && actionData.error ? (
        <p style={{ color: "var(--mc-danger)" }}>{actionData.error}</p>
      ) : null}

      {!loggedIn && (
        <p className="mc-lead">
          <Link to="/partners/login">Log in</Link> or{" "}
          <Link to="/partners/signup">sign up</Link> to apply.
        </p>
      )}

      <div className="mc-directory">
        {programs.map(
          (p: {
            id: string;
            name: string;
            description: string;
            commissionType: string;
            commissionValue: number;
            merchant?: {
              publicName?: string;
              shopName?: string;
              publicBlurb?: string;
              websiteUrl?: string;
            } | null;
          }) => {
            const brand =
              p.merchant?.publicName || p.merchant?.shopName || p.name;
            const already = joinedSet.has(p.id);
            return (
              <div key={p.id} className="mc-directory-card">
                <strong>{brand}</strong>
                <p className="mc-lead" style={{ marginBottom: 8 }}>
                  {p.name}
                  {p.commissionType === "PERCENT"
                    ? ` · ${p.commissionValue}%`
                    : ` · ₹${p.commissionValue}`}
                </p>
                <p>{p.merchant?.publicBlurb || p.description || "Trade partner program."}</p>
                {p.merchant?.websiteUrl ? (
                  <p>
                    <a href={p.merchant.websiteUrl} target="_blank" rel="noreferrer">
                      Website
                    </a>
                  </p>
                ) : null}
                {already ? (
                  <p style={{ color: "var(--mc-muted)" }}>Already applied</p>
                ) : loggedIn ? (
                  <Form method="post">
                    <input type="hidden" name="programId" value={p.id} />
                    <button className="mc-btn" type="submit">
                      Apply
                    </button>
                  </Form>
                ) : (
                  <Link
                    to={`/partners/signup?program=${p.id}`}
                    className="mc-btn"
                    style={{ textDecoration: "none", display: "inline-block" }}
                  >
                    Apply
                  </Link>
                )}
              </div>
            );
          },
        )}
        {!programs.length && (
          <div className="mc-empty">
            <p>No brands are listed on the network yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
