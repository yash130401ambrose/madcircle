import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateMerchant, logActivity } from "../lib/merchant.server";
import { HERO_IMAGE } from "../lib/imagery";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  if (merchant.onboardedAt) throw redirect("/app");
  return { shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, redirect } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const form = await request.formData();
  const name = String(form.get("name") || "Hangover Fix Trade Partners");
  const commissionValue = Number(form.get("commissionValue") || 10);
  const customerDiscountValue = Number(form.get("customerDiscountValue") || 10);
  const slug = "hangover-fix";

  await prisma.program.upsert({
    where: { merchantId_slug: { merchantId: merchant.id, slug } },
    create: {
      merchantId: merchant.id,
      name,
      slug,
      description: "Trade partner program for Nutriline Hangover Fix.",
      terms: "Commissions are paid manually after order confirmation. Self-referrals are not allowed.",
      commissionType: "PERCENT",
      commissionValue,
      customerDiscountType: "PERCENT",
      customerDiscountValue,
      autoApprove: false,
      mlmEnabled: true,
      mlmOverridePercent: 2,
      collectPanGst: true,
    },
    update: { name, commissionValue, customerDiscountValue },
  });

  await prisma.merchant.update({
    where: { id: merchant.id },
    data: { onboardedAt: new Date(), shopName: "Nutriline", plan: "PRO" },
  });
  await logActivity(session.shop, `Program “${name}” created`);
  throw redirect("/app");
};

export default function Onboarding() {
  useLoaderData<typeof loader>();
  return (
    <div>
      <TitleBar title="Welcome to MadCircle" />
      <section className="mc-hero" style={{ minHeight: 280 }}>
        <img src={HERO_IMAGE} alt="Aerial winding mountain road toward a summit at golden hour" />
        <div className="mc-hero-scrim" />
        <div className="mc-hero-copy">
          <h1>Set up Hangover Fix partners</h1>
          <p>Three steps: name the program, set the default commission, invite your first planner.</p>
        </div>
      </section>
      <div className="mc-shell">
        <div className="mc-card" style={{ maxWidth: 520 }}>
          <Form method="post">
            <label className="mc-label" htmlFor="name">
              Program name
            </label>
            <input id="name" className="mc-input" name="name" defaultValue="Hangover Fix Trade Partners" />
            <label className="mc-label" htmlFor="commissionValue">
              Default commission (% of order)
            </label>
            <input
              id="commissionValue"
              className="mc-input"
              name="commissionValue"
              type="number"
              min={0}
              step="0.5"
              defaultValue={10}
            />
            <label className="mc-label" htmlFor="customerDiscountValue">
              Default customer discount (% off with partner coupon)
            </label>
            <input
              id="customerDiscountValue"
              className="mc-input"
              name="customerDiscountValue"
              type="number"
              min={0}
              step="0.5"
              defaultValue={10}
            />
            <p className="mc-lead">
              You can override commission and discount per partner later. One-level MLM override is
              on for this Nutriline launch.
            </p>
            <button className="mc-btn" type="submit">
              Create program
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
