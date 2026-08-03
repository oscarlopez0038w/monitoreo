import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let envText = fs.readFileSync('.env.local', 'utf8');
const envVars = {};
envText.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) envVars[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function testMultipleRuns() {
  const pageSize = 1000;
  for (let run = 1; run <= 5; run++) {
    const { count } = await supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true });
    const pages = Math.ceil(count / pageSize);

    const promises = [];
    for (let i = 0; i < pages; i++) {
      promises.push(
        supabaseAdmin
          .from('vtex_skus')
          .select('id, base_price, list_price')
          .order('id', { ascending: true })
          .range(i * pageSize, (i + 1) * pageSize - 1)
      );
    }
    const results = await Promise.all(promises);
    const all = results.flatMap((r) => r.data || []);
    const set = new Set(all.map((s) => s.id));
    const priced = all.filter((s) => s.base_price !== null).length;
    const disc = all.filter(
      (s) => s.list_price !== null && s.base_price !== null && parseFloat(s.list_price) > parseFloat(s.base_price)
    ).length;

    console.log(`Run ${run}: total=${all.length}, unique=${set.size}, priced=${priced}, discounted=${disc}`);
  }
}

testMultipleRuns();
