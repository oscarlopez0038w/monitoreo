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

async function testFetchAll() {
  const { count } = await supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true });
  console.log('Total count:', count);

  const pageSize = 1000;
  const pages = Math.ceil(count / pageSize);
  console.log('Fetching pages:', pages);

  const promises = [];
  for (let i = 0; i < pages; i++) {
    const from = i * pageSize;
    const to = from + pageSize - 1;
    promises.push(
      supabaseAdmin.from('vtex_skus').select('id, list_price, base_price').range(from, to)
    );
  }

  const start = Date.now();
  const results = await Promise.all(promises);
  const allSkus = results.flatMap(r => r.data || []);
  const duration = Date.now() - start;

  console.log('Fetched total SKUs:', allSkus.length, 'in', duration, 'ms');

  const priced = allSkus.filter(s => s.base_price !== null && s.base_price !== undefined);
  console.log('Priced SKUs count:', priced.length);

  const discounted = allSkus.filter(s => {
    if (s.list_price !== null && s.base_price !== null) {
      const lp = parseFloat(s.list_price);
      const bp = parseFloat(s.base_price);
      return lp > bp;
    }
    return false;
  });

  console.log('Discounted SKUs count (list_price > base_price):', discounted.length);
}

testFetchAll();
