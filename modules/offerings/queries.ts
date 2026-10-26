/**
 * Temporary Cloudflare adapter for public catalogue.
 * The original component is preserved from sohoj-academy.
 * The Supabase RPC is intentionally not carried into Sohojac.
 * Return no published offerings until the public D1 offering query is built.
 */
import type { PublicOfferingCard } from "./types";

export async function getPublicProgrammeOfferings(): Promise<PublicOfferingCard[]> {
  return [];
}
