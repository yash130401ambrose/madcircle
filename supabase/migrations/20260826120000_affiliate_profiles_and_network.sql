-- Already applied remotely as affiliate_profiles_and_network.
-- Documented here for local reference — do not re-apply if columns exist.

-- Affiliate profile
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "photoUrl" text NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "bio" text NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "city" text NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "instagram" text NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "youtube" text NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "linkedin" text NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "niches" text NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "audienceBand" text NOT NULL DEFAULT '';
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "profilePublic" boolean NOT NULL DEFAULT true;

-- Merchant network listing
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "publicName" text NOT NULL DEFAULT '';
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "publicBlurb" text NOT NULL DEFAULT '';
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "logoUrl" text NOT NULL DEFAULT '';
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "networkListed" boolean NOT NULL DEFAULT true;
ALTER TABLE "Merchant" ADD COLUMN IF NOT EXISTS "websiteUrl" text NOT NULL DEFAULT '';

-- Program network listing
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "openForApplications" boolean NOT NULL DEFAULT true;
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "networkListed" boolean NOT NULL DEFAULT true;

-- Public avatars bucket (service role uploads; anon reads)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_service_insert ON storage.objects;
CREATE POLICY avatars_service_insert ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_service_update ON storage.objects;
CREATE POLICY avatars_service_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars');
