import "server-only";
import { cache } from "react";
import { isConfigured } from "@/lib/env";
import { supabasePublic } from "@/lib/supabase/server";

export type Brand = {
  name: string; hero_headline: string; tagline: string; primary_color: string; secondary_color: string;
  logo_url: string | null; instagram_url: string | null; tiktok_url: string | null; contact_email: string | null;
  launch_at: string | null; min_age: number; referral_tiers: { threshold: number; label: string }[]; processing_fee_pct: number;
};

export const DEFAULT_BRAND: Brand = {
  name: "AFTR", hero_headline: "THE NIGHT IS LOADING.", tagline: "Something different is coming to Beirut.",
  primary_color: "#C6FF35", secondary_color: "#A855F7", logo_url: null, instagram_url: null, tiktok_url: null,
  contact_email: null, launch_at: null, min_age: 18, processing_fee_pct: 0,
  referral_tiers: [{ threshold: 3, label: "Priority access" }, { threshold: 5, label: "Discount eligibility" }, { threshold: 10, label: "Complimentary ticket eligibility" }],
};

export const getBrand = cache(async (): Promise<Brand> => {
  if (!isConfigured()) return DEFAULT_BRAND;
  const { data } = await supabasePublic().from("brand_settings").select("*").eq("id", 1).maybeSingle();
  return data ? { ...DEFAULT_BRAND, ...data, processing_fee_pct: Number(data.processing_fee_pct) } : DEFAULT_BRAND;
});
