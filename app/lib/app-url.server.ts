function cleanEnv(value: string | undefined): string {
  if (!value) return "";
  return value.trim().replace(/^["']|["']$/g, "");
}

export function getAppUrl(): string {
  const explicit = cleanEnv(process.env.SHOPIFY_APP_URL);
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = cleanEnv(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;

  const vercelUrl = cleanEnv(process.env.VERCEL_URL);
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, "")}`;

  return "http://localhost:3000";
}
