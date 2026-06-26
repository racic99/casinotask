import type { MetadataRoute } from "next";
import { createClient } from "@/utils/supabase/server";
import { absoluteUrl } from "@/lib/seo";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("slug, created_at")
    .order("created_at", { ascending: false })
    .limit(50000);

  const companyEntries: MetadataRoute.Sitemap = (companies ?? []).map((c) => ({
    url: absoluteUrl(`/companies/${c.slug}`),
    lastModified: c.created_at ? new Date(c.created_at) : new Date(),
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [
    {
      url: absoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteUrl("/companies"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    ...companyEntries,
  ];
}
