import type { Metadata } from "next";

// The "add a company" form is an app action, not indexable content.
export const metadata: Metadata = {
  title: "Add a company",
  robots: { index: false, follow: false },
};

export default function NewCompanyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
