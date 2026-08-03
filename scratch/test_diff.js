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

async function testDiff() {
  const count = 82234;
  const pageSize = 1000;
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

  let countA = 0;
  let countB = 0;

  all.forEach(s => {
    const lp = s.list_price !== null && s.list_price !== undefined ? parseFloat(s.list_price) : null;
    const bp = s.base_price !== null && s.base_price !== undefined ? parseFloat(s.base_price) : null;

    if (lp && bp) {
      // Condition B
      if (lp > bp) {
        countB++;
      }

      // Condition A
      let discountPct = parseFloat((((lp - bp) / lp) * 100).toFixed(1));
      if (discountPct > 0) {
        countA++;
      }
    }
  });

  console.log('Condition A (discountPct > 0):', countA);
  console.log('Condition B (list_price > base_price):', countB);
}

testDiff();
