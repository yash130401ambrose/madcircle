import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const entries = await prisma.blockListEntry.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });
  return { entries };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent"));
  if (intent === "add") {
    await prisma.blockListEntry.create({
      data: {
        shop: session.shop,
        kind: String(form.get("kind") || "EMAIL"),
        value: String(form.get("value") || "").trim(),
        reason: String(form.get("reason") || ""),
      },
    });
  }
  if (intent === "delete") {
    await prisma.blockListEntry.delete({ where: { id: String(form.get("id")) } });
  }
  return null;
};

export default function Fraud() {
  const { entries } = useLoaderData<typeof loader>();
  return (
    <div className="mc-shell">
      <TitleBar title="Fraud & protection" />
      <h1 className="mc-h1">Fraud & protection</h1>
      <p className="mc-lead">
        Block emails, phones, IPs, or leaked coupons. Duplicate device/IP clustering lands in activity
        when orders are attributed.
      </p>
      <Form method="post" className="mc-card mc-row" style={{ marginBottom: 16 }}>
        <input type="hidden" name="intent" value="add" />
        <select className="mc-select" name="kind" style={{ margin: 0, width: 140 }}>
          <option value="EMAIL">Email</option>
          <option value="PHONE">Phone</option>
          <option value="IP">IP</option>
          <option value="COUPON">Coupon</option>
        </select>
        <input className="mc-input" name="value" placeholder="Value to block" required style={{ margin: 0, flex: 1 }} />
        <input className="mc-input" name="reason" placeholder="Reason" style={{ margin: 0, flex: 1 }} />
        <button className="mc-btn" type="submit">
          Add to block list
        </button>
      </Form>
      <div className="mc-card">
        <table className="mc-table">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Value</th>
              <th>Reason</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>{e.kind}</td>
                <td>{e.value}</td>
                <td>{e.reason}</td>
                <td>
                  <Form method="post">
                    <input type="hidden" name="intent" value="delete" />
                    <input type="hidden" name="id" value={e.id} />
                    <button className="mc-btn secondary" type="submit">
                      Remove
                    </button>
                  </Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
