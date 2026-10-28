import Link from "next/link";
export default function Forbidden() {
  return <div className="mx-auto max-w-md px-4 py-20 text-center"><h1 className="h-display text-3xl">No access.</h1><p className="mt-2 text-muted">Your account doesn&apos;t have permission for that area.</p><Link href="/account" className="btn-ghost mt-6">Go to my account</Link></div>;
}
