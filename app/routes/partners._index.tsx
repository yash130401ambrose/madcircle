import { Link, useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { HERO_IMAGE } from "../lib/imagery";
import prisma from "../db.server";

export const loader = async (_args: LoaderFunctionArgs) => {
  const programs = await prisma.network.listPublicPrograms();
  const creators = await prisma.network.listPublicCreators();
  return {
    brandCount: programs.length,
    creatorCount: creators.length,
  };
};

export default function PartnersLanding() {
  const { brandCount, creatorCount } = useLoaderData<typeof loader>();
  return (
    <div>
      <section className="mc-hero">
        <img
          src={HERO_IMAGE}
          alt="Aerial switchback mountain road climbing toward a summit, golden hour"
        />
        <div className="mc-hero-scrim" />
        <div className="mc-hero-copy">
          <p className="mc-brand-mark">MadCircle</p>
          <h1>The India trade partner network for Shopify brands.</h1>
          <p>
            Creators and planners earn INR commissions. Brands hire from one directory — same ledger
            as the Shopify app.
          </p>
          <div className="mc-row" style={{ marginTop: 20 }}>
            <Link to="/partners/signup" className="mc-btn" style={{ textDecoration: "none" }}>
              Apply as a partner
            </Link>
            <Link to="/partners/brands" style={{ color: "#fff" }}>
              Browse brands
            </Link>
          </div>
        </div>
      </section>

      <div className="mc-shell">
        <p className="mc-proof">
          {brandCount > 0 ? `${brandCount} open program${brandCount === 1 ? "" : "s"}` : "Programs opening"}{" "}
          ·{" "}
          {creatorCount > 0
            ? `${creatorCount} public creator${creatorCount === 1 ? "" : "s"}`
            : "Creators joining"}{" "}
          · INR · PAN/GST ready · Manual payouts
        </p>

        <h2 className="mc-section-title">How it works</h2>
        <p className="mc-lead">Three steps. One database shared with the brand’s Shopify app.</p>
        <div className="mc-steps">
          <div>
            <span className="mc-step-num">1</span>
            <h3>Build your profile</h3>
            <p>Photo, city, niches, and socials — your resume for brands on MadCircle.</p>
          </div>
          <div>
            <span className="mc-step-num">2</span>
            <h3>Join open programs</h3>
            <p>Apply to Hangover Fix and other listed Shopify brands from one partner account.</p>
          </div>
          <div>
            <span className="mc-step-num">3</span>
            <h3>Share and get paid</h3>
            <p>Unique link + coupon. Brands mark UPI or bank payouts; you see the ledger.</p>
          </div>
        </div>

        <h2 className="mc-section-title">Built for India commerce</h2>
        <p className="mc-lead">
          No platform cut of your sales. TDS-ready records. Cookie tracking plus claims when
          checkout misses the cookie.
        </p>
        <div className="mc-row" style={{ marginTop: 8 }}>
          <Link to="/partners/signup" className="mc-btn" style={{ textDecoration: "none" }}>
            Start application
          </Link>
          <Link to="/partners/login" className="mc-btn secondary" style={{ textDecoration: "none" }}>
            Partner login
          </Link>
        </div>
      </div>
    </div>
  );
}
