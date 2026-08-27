import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getOrCreateMerchant } from "../lib/merchant.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const programs = await prisma.program.findMany({ where: { merchantId: merchant.id } });
  return { programs };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const merchant = await getOrCreateMerchant(session.shop);
  const form = await request.formData();
  const id = String(form.get("id"));
  await prisma.program.update({
    where: { id },
    data: {
      name: String(form.get("name")),
      description: String(form.get("description") || ""),
      terms: String(form.get("terms") || ""),
      commissionType: String(form.get("commissionType")),
      commissionValue: Number(form.get("commissionValue")),
      customerDiscountType: String(form.get("customerDiscountType") || "PERCENT"),
      customerDiscountValue: Number(form.get("customerDiscountValue") || 10),
      cookieDays: Number(form.get("cookieDays") || 30),
      autoApprove: form.get("autoApprove") === "on",
      mlmEnabled: form.get("mlmEnabled") === "on",
      mlmOverridePercent: Number(form.get("mlmOverridePercent") || 0),
      openForApplications: form.get("openForApplications") === "on",
      networkListed: form.get("networkListed") === "on",
    },
  });
  return { merchantId: merchant.id };
};

export default function Programs() {
  const { programs } = useLoaderData<typeof loader>();
  return (
    <div className="mc-shell">
      <TitleBar title="Programs" />
      <h1 className="mc-h1">Programs</h1>
      <p className="mc-lead">
        Defaults for every partner. Override commission or customer discount on each affiliate’s
        detail page when needed.
      </p>
      {programs.map((p) => (
        <Form method="post" key={p.id} className="mc-card" style={{ marginBottom: 16 }}>
          <input type="hidden" name="id" value={p.id} />
          <label className="mc-label">Name</label>
          <input className="mc-input" name="name" defaultValue={p.name} />
          <label className="mc-label">Description</label>
          <textarea className="mc-textarea" name="description" rows={3} defaultValue={p.description} />
          <label className="mc-label">Terms</label>
          <textarea className="mc-textarea" name="terms" rows={3} defaultValue={p.terms} />

          <h3 style={{ marginBottom: 8 }}>Default partner commission</h3>
          <label className="mc-label">Commission type</label>
          <select className="mc-select" name="commissionType" defaultValue={p.commissionType}>
            <option value="PERCENT">Percent of order</option>
            <option value="FLAT">Flat ₹</option>
          </select>
          <label className="mc-label">Commission value</label>
          <input
            className="mc-input"
            name="commissionValue"
            type="number"
            step="0.5"
            defaultValue={p.commissionValue}
          />

          <h3 style={{ marginBottom: 8 }}>Default customer discount (coupon)</h3>
          <label className="mc-label">Discount type</label>
          <select
            className="mc-select"
            name="customerDiscountType"
            defaultValue={p.customerDiscountType || "PERCENT"}
          >
            <option value="PERCENT">Percent off</option>
            <option value="FLAT">Flat ₹ off</option>
          </select>
          <label className="mc-label">Discount value</label>
          <input
            className="mc-input"
            name="customerDiscountValue"
            type="number"
            step="0.5"
            defaultValue={p.customerDiscountValue ?? 10}
          />

          <label className="mc-label">Cookie duration (days)</label>
          <input className="mc-input" name="cookieDays" type="number" defaultValue={p.cookieDays} />
          <label className="mc-label">
            <input type="checkbox" name="autoApprove" defaultChecked={p.autoApprove} /> Auto-approve
            applicants
          </label>
          <label className="mc-label">
            <input type="checkbox" name="mlmEnabled" defaultChecked={p.mlmEnabled} /> One-level MLM
            override
          </label>
          <label className="mc-label">MLM override %</label>
          <input
            className="mc-input"
            name="mlmOverridePercent"
            type="number"
            step="0.5"
            defaultValue={p.mlmOverridePercent}
          />
          <label className="mc-label">
            <input
              type="checkbox"
              name="openForApplications"
              defaultChecked={p.openForApplications !== false}
            />{" "}
            Open for partner applications
          </label>
          <label className="mc-label">
            <input type="checkbox" name="networkListed" defaultChecked={p.networkListed !== false} />{" "}
            List on MadCircle Network (partners/brands)
          </label>
          <button className="mc-btn" type="submit">
            Save program
          </button>
        </Form>
      ))}
    </div>
  );
}
