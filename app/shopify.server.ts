import "dotenv/config";
import "@shopify/shopify-app-remix/adapters/vercel";
import {
  ApiVersion,
  AppDistribution,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { getAppUrl } from "./lib/app-url.server";
import { SupabaseSessionStorage } from "./lib/supabase-session-storage.server";

function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

const apiKey = cleanEnv(process.env.SHOPIFY_API_KEY);
const apiSecretKey = cleanEnv(process.env.SHOPIFY_API_SECRET);
const scopes = cleanEnv(
  process.env.SCOPES ||
    "read_orders,write_orders,read_customers,write_customers,write_discounts,read_products",
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const shopify = shopifyApp({
  apiKey,
  apiSecretKey,
  apiVersion: ApiVersion.January25,
  scopes,
  appUrl: getAppUrl(),
  authPathPrefix: "/auth",
  sessionStorage: new SupabaseSessionStorage(),
  distribution: AppDistribution.AppStore,
  future: {
    unstable_newEmbeddedAuthStrategy: true,
    expiringOfflineAccessTokens: true,
  },
  ...(cleanEnv(process.env.SHOP_CUSTOM_DOMAIN)
    ? { customShopDomains: [cleanEnv(process.env.SHOP_CUSTOM_DOMAIN)] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.January25;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
