-- Add termsContent (nullable Tiptap JSON) to Activation for T&Cs accordion
ALTER TABLE "Activation" ADD COLUMN "termsContent" JSONB;
