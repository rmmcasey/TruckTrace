import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Pass cache: 'no-store' to every fetch call so Next.js 14's data cache
// never serves stale Supabase responses.
export const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  global: {
    fetch: (url, options = {}) => fetch(url, { ...options, cache: "no-store" }),
  },
});
