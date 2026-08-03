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

async function testCandidateSpeed() {
  const start = Date.now();

  const [{ count: totalPricedSkus }, { count: totalCatalogCount }] = await Promise.all([
    supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
    supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
  ]);

  const { count: candidateCount } = await supabaseAdmin
    .from('vtex_skus')
    .select('id', { count: 'exact', head: true })
    .not('list_price', 'is', null)
    .not('base_price', 'is', null);

  const pageSize = 1000;
  const pages = Math.ceil((candidateCount || 0) / pageSize);

  const promises = [];
  for (let i = 0; i < pages; i++) {
    promises.push(
      supabaseAdmin
        .from('vtex_skus')
        .select('id, list_price, base_price, cost_price, price_updated_at, updated_at, is_active')
        .not('list_price', 'is', null)
        .not('base_price', 'is', null)
        .order('id', { ascending: true })
        .range(i * pageSize, (i + 1) * pageSize - 1)
    );
  }

  const results = await Promise.all(promises);
  const candidates = results.flatMap((r) => r.data || []);
  const discounted = candidates.filter(
    (s) => parseFloat(s.list_price) > parseFloat(s.base_price)
  );

  const duration = Date.now() - start;

  console.log(`Total catalog: ${totalCatalogCount}`);
  console.log(`Total priced: ${totalPricedSkus}`);
  console.log(`Candidates count: ${candidates.length}`);
  console.log(`Discounted count: ${discounted.length}`);
  console.log(`Duration: ${duration} ms`);
}

testCandidateSpeed();
