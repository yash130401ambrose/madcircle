import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const code = (params.code || "").toUpperCase();
  const affiliate = await prisma.affiliate.findUnique({
    where: { referralCode: code },
    include: { program: { include: { merchant: true } } },
  });
  if (!affiliate || affiliate.status !== "APPROVED") {
    throw new Response("Unknown partner link", { status: 404 });
  }

  const ip = request.headers.get("x-forwarded-for") || "";
  const userAgent = request.headers.get("user-agent") || "";
  await prisma.click.create({
    data: { affiliateId: affiliate.id, ip, userAgent, landing: request.url },
  });

  const shop = affiliate.program.merchant.shop;
  const dest = `https://${shop}?mc_ref=${encodeURIComponent(affiliate.referralCode)}`;
  const days = affiliate.program.cookieDays;
  const maxAge = days * 24 * 60 * 60;

  return redirect(dest, {
    headers: {
      "Set-Cookie": `mc_ref=${affiliate.referralCode}; Path=/; Max-Age=${maxAge}; SameSite=Lax`,
    },
  });
};
