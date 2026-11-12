import Explorer from "@/components/Explorer";
import { getCompany, getMeta } from "@/lib/data";

export function generateStaticParams() {
  return getMeta().companies.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: `${getCompany(slug).name} · Earshot` };
}

export default async function CompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Explorer meta={getMeta()} company={getCompany(slug)} />;
}
