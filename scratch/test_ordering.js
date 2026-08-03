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

async function testUnorderedVsOrdered() {
  const count = 82234;
  const pageSize = 1000;
  const pages = Math.ceil(count / pageSize);

  // Unordered
  const p1 = [];
  for (let i = 0; i < pages; i++) {
    p1.push(supabaseAdmin.from('vtex_skus').select('id, base_price, list_price').range(i * pageSize, (i + 1) * pageSize - 1));
  }
  const r1 = await Promise.all(p1);
  const allUnordered = r1.flatMap(r => r.data || []);
  const setUnordered = new Set(allUnordered.map(s => s.id));
  const pricedUnordered = allUnordered.filter(s => s.base_price !== null).length;
  const discUnordered = allUnordered.filter(s => s.list_price !== null && s.base_price !== null && parseFloat(s.list_price) > parseFloat(s.base_price)).length;

  console.log('Unordered results:');
  console.log('Total fetched rows:', allUnordered.length);
  console.log('Unique SKU IDs:', setUnordered.size, `(Duplicates: ${allUnordered.length - setUnordered.size})`);
  console.log('Priced count:', pricedUnordered);
  console.log('Discounted count:', discUnordered);

  // Ordered
  const p2 = [];
  for (let i = 0; i < pages; i++) {
    p2.push(supabaseAdmin.from('vtex_skus').select('id, base_price, list_price').order('id', { ascending: true }).range(i * pageSize, (i + 1) * pageSize - 1));
  }
  const r2 = await Promise.all(p2);
  const allOrdered = r2.flatMap(r => r.data || []);
  const setOrdered = new Set(allOrdered.map(s => s.id));
  const pricedOrdered = allOrdered.filter(s => s.base_price !== null).length;
  const discOrdered = allOrdered.filter(s => s.list_price !== null && s.base_price !== null && parseFloat(s.list_price) > parseFloat(s.base_price)).length;

  console.log('\nOrdered results:');
  console.log('Total fetched rows:', allOrdered.length);
  console.log('Unique SKU IDs:', setOrdered.size, `(Duplicates: ${allOrdered.length - setOrdered.size})`);
  console.log('Priced count:', pricedOrdered);
  console.log('Discounted count:', discOrdered);
}

testUnorderedVsOrdered();
