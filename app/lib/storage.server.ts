import { getSupabaseAdmin } from "./supabase.server";

export async function uploadAffiliateAvatar(affiliateId: string, file: File) {
  if (!file || file.size === 0) return null;
  if (file.size > 5 * 1024 * 1024) throw new Error("Photo must be under 5MB");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${affiliateId}/${Date.now()}.${ext}`;
  const sb = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await sb.storage.from("avatars").upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: true,
  });
  if (error) throw error;

  const { data } = sb.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}
