import { createCookieSessionStorage, redirect } from "@remix-run/node";
import bcrypt from "bcryptjs";
import prisma from "../db.server";

const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: "mc_aff",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secrets: [process.env.AFFILIATE_SESSION_SECRET || "dev-only-change-me"],
    secure: process.env.NODE_ENV === "production",
  },
});

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createAffiliateSession(affiliateId: string, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set("affiliateId", affiliateId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

export async function destroyAffiliateSession(request: Request) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  return redirect("/partners/login", {
    headers: { "Set-Cookie": await sessionStorage.destroySession(session) },
  });
}

export async function switchAffiliateSession(
  request: Request,
  affiliateId: string,
  redirectTo: string,
) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  session.set("affiliateId", affiliateId);
  return redirect(redirectTo, {
    headers: { "Set-Cookie": await sessionStorage.commitSession(session) },
  });
}

export async function requireAffiliate(request: Request) {
  const affiliate = await requireAffiliateOptional(request);
  if (!affiliate) throw redirect("/partners/login");
  return affiliate;
}

export async function requireAffiliateOptional(request: Request) {
  const session = await sessionStorage.getSession(request.headers.get("Cookie"));
  const affiliateId = session.get("affiliateId") as string | undefined;
  if (!affiliateId) return null;
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    include: { program: { include: { merchant: true } } },
  });
  return affiliate;
}

export function makeReferralCode(name: string) {
  const slug = name.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase() || "PARTNER";
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${slug}${rand}`;
}
