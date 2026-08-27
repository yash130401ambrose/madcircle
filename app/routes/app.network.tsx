import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateMerchant, logActivity } from "../lib/merchant.server";
import { copyMembershipFromTemplate } from "../lib/profile.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const programs = await prisma.program.findMany({ where: { merchantId: merchant.id } });
  const creators = await prisma.network.listPublicCreators();
  const myAffiliates = await prisma.affiliate.findMany({
    where: { programId: { in: programs.map((p: { id: string }) => p.id) } },
  });
  const myEmails = new Set(myAffiliates.map((a: { email: string }) => a.email));

  const url = new URL(request.url);
  const niche = (url.searchParams.get("niche") || "").toLowerCase();
  const city = (url.searchParams.get("city") || "").toLowerCase();

  const filtered = (creators as Array<Record<string, unknown>>).filter((c) => {
    if (niche && !String(c.niches || "").toLowerCase().includes(niche)) return false;
    if (city && !String(c.city || "").toLowerCase().includes(city)) return false;
    return true;
  });

  return {
    creators: filtered as any[],
    programs,
    myEmails: [...myEmails],
    niche,
    city,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const form = await request.formData();
  const creatorId = String(form.get("creatorId") || "");
  const programId = String(form.get("programId") || "");

  const program = await prisma.program.findUnique({ where: { id: programId } });
  if (!program || program.merchantId !== merchant.id) {
    return { error: "Invalid program." };
  }

  const creator = await prisma.affiliate.findUnique({ where: { id: creatorId } });
  if (!creator || !creator.profilePublic) {
    return { error: "Creator not available." };
  }

  const result = await copyMembershipFromTemplate({
    programId: program.id,
    email: creator.email,
    name: creator.name,
    passwordHash: creator.passwordHash,
    template: creator,
    autoApprove: false,
  });

  if (!result.created) {
    return { error: "This creator is already on your program." };
  }

  await logActivity(session.shop, `Invited ${creator.name} to ${program.name} from Network`);
  return { ok: true, name: creator.name };
};

export default function Network() {
  const { creators, programs, myEmails, niche, city } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const mine = new Set(myEmails);
  const defaultProgram = programs[0]?.id || "";

  return (
    <div className="mc-shell">
      <TitleBar title="Network" />
      <h1 className="mc-h1">Creator directory</h1>
      <p className="mc-lead">
        Invite MadCircle partners into your program. They appear under Affiliates with the same
        Supabase row.
      </p>

      {actionData && "ok" in actionData && actionData.ok ? (
        <p style={{ color: "var(--mc-success)" }}>
          Invited {actionData.name}. Review them under{" "}
          <Link to="/app/affiliates">Affiliates</Link>.
        </p>
      ) : null}
      {actionData && "error" in actionData && actionData.error ? (
        <p style={{ color: "var(--mc-danger)" }}>{actionData.error}</p>
      ) : null}

      <Form method="get" className="mc-row" style={{ marginBottom: 20 }}>
        <input
          className="mc-input"
          style={{ maxWidth: 200, marginBottom: 0 }}
          name="niche"
          placeholder="Niche"
          defaultValue={niche}
        />
        <input
          className="mc-input"
          style={{ maxWidth: 160, marginBottom: 0 }}
          name="city"
          placeholder="City"
          defaultValue={city}
        />
        <button className="mc-btn secondary" type="submit">
          Filter
        </button>
      </Form>

      {!programs.length ? (
        <p>Create a program first, then invite creators.</p>
      ) : (
        <div className="mc-directory">
          {creators.map(
            (c: {
              id: string;
              name: string;
              email: string;
              photoUrl?: string;
              bio?: string;
              city?: string;
              niches?: string;
              audienceBand?: string;
              instagram?: string;
              youtube?: string;
              linkedin?: string;
              program?: { name?: string; merchant?: { publicName?: string; shopName?: string } };
            }) => (
              <div key={c.id} className="mc-directory-card">
                <div className="mc-row" style={{ marginBottom: 10 }}>
                  {c.photoUrl ? (
                    <img src={c.photoUrl} alt="" className="mc-avatar" />
                  ) : (
                    <div className="mc-avatar mc-avatar-empty">{c.name.slice(0, 1)}</div>
                  )}
                  <div>
                    <strong>{c.name}</strong>
                    <p className="mc-lead" style={{ marginBottom: 0 }}>
                      {[c.city, c.niches, c.audienceBand].filter(Boolean).join(" · ") || "Partner"}
                    </p>
                  </div>
                </div>
                <p>{c.bio || "No bio yet."}</p>
                <p className="mc-lead">
                  {[c.instagram, c.youtube, c.linkedin].filter(Boolean).join(" · ") || "No socials"}
                </p>
                {mine.has(c.email) ? (
                  <p style={{ color: "var(--mc-muted)" }}>Already on your program</p>
                ) : (
                  <Form method="post" className="mc-row">
                    <input type="hidden" name="creatorId" value={c.id} />
                    <select
                      className="mc-select"
                      name="programId"
                      defaultValue={defaultProgram}
                      style={{ marginBottom: 0, maxWidth: 220 }}
                    >
                      {programs.map((p: { id: string; name: string }) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button className="mc-btn" type="submit">
                      Invite to program
                    </button>
                  </Form>
                )}
              </div>
            ),
          )}
          {!creators.length && (
            <div className="mc-empty">
              <p>No public creators match. Ask partners to complete profiles and opt into the directory.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
