import prisma from "../db.server";

export type ProfileFields = {
  photoUrl?: string;
  bio?: string;
  city?: string;
  instagram?: string;
  youtube?: string;
  linkedin?: string;
  niches?: string;
  audienceBand?: string;
  profilePublic?: boolean;
  name?: string;
  phone?: string;
};

export function parseProfileFromForm(form: FormData): ProfileFields {
  return {
    bio: String(form.get("bio") || "").trim().slice(0, 600),
    city: String(form.get("city") || "").trim().slice(0, 80),
    instagram: String(form.get("instagram") || "").trim().slice(0, 120),
    youtube: String(form.get("youtube") || "").trim().slice(0, 120),
    linkedin: String(form.get("linkedin") || "").trim().slice(0, 120),
    niches: String(form.get("niches") || "").trim().slice(0, 200),
    audienceBand: String(form.get("audienceBand") || "").trim(),
    profilePublic: form.get("profilePublic") === "on",
  };
}

export function profileCompleteness(a: ProfileFields & { name?: string; pan?: string }) {
  const checks = [
    Boolean(a.name),
    Boolean(a.photoUrl),
    Boolean(a.bio && a.bio.length > 20),
    Boolean(a.city),
    Boolean(a.instagram || a.youtube || a.linkedin),
    Boolean(a.niches),
    Boolean(a.audienceBand),
    Boolean(a.pan),
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/** Keep resume fields in sync across every brand membership for this email. */
export async function syncProfileByEmail(email: string, data: ProfileFields) {
  const rows = await prisma.affiliate.findMany({ where: { email } });
  await Promise.all(
    rows.map((row: { id: string }) =>
      prisma.affiliate.update({
        where: { id: row.id },
        data: { ...data },
      }),
    ),
  );
}

export async function copyMembershipFromTemplate(opts: {
  programId: string;
  email: string;
  name: string;
  passwordHash: string;
  template?: ProfileFields & {
    phone?: string;
    pan?: string;
    gstin?: string;
  };
  autoApprove: boolean;
}) {
  const existing = await prisma.affiliate.findFirst({
    where: { email: opts.email, programId: opts.programId },
  });
  if (existing) return { affiliate: existing, created: false };

  const { makeReferralCode } = await import("./affiliate-auth.server");
  const referralCode = makeReferralCode(opts.name);
  const affiliate = await prisma.affiliate.create({
    data: {
      programId: opts.programId,
      email: opts.email,
      name: opts.name,
      passwordHash: opts.passwordHash,
      phone: opts.template?.phone || "",
      pan: opts.template?.pan || "",
      gstin: opts.template?.gstin || "",
      photoUrl: opts.template?.photoUrl || "",
      bio: opts.template?.bio || "",
      city: opts.template?.city || "",
      instagram: opts.template?.instagram || "",
      youtube: opts.template?.youtube || "",
      linkedin: opts.template?.linkedin || "",
      niches: opts.template?.niches || "",
      audienceBand: opts.template?.audienceBand || "",
      profilePublic: opts.template?.profilePublic ?? true,
      status: opts.autoApprove ? "APPROVED" : "PENDING",
      referralCode,
      couponCode: referralCode.slice(0, 12),
    },
  });
  return { affiliate, created: true };
}
