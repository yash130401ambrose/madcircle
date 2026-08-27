import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { attributeOrder } from "../lib/commissions.server";
import { tagOrderWithAffiliate } from "../lib/shopify-orders.server";

type Discount = { code?: string };
type NoteAttr = { name?: string; value?: string };

function extractReferralCode(order: {
  landing_site?: string;
  referring_site?: string;
  note_attributes?: NoteAttr[];
  note?: string;
}): string | null {
  const attrs = order.note_attributes || [];
  for (const a of attrs) {
    const key = (a.name || "").toLowerCase();
    if (key === "mc_ref" || key === "madcircle_ref" || key === "referral") {
      const v = (a.value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (v) return v;
    }
  }
  const haystack = `${order.landing_site || ""} ${order.referring_site || ""} ${order.note || ""}`;
  const refMatch = haystack.match(/(?:mc_ref|madcircle_ref)=([A-Z0-9]+)/i);
  return refMatch?.[1]?.toUpperCase() ?? null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload, topic, session, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} for ${shop}`);

  // App may already be uninstalled — still ack the webhook.
  if (!session) return new Response();

  const order = payload as {
    admin_graphql_api_id?: string;
    id?: number;
    name?: string;
    total_price?: string;
    discount_codes?: Discount[];
    landing_site?: string;
    referring_site?: string;
    note_attributes?: NoteAttr[];
    note?: string;
  };

  const codes = (order.discount_codes || [])
    .map((d) => (d.code || "").toUpperCase())
    .filter(Boolean);
  const referralCode = extractReferralCode(order);

  const rupees = Number(order.total_price || 0);
  const result = await attributeOrder({
    shop,
    shopifyOrderId: order.admin_graphql_api_id || String(order.id),
    shopifyOrderName: order.name || String(order.id),
    orderTotalPaise: Math.round(rupees * 100),
    discountCodes: codes,
    referralCode,
  });

  if (result && "commission" in result && result.commission && admin) {
    try {
      await tagOrderWithAffiliate(admin, {
        orderGid: order.admin_graphql_api_id || "",
        referralCode: referralCode || codes[0] || "madcircle",
      });
    } catch (e) {
      console.warn("Order tag failed", e);
    }
  }

  return new Response();
};
