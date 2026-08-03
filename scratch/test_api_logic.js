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

async function testApiLogic() {
  const { count: totalCatalogCount } = await supabaseAdmin
    .from('vtex_skus')
    .select('id', { count: 'exact', head: true });

  const pageSize = 1000;
  const pages = Math.ceil(totalCatalogCount / pageSize);

  const promises = [];
  for (let i = 0; i < pages; i++) {
    const from = i * pageSize;
    const to = from + pageSize - 1;
    promises.push(
      supabaseAdmin
        .from('vtex_skus')
        .select('id, list_price, base_price, cost_price, price_updated_at, updated_at, is_active')
        .range(from, to)
    );
  }

  const results = await Promise.all(promises);
  const allSkus = results.flatMap((r) => r.data || []);

  const formattedAll = allSkus.map((s) => {
    const listPrice = s.list_price !== null && s.list_price !== undefined ? parseFloat(s.list_price) : null;
    const basePrice = s.base_price !== null && s.base_price !== undefined ? parseFloat(s.base_price) : null;
    let discountPct = 0;
    if (listPrice && basePrice && listPrice > basePrice) {
      discountPct = parseFloat((((listPrice - basePrice) / listPrice) * 100).toFixed(1));
    }

    return {
      id: s.id,
      listPrice,
      basePrice,
      discountPct,
    };
  });

  const pricedCount = formattedAll.filter((s) => s.basePrice !== null).length;
  const discountedCount = formattedAll.filter((s) => s.discountPct > 0).length;

  console.log('--- TEST RESULTS ---');
  console.log('Total catalog count:', totalCatalogCount);
  console.log('Total fetched SKUs:', formattedAll.length);
  console.log('Total priced SKUs:', pricedCount);
  console.log('Total discounted SKUs:', discountedCount);
}

testApiLogic();
