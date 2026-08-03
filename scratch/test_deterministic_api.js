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

async function fetchCandidateSkus() {
  const { count } = await supabaseAdmin
    .from('vtex_skus')
    .select('id', { count: 'exact', head: true })
    .not('list_price', 'is', null)
    .not('base_price', 'is', null);

  const pageSize = 1000;
  const pages = Math.ceil((count || 0) / pageSize);

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
  return results.flatMap((r) => r.data || []);
}

async function simulateRequest() {
  const [{ count: totalPricedSkus }, { count: totalCatalogCount }] = await Promise.all([
    supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null),
    supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }),
  ]);

  const candidates = await fetchCandidateSkus();
  const discountedCount = candidates.filter(
    (s) => parseFloat(s.list_price) > parseFloat(s.base_price)
  ).length;

  return {
    totalCatalogCount,
    totalPricedSkus,
    discountedCount,
  };
}

async function run10Times() {
  console.log('Testing 10 consecutive simulated requests...');
  for (let i = 1; i <= 10; i++) {
    const res = await simulateRequest();
    console.log(`Req ${i}: catalog=${res.totalCatalogCount}, priced=${res.totalPricedSkus}, discounted=${res.discountedCount}`);
  }
}

run10Times();
