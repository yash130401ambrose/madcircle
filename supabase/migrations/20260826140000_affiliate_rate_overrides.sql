-- Per-affiliate commission + customer discount overrides
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "customerDiscountType" text NOT NULL DEFAULT 'PERCENT';
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "customerDiscountValue" double precision NOT NULL DEFAULT 10;

ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "commissionTypeOverride" text;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "commissionValueOverride" double precision;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "customerDiscountTypeOverride" text;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "customerDiscountValueOverride" double precision;
ALTER TABLE "Affiliate" ADD COLUMN IF NOT EXISTS "shopifyDiscountId" text NOT NULL DEFAULT '';
