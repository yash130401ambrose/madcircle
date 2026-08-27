import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getOrCreateMerchant } from "../lib/merchant.server";
import { UPGRADE_IMAGE } from "../lib/imagery";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const appUrl = (process.env.SHOPIFY_APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  return {
    merchant,
    shop: session.shop,
    portalUrl: `${appUrl}/partners`,
    signupUrl: `${appUrl}/partners/signup`,
    loginUrl: `${appUrl}/partners/login`,
    brandsUrl: `${appUrl}/partners/brands`,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const form = await request.formData();
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      publicName: String(form.get("publicName") || "").trim(),
      publicBlurb: String(form.get("publicBlurb") || "").trim(),
      logoUrl: String(form.get("logoUrl") || "").trim(),
      websiteUrl: String(form.get("websiteUrl") || "").trim(),
      networkListed: form.get("networkListed") === "on",
    },
  });
  return { ok: true };
};

export default function Settings() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const m = data.merchant;
  return (
    <div className="mc-shell">
      <TitleBar title="Settings" />
      <h1 className="mc-h1">Settings</h1>
      <p className="mc-lead">Network listing controls how partners find you on MadCircle web.</p>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <p className="mc-kpi-label">Plan</p>
        <p className="mc-kpi-value">{m.plan}</p>
        <p>Store {data.shop}</p>
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Public brand profile</h2>
        {actionData && "ok" in actionData ? (
          <p style={{ color: "var(--mc-success)" }}>Saved.</p>
        ) : null}
        <Form method="post">
          <label className="mc-label">Public name</label>
          <input
            className="mc-input"
            name="publicName"
            defaultValue={m.publicName || m.shopName || ""}
            placeholder="Nutriline"
          />
          <label className="mc-label">Blurb for partners</label>
          <textarea
            className="mc-textarea"
            name="publicBlurb"
            rows={3}
            defaultValue={m.publicBlurb || ""}
            placeholder="Hangover Fix for wedding planners and retailers"
          />
          <label className="mc-label">Logo URL</label>
          <input className="mc-input" name="logoUrl" defaultValue={m.logoUrl || ""} />
          <label className="mc-label">Website</label>
          <input className="mc-input" name="websiteUrl" defaultValue={m.websiteUrl || ""} />
          <label className="mc-label">
            <input type="checkbox" name="networkListed" defaultChecked={m.networkListed !== false} />{" "}
            List my brand on MadCircle Network (programs still need “listed + open”)
          </label>
          <button className="mc-btn" type="submit">
            Save brand profile
          </button>
        </Form>
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Partner portal</h2>
        <p className="mc-lead">
          Open in a normal browser tab. Requires <code>npm run dev</code> (or your deployed host).
        </p>
        <p>
          Landing:{" "}
          <a href={data.portalUrl} target="_blank" rel="noreferrer">
            {data.portalUrl}
          </a>
        </p>
        <p>
          Brands directory:{" "}
          <a href={data.brandsUrl} target="_blank" rel="noreferrer">
            {data.brandsUrl}
          </a>
        </p>
        <p>
          Signup:{" "}
          <a href={data.signupUrl} target="_blank" rel="noreferrer">
            {data.signupUrl}
          </a>
        </p>
        <p>
          Login:{" "}
          <a href={data.loginUrl} target="_blank" rel="noreferrer">
            {data.loginUrl}
          </a>
        </p>
      </div>

      <div className="mc-card" style={{ marginBottom: 16 }}>
        <h2 style={{ marginTop: 0 }}>Orders & attribution</h2>
        <p className="mc-lead">
          Protected customer data is requested. The <code>orders/paid</code> webhook is enabled —
          commissions attribute from partner coupons or <code>mc_ref</code>, then the order is tagged{" "}
          <code>madcircle</code>.
        </p>
        <p className="mc-lead" style={{ marginBottom: 0 }}>
          App Store listing still needs real URLs (no “example”), an app icon, emergency contact, and
          listing language in Partners. That does not block local <code>npm run dev</code>.
        </p>
      </div>

      <div className="mc-card">
        <img
          src={UPGRADE_IMAGE}
          alt="Mountain road continuing toward the summit — next stretch of the program"
          style={{ width: "100%", height: 180, objectFit: "cover", borderRadius: 16 }}
        />
        <h2>App Store tiers later</h2>
        <p className="mc-lead">
          Free 50 orders/mo · Growth $19 · Pro $49. Billing is not wired yet — this launch is for
          Hangover Fix partners only.
        </p>
      </div>
    </div>
  );
}
