import type { ActionFunctionArgs } from "@remix-run/node";
import { Form } from "@remix-run/react";
import prisma from "../db.server";
import { createAffiliateSession, verifyPassword } from "../lib/affiliate-auth.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const form = await request.formData();
  const email = String(form.get("email") || "").toLowerCase().trim();
  const password = String(form.get("password") || "");
  const rows = await prisma.affiliate.findMany({ where: { email } });
  const affiliate =
    rows.find((a: { status: string }) => a.status === "APPROVED") || rows[0];
  if (!affiliate || !(await verifyPassword(password, affiliate.passwordHash))) {
    return { error: "Invalid email or password" };
  }
  return createAffiliateSession(affiliate.id, "/partners/dashboard");
};

export default function Login() {
  return (
    <div className="mc-shell" style={{ maxWidth: 420 }}>
      <h1 className="mc-h1">Partner login</h1>
      <Form method="post" className="mc-card">
        <label className="mc-label">Email</label>
        <input className="mc-input" name="email" type="email" required />
        <label className="mc-label">Password</label>
        <input className="mc-input" name="password" type="password" required />
        <button className="mc-btn" type="submit">
          Log in
        </button>
      </Form>
    </div>
  );
}
