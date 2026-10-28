import { getBrand } from "@/lib/brand";

export const metadata = { title: "Privacy & terms" };

export default async function Privacy() {
  const b = await getBrand();
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-12 text-sm leading-relaxed text-fg/90">
      <h1 className="h-display text-3xl">Privacy & terms</h1>
      <p className="text-warn">Template — have this reviewed against Lebanese law (incl. Law 81/2018 on electronic transactions and personal data) before launch.</p>
      <h2 className="h-display pt-4 text-lg">What we collect</h2>
      <p>Name, email, phone, optional Instagram handle, your age confirmation, marketing preference, how you found us (campaign/referral), and your orders and check-ins. We store a one-way hash of your IP address for abuse prevention — not the IP itself. We never see or store card details; payments are handled by our payment provider.</p>
      <h2 className="h-display pt-4 text-lg">How we use it</h2>
      <p>To run the waitlist and referrals, issue and verify tickets, keep the door safe, prevent fraud, and — only if you opted in — to send event announcements. We do not sell your data. Third-party analytics/ad pixels are off unless you consent.</p>
      <h2 className="h-display pt-4 text-lg">Age</h2>
      <p>Events are {b.min_age}+ unless stated otherwise on the event page. Valid ID may be required at the door.</p>
      <h2 className="h-display pt-4 text-lg">Tickets</h2>
      <p>Each QR ticket is single-use: the first scan is admitted. Keep it private. Refunds follow the policy on each event page; if an event is cancelled you will be refunded.</p>
      <h2 className="h-display pt-4 text-lg">Your rights & retention</h2>
      <p>Ask us to access, correct, or delete your data{b.contact_email ? ` at ${b.contact_email}` : ""}. Waitlist data for unconverted signups is deleted after 24 months; order records are kept as required for accounting.</p>
    </div>
  );
}
