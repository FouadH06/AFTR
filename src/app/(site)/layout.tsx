import { SiteFooter, SiteHeader } from "@/components/ui";
import { getBrand } from "@/lib/brand";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const brand = await getBrand();
  return (<><SiteHeader brand={brand} /><main>{children}</main><SiteFooter brand={brand} /></>);
}
