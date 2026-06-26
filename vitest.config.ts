import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://cnaichmgbovpgdeolojy.supabase.co',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_IkYUa1YNyUXDvbuf9hX9pw_WjSBHFM_',
    },
  },
});
