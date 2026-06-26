import type { Metadata } from "next";

// Auth routes are private/transactional — keep them out of search indexes.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
