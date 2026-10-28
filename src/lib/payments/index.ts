import "server-only";
import { env } from "@/lib/env";

/**
 * Payment provider abstraction. A provider must:
 *  - start a hosted checkout for an order (amount always read from the DB order, never the browser),
 *  - confirm payment ONLY via a server-verified channel (signed webhook or server-to-server lookup),
 *  - support refunds.
 * Lebanese providers (Whish, PayTabs, NetCommerce, OMT-based services) are listed but NOT implemented:
 * their adapters must be written against official merchant documentation once a merchant account exists.
 */
export interface PaymentProvider {
  id: string;
  label: string;
  isTest: boolean;
  configured(): boolean;
  startCheckout(order: { id: string; accessKey: string }): Promise<{ redirectUrl: string }>;
  refund(order: { id: string }): Promise<{ txnId: string }>;
}

const notImplemented = (id: string, label: string): PaymentProvider => ({
  id, label, isTest: false,
  configured: () => false,
  startCheckout: async () => { throw new Error(`${label} is not configured`); },
  refund: async () => { throw new Error(`${label} is not configured`); },
});

export const sandbox: PaymentProvider = {
  id: "sandbox",
  label: "Sandbox (test mode — no real money)",
  isTest: true,
  configured: () => env.sandboxPayments,
  startCheckout: async (o) => ({ redirectUrl: `/checkout/${o.id}?k=${o.accessKey}` }),
  refund: async (o) => ({ txnId: `sandbox-refund-${o.id}` }),
};

export const providers: PaymentProvider[] = [
  notImplemented("whish", "Whish Pay"),
  notImplemented("paytabs", "PayTabs"),
  notImplemented("netcommerce", "NetCommerce"),
  sandbox,
];

export const getProvider = (id: string | null | undefined) => providers.find((p) => p.id === id);
/** First configured real provider, else sandbox if enabled, else null (sales closed). */
export const activeProvider = () => providers.find((p) => !p.isTest && p.configured()) ?? (sandbox.configured() ? sandbox : null);
