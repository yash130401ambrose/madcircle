import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import { getSupabaseAdmin } from "./supabase.server";

type SessionRow = {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope: string | null;
  expires: string | null;
  accessToken: string;
  userId: string | number | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  accountOwner: boolean | null;
  locale: string | null;
  collaborator: boolean | null;
  emailVerified: boolean | null;
  refreshToken: string | null;
  refreshTokenExpires: string | null;
};

function sessionToRow(session: Session): Record<string, unknown> {
  const sessionParams = session.toObject() as {
    onlineAccessInfo?: {
      associated_user?: {
        id?: number;
        first_name?: string;
        last_name?: string;
        email?: string;
        account_owner?: boolean;
        locale?: string;
        collaborator?: boolean;
        email_verified?: boolean;
      };
    };
    refreshToken?: string;
    refreshTokenExpires?: Date;
  };
  const user = sessionParams.onlineAccessInfo?.associated_user;
  return {
    id: session.id,
    shop: session.shop,
    state: session.state,
    isOnline: session.isOnline,
    scope: session.scope || null,
    expires: session.expires ? session.expires.toISOString() : null,
    accessToken: session.accessToken || "",
    userId: user?.id ?? null,
    firstName: user?.first_name || null,
    lastName: user?.last_name || null,
    email: user?.email || null,
    accountOwner: user?.account_owner || false,
    locale: user?.locale || null,
    collaborator: user?.collaborator || false,
    emailVerified: user?.email_verified || false,
    refreshToken: sessionParams.refreshToken || null,
    refreshTokenExpires: sessionParams.refreshTokenExpires
      ? new Date(sessionParams.refreshTokenExpires).toISOString()
      : null,
  };
}

function rowToSession(row: SessionRow): Session {
  const sessionParams: Record<string, unknown> = {
    id: row.id,
    shop: row.shop,
    state: row.state,
    isOnline: row.isOnline,
    userId: row.userId != null ? String(row.userId) : undefined,
    firstName: row.firstName != null ? String(row.firstName) : undefined,
    lastName: row.lastName != null ? String(row.lastName) : undefined,
    email: row.email != null ? String(row.email) : undefined,
    locale: row.locale != null ? String(row.locale) : undefined,
  };
  if (row.accountOwner !== null) sessionParams.accountOwner = row.accountOwner;
  if (row.collaborator !== null) sessionParams.collaborator = row.collaborator;
  if (row.emailVerified !== null) sessionParams.emailVerified = row.emailVerified;
  if (row.expires) sessionParams.expires = new Date(row.expires).getTime();
  if (row.scope) sessionParams.scope = row.scope;
  if (row.accessToken) sessionParams.accessToken = row.accessToken;
  if (row.refreshToken) sessionParams.refreshToken = row.refreshToken;
  if (row.refreshTokenExpires) {
    sessionParams.refreshTokenExpires = new Date(row.refreshTokenExpires).getTime();
  }
  return Session.fromPropertyArray(Object.entries(sessionParams), true);
}

/** Persists Shopify OAuth sessions in Supabase (works on Vercel; SQLite does not). */
export class SupabaseSessionStorage implements SessionStorage {
  async storeSession(session: Session): Promise<boolean> {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("Session").upsert(sessionToRow(session));
    if (error) throw error;
    return true;
  }

  async loadSession(id: string): Promise<Session | undefined> {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("Session").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? rowToSession(data as SessionRow) : undefined;
  }

  async deleteSession(id: string): Promise<boolean> {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("Session").delete().eq("id", id);
    if (error) throw error;
    return true;
  }

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (!ids.length) return true;
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("Session").delete().in("id", ids);
    if (error) throw error;
    return true;
  }

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb.from("Session").select("*").eq("shop", shop);
    if (error) throw error;
    return (data as SessionRow[] | null)?.map(rowToSession) ?? [];
  }
}
