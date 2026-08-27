type AdminGraphql = {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
};

export async function tagOrderWithAffiliate(
  admin: AdminGraphql,
  opts: { orderGid: string; referralCode: string },
) {
  if (!opts.orderGid.startsWith("gid://")) return;
  const tags = ["madcircle", `mc:${opts.referralCode}`.slice(0, 40)];
  await admin.graphql(
    `#graphql
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { message }
      }
    }`,
    { variables: { id: opts.orderGid, tags } },
  );
}

export type ShopifyOrderMatch = {
  id: string;
  name: string;
  phone: string;
  address: string;
  totalPaise: number;
  createdAt: string;
};

/** Recent orders with customer identity fields for claim matching. */
export async function fetchRecentOrdersForClaims(
  admin: AdminGraphql,
  opts: { days?: number; first?: number } = {},
): Promise<ShopifyOrderMatch[]> {
  const first = opts.first ?? 50;
  const days = opts.days ?? 30;
  const res = await admin.graphql(
    `#graphql
    query recentOrders($first: Int!) {
      orders(first: $first, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            totalPriceSet { shopMoney { amount } }
            customer { firstName lastName phone }
            shippingAddress { phone address1 city }
            billingAddress { phone address1 city }
          }
        }
      }
    }`,
    { variables: { first } },
  );
  const json = (await res.json()) as {
    data?: {
      orders?: {
        edges: Array<{
          node: {
            id: string;
            name: string;
            createdAt: string;
            totalPriceSet?: { shopMoney?: { amount?: string } };
            customer?: { firstName?: string; lastName?: string; phone?: string } | null;
            shippingAddress?: { phone?: string; address1?: string; city?: string } | null;
            billingAddress?: { phone?: string; address1?: string; city?: string } | null;
          };
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    console.warn("fetchRecentOrdersForClaims", json.errors);
    return [];
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return (json.data?.orders?.edges || [])
    .map((e) => e.node)
    .filter((o) => new Date(o.createdAt).getTime() >= cutoff)
    .map((o) => {
      const ship = o.shippingAddress;
      const bill = o.billingAddress;
      const amount = Number(o.totalPriceSet?.shopMoney?.amount || 0);
      return {
        id: o.id,
        name: `${o.customer?.firstName || ""} ${o.customer?.lastName || ""}`.trim(),
        phone: ship?.phone || bill?.phone || o.customer?.phone || "",
        address: `${ship?.address1 || bill?.address1 || ""} ${ship?.city || bill?.city || ""}`.trim(),
        totalPaise: Math.round(amount * 100),
        createdAt: o.createdAt,
      };
    });
}

export async function fetchOrderTotalPaise(admin: AdminGraphql, orderGid: string) {
  if (!orderGid.startsWith("gid://")) return 0;
  const res = await admin.graphql(
    `#graphql
    query orderTotal($id: ID!) {
      order(id: $id) {
        totalPriceSet { shopMoney { amount } }
      }
    }`,
    { variables: { id: orderGid } },
  );
  const json = (await res.json()) as {
    data?: { order?: { totalPriceSet?: { shopMoney?: { amount?: string } } } | null };
  };
  const amount = Number(json.data?.order?.totalPriceSet?.shopMoney?.amount || 0);
  return Math.round(amount * 100);
}

export type PaidOrderForAttribution = {
  id: string;
  name: string;
  totalPaise: number;
  discountCodes: string[];
  landingSite: string;
};

/** Recent paid orders + discount codes for manual attribution sync. */
export async function fetchRecentPaidOrders(
  admin: AdminGraphql,
  opts: { first?: number } = {},
): Promise<PaidOrderForAttribution[]> {
  const first = opts.first ?? 25;
  const res = await admin.graphql(
    `#graphql
    query paidOrders($first: Int!) {
      orders(first: $first, sortKey: CREATED_AT, reverse: true, query: "financial_status:paid") {
        edges {
          node {
            id
            name
            totalPriceSet { shopMoney { amount } }
            discountCodes
            customerJourneySummary {
              firstVisit { landingPage }
            }
          }
        }
      }
    }`,
    { variables: { first } },
  );
  const json = (await res.json()) as {
    data?: {
      orders?: {
        edges: Array<{
          node: {
            id: string;
            name: string;
            totalPriceSet?: { shopMoney?: { amount?: string } };
            discountCodes?: string[] | null;
            customerJourneySummary?: {
              firstVisit?: { landingPage?: string | null } | null;
            } | null;
          };
        }>;
      };
    };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    console.warn("fetchRecentPaidOrders", json.errors);
    // Fallback without journey fields if PCD/journey query fails
    const fallback = await admin.graphql(
      `#graphql
      query paidOrdersSimple($first: Int!) {
        orders(first: $first, sortKey: CREATED_AT, reverse: true, query: "financial_status:paid") {
          edges {
            node {
              id
              name
              totalPriceSet { shopMoney { amount } }
              discountCodes
            }
          }
        }
      }`,
      { variables: { first } },
    );
    const simple = (await fallback.json()) as typeof json;
    if (simple.errors?.length) {
      console.warn("fetchRecentPaidOrders simple", simple.errors);
      return [];
    }
    return (simple.data?.orders?.edges || []).map((e) => {
      const amount = Number(e.node.totalPriceSet?.shopMoney?.amount || 0);
      return {
        id: e.node.id,
        name: e.node.name,
        totalPaise: Math.round(amount * 100),
        discountCodes: (e.node.discountCodes || []).map((c) => c.toUpperCase()),
        landingSite: "",
      };
    });
  }

  return (json.data?.orders?.edges || []).map((e) => {
    const amount = Number(e.node.totalPriceSet?.shopMoney?.amount || 0);
    return {
      id: e.node.id,
      name: e.node.name,
      totalPaise: Math.round(amount * 100),
      discountCodes: (e.node.discountCodes || []).map((c) => c.toUpperCase()),
      landingSite: e.node.customerJourneySummary?.firstVisit?.landingPage || "",
    };
  });
}
