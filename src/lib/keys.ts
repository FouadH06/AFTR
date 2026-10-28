import "server-only";
import { env } from "@/lib/env";
import { sign, verifySig } from "@/lib/tokens";

// Capability links: possession of the signed link grants access to that order's tickets.
export const orderKey = (orderId: string) => sign(env.signingSecret, "order", orderId);
export const checkOrderKey = (orderId: string, k: string | null | undefined) => verifySig(env.signingSecret, "order", orderId, k);
export const orderUrl = (orderId: string) => `/orders/${orderId}?k=${orderKey(orderId)}`;
