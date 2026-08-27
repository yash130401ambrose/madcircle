import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function exec<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error) throw error;
  return data;
}

function nid() {
  return crypto.randomUUID();
}

function now() {
  return new Date().toISOString();
}

const PROGRAM_WITH_MERCHANT = "*, merchant:Merchant!merchantId(*)";
const AFFILIATE_WITH_PROGRAM = `*, program:Program!programId(${PROGRAM_WITH_MERCHANT})`;
const AFFILIATE_WITH_COMMS = "*, commissions:Commission(*), program:Program!programId(*)";
const CLAIM_WITH_AFFILIATE = "*, affiliate:Affiliate!affiliateId(*)";

const db = {
  session: {
    async findFirst({ where }: { where: { shop: string } }) {
      const sb = getSupabaseAdmin();
      return exec(sb.from("Session").select("*").eq("shop", where.shop).limit(1).maybeSingle());
    },
    async deleteMany({ where }: { where: { shop: string } }) {
      const sb = getSupabaseAdmin();
      return exec(sb.from("Session").delete().eq("shop", where.shop));
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(sb.from("Session").update(data).eq("id", where.id).select().single());
    },
  },

  merchant: {
    async findUnique({ where }: { where: { shop?: string; id?: string } }) {
      const sb = getSupabaseAdmin();
      let q = sb.from("Merchant").select("*");
      if (where.shop) q = q.eq("shop", where.shop);
      if (where.id) q = q.eq("id", where.id);
      return exec(q.maybeSingle()) as Promise<any>;
    },
    async findMany({ where }: { where?: { networkListed?: boolean } } = {}) {
      const sb = getSupabaseAdmin();
      let q = sb.from("Merchant").select("*");
      if (where?.networkListed != null) q = q.eq("networkListed", where.networkListed);
      return ((await exec(q.order("createdAt", { ascending: false }))) ?? []) as any[];
    },
    async upsert({
      where,
      create,
      update,
    }: {
      where: { shop: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) {
      const existing = await db.merchant.findUnique({ where });
      if (existing) {
        if (!update || Object.keys(update).length === 0) return existing;
        const sb = getSupabaseAdmin();
        return exec(
          sb
            .from("Merchant")
            .update({ ...update, updatedAt: now() })
            .eq("id", existing.id)
            .select()
            .single(),
        );
      }
      const sb = getSupabaseAdmin();
      return exec(
        sb
          .from("Merchant")
          .insert({ id: nid(), ...create, createdAt: now(), updatedAt: now() })
          .select()
          .single(),
      );
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb
          .from("Merchant")
          .update({ ...data, updatedAt: now() })
          .eq("id", where.id)
          .select()
          .single(),
      );
    },
  },

  program: {
    async findMany({
      where,
      include,
      select,
    }: {
      where?: { merchantId?: string; networkListed?: boolean; openForApplications?: boolean };
      include?: { merchant?: boolean };
      select?: { id: true };
    } = {}) {
      const sb = getSupabaseAdmin();
      const cols = select?.id ? "id" : include?.merchant ? PROGRAM_WITH_MERCHANT : "*";
      let q = sb.from("Program").select(cols);
      if (where?.merchantId) q = q.eq("merchantId", where.merchantId);
      if (where?.networkListed != null) q = q.eq("networkListed", where.networkListed);
      if (where?.openForApplications != null) {
        q = q.eq("openForApplications", where.openForApplications);
      }
      return ((await exec(q.order("createdAt", { ascending: false }))) ?? []) as any[];
    },
    async findUnique({ where }: { where: { id: string } }) {
      const sb = getSupabaseAdmin();
      return exec(sb.from("Program").select("*").eq("id", where.id).maybeSingle()) as Promise<any>;
    },
    async findFirst({
      where,
      orderBy,
    }: {
      where?: { merchantId?: string };
      orderBy?: { createdAt: "asc" | "desc" };
    } = {}) {
      const sb = getSupabaseAdmin();
      let q = sb.from("Program").select("*");
      if (where?.merchantId) q = q.eq("merchantId", where.merchantId);
      if (orderBy?.createdAt) q = q.order("createdAt", { ascending: orderBy.createdAt === "asc" });
      return exec(q.limit(1).maybeSingle()) as Promise<any>;
    },
    async upsert({
      where,
      create,
      update,
    }: {
      where: { merchantId_slug: { merchantId: string; slug: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) {
      const sb = getSupabaseAdmin();
      const existing = await exec(
        sb
          .from("Program")
          .select("*")
          .eq("merchantId", where.merchantId_slug.merchantId)
          .eq("slug", where.merchantId_slug.slug)
          .maybeSingle(),
      );
      if (existing) {
        return exec(
          sb
            .from("Program")
            .update({ ...update, updatedAt: now() })
            .eq("id", (existing as { id: string }).id)
            .select()
            .single(),
        );
      }
      return exec(
        sb
          .from("Program")
          .insert({ id: nid(), ...create, createdAt: now(), updatedAt: now() })
          .select()
          .single(),
      );
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb
          .from("Program")
          .update({ ...data, updatedAt: now() })
          .eq("id", where.id)
          .select()
          .single(),
      );
    },
  },

  affiliate: {
    async findMany({
      where,
      include,
      orderBy,
      select,
    }: {
      where?: {
        programId?: string | { in: string[] };
        email?: string;
        profilePublic?: boolean;
        status?: string;
      };
      include?: Record<string, unknown>;
      orderBy?: { createdAt: "desc" | "asc" };
      select?: { id: true };
    } = {}) {
      const sb = getSupabaseAdmin();
      const cols = select?.id
        ? "id"
        : include?.commissions
          ? AFFILIATE_WITH_COMMS
          : include?.program
            ? AFFILIATE_WITH_PROGRAM
            : "*";
      let q = sb.from("Affiliate").select(cols);
      if (typeof where?.programId === "string") q = q.eq("programId", where.programId);
      else if (where?.programId?.in) {
        if (!where.programId.in.length) return [];
        q = q.in("programId", where.programId.in);
      }
      if (where?.email) q = q.eq("email", where.email);
      if (where?.profilePublic != null) q = q.eq("profilePublic", where.profilePublic);
      if (where?.status) q = q.eq("status", where.status);
      if (orderBy?.createdAt) q = q.order("createdAt", { ascending: orderBy.createdAt === "asc" });
      return ((await exec(q)) ?? []) as any[];
    },
    async findUnique({
      where,
      include,
    }: {
      where: { id?: string; referralCode?: string };
      include?: Record<string, unknown>;
    }) {
      const sb = getSupabaseAdmin();
      const cols = include?.commissions
        ? AFFILIATE_WITH_COMMS
        : include?.program
          ? AFFILIATE_WITH_PROGRAM
          : "*";
      let q = sb.from("Affiliate").select(cols);
      if (where.id) q = q.eq("id", where.id);
      if (where.referralCode) q = q.eq("referralCode", where.referralCode);
      return exec(q.maybeSingle()) as Promise<any>;
    },
    async findFirst({
      where,
      include,
    }: {
      where: {
        email?: string;
        programId?: string;
        couponCode?: { in: string[] };
        program?: { merchantId: string };
      };
      include?: Record<string, unknown>;
    }) {
      const sb = getSupabaseAdmin();
      const cols = include?.program ? AFFILIATE_WITH_PROGRAM : "*";
      if (where.email && where.programId) {
        return exec(
          sb
            .from("Affiliate")
            .select(cols)
            .eq("email", where.email)
            .eq("programId", where.programId)
            .limit(1)
            .maybeSingle(),
        ) as Promise<any>;
      }
      if (where.email) {
        return exec(
          sb.from("Affiliate").select(cols).eq("email", where.email).limit(1).maybeSingle(),
        ) as Promise<any>;
      }
      if (where.couponCode?.in && where.program?.merchantId) {
        const programs = await db.program.findMany({
          where: { merchantId: where.program.merchantId },
        });
        const pids = programs.map((p: { id: string }) => p.id);
        if (!pids.length) return null;
        return exec(
          sb
            .from("Affiliate")
            .select(cols)
            .in("couponCode", where.couponCode.in)
            .in("programId", pids)
            .limit(1)
            .maybeSingle(),
        ) as Promise<any>;
      }
      return null;
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb
          .from("Affiliate")
          .insert({ id: nid(), ...data, createdAt: now(), updatedAt: now() })
          .select()
          .single(),
      ) as Promise<any>;
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb
          .from("Affiliate")
          .update({ ...data, updatedAt: now() })
          .eq("id", where.id)
          .select()
          .single(),
      ) as Promise<any>;
    },
  },

  network: {
    async listPublicPrograms() {
      const sb = getSupabaseAdmin();
      const rows =
        ((await exec(
          sb
            .from("Program")
            .select(PROGRAM_WITH_MERCHANT)
            .eq("networkListed", true)
            .eq("openForApplications", true)
            .eq("status", "ACTIVE")
            .order("createdAt", { ascending: false }),
        )) ?? []) as any[];
      return rows.filter((p) => p.merchant?.networkListed !== false);
    },
    async listPublicCreators() {
      const sb = getSupabaseAdmin();
      const rows =
        ((await exec(
          sb
            .from("Affiliate")
            .select(AFFILIATE_WITH_PROGRAM)
            .eq("profilePublic", true)
            .eq("status", "APPROVED")
            .order("updatedAt", { ascending: false })
            .limit(200),
        )) ?? []) as any[];
      const seen = new Set<string>();
      const unique: any[] = [];
      for (const row of rows) {
        if (seen.has(row.email)) continue;
        seen.add(row.email);
        unique.push(row);
      }
      return unique;
    },
  },

  commission: {
    async findMany({
      where,
      orderBy,
    }: {
      where: { affiliateId?: string | { in: string[] } };
      orderBy?: { createdAt: "desc" };
    }) {
      const sb = getSupabaseAdmin();
      let q = sb.from("Commission").select("*");
      if (typeof where.affiliateId === "string") q = q.eq("affiliateId", where.affiliateId);
      else if (where.affiliateId?.in) {
        if (!where.affiliateId.in.length) return [];
        q = q.in("affiliateId", where.affiliateId.in);
      }
      if (orderBy?.createdAt) q = q.order("createdAt", { ascending: false });
      return (await exec(q)) ?? [];
    },
    async findFirst({ where }: { where: { shopifyOrderId: string; isOverride: boolean } }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb
          .from("Commission")
          .select("*")
          .eq("shopifyOrderId", where.shopifyOrderId)
          .eq("isOverride", where.isOverride)
          .limit(1)
          .maybeSingle(),
      );
    },
    async count({
      where,
    }: {
      where: {
        affiliateId: { in: string[] };
        isOverride: boolean;
        createdAt: { gte: Date };
        status: { not: string };
      };
    }) {
      const sb = getSupabaseAdmin();
      if (!where.affiliateId.in.length) return 0;
      const { count, error } = await sb
        .from("Commission")
        .select("*", { count: "exact", head: true })
        .in("affiliateId", where.affiliateId.in)
        .eq("isOverride", where.isOverride)
        .gte("createdAt", where.createdAt.gte.toISOString())
        .neq("status", where.status.not);
      if (error) throw error;
      return count ?? 0;
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb
          .from("Commission")
          .insert({ id: nid(), ...data, createdAt: now(), updatedAt: now() })
          .select()
          .single(),
      );
    },
    async updateMany({
      where,
      data,
    }: {
      where: { id: { in: string[] } };
      data: Record<string, unknown>;
    }) {
      const sb = getSupabaseAdmin();
      if (!where.id.in.length) return { count: 0 };
      await exec(
        sb
          .from("Commission")
          .update({ ...data, updatedAt: now() })
          .in("id", where.id.in),
      );
      return { count: where.id.in.length };
    },
  },

  click: {
    async create({ data }: { data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb.from("Click").insert({ id: nid(), ...data, createdAt: now() }).select().single(),
      );
    },
    async count({ where }: { where: { affiliateId: string } }) {
      const sb = getSupabaseAdmin();
      const { count, error } = await sb
        .from("Click")
        .select("*", { count: "exact", head: true })
        .eq("affiliateId", where.affiliateId);
      if (error) throw error;
      return count ?? 0;
    },
  },

  activity: {
    async create({ data }: { data: { shop: string; message: string } }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb.from("Activity").insert({ id: nid(), ...data, createdAt: now() }).select().single(),
      );
    },
    async findMany({
      where,
      orderBy,
      take,
    }: {
      where: { shop: string };
      orderBy: { createdAt: "desc" };
      take: number;
    }) {
      const sb = getSupabaseAdmin();
      return (
        (await exec(
          sb
            .from("Activity")
            .select("*")
            .eq("shop", where.shop)
            .order("createdAt", { ascending: false })
            .limit(take),
        )) ?? []
      );
    },
  },

  payout: {
    async create({ data }: { data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb
          .from("Payout")
          .insert({
            id: nid(),
            ...data,
            paidAt: data.paidAt instanceof Date ? data.paidAt.toISOString() : data.paidAt,
            createdAt: now(),
          })
          .select()
          .single(),
      );
    },
  },

  referralClaim: {
    async findMany({
      where,
      include,
      orderBy,
    }: {
      where: { affiliateId: string | { in: string[] } };
      include?: { affiliate: true };
      orderBy?: { createdAt: "desc" };
    }) {
      const sb = getSupabaseAdmin();
      const cols = include?.affiliate ? CLAIM_WITH_AFFILIATE : "*";
      let q = sb.from("ReferralClaim").select(cols);
      if (typeof where.affiliateId === "string") q = q.eq("affiliateId", where.affiliateId);
      else {
        if (!where.affiliateId.in.length) return [];
        q = q.in("affiliateId", where.affiliateId.in);
      }
      if (orderBy?.createdAt) q = q.order("createdAt", { ascending: false });
      return ((await exec(q)) ?? []) as any[];
    },
    async findUnique({
      where,
      include,
    }: {
      where: { id: string };
      include?: { affiliate: true };
    }) {
      const sb = getSupabaseAdmin();
      const cols = include?.affiliate ? CLAIM_WITH_AFFILIATE : "*";
      return exec(sb.from("ReferralClaim").select(cols).eq("id", where.id).maybeSingle()) as Promise<any>;
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb.from("ReferralClaim").insert({ id: nid(), ...data, createdAt: now() }).select().single(),
      );
    },
    async update({ where, data }: { where: { id: string }; data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(sb.from("ReferralClaim").update(data).eq("id", where.id).select().single());
    },
  },

  blockListEntry: {
    async findMany({ where, orderBy }: { where: { shop: string }; orderBy: { createdAt: "desc" } }) {
      const sb = getSupabaseAdmin();
      return (
        (await exec(
          sb
            .from("BlockListEntry")
            .select("*")
            .eq("shop", where.shop)
            .order("createdAt", { ascending: false }),
        )) ?? []
      );
    },
    async findFirst({
      where,
    }: {
      where: { shop: string; OR: Array<Record<string, string>> };
    }) {
      const sb = getSupabaseAdmin();
      for (const clause of where.OR) {
        let q = sb.from("BlockListEntry").select("*").eq("shop", where.shop);
        for (const [k, v] of Object.entries(clause)) {
          if (v) q = q.eq(k, v);
        }
        const row = await exec(q.limit(1).maybeSingle());
        if (row) return row;
      }
      return null;
    },
    async create({ data }: { data: Record<string, unknown> }) {
      const sb = getSupabaseAdmin();
      return exec(
        sb.from("BlockListEntry").insert({ id: nid(), ...data, createdAt: now() }).select().single(),
      );
    },
    async delete({ where }: { where: { id: string } }) {
      const sb = getSupabaseAdmin();
      return exec(sb.from("BlockListEntry").delete().eq("id", where.id));
    },
  },
};

export default db;
