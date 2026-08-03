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

async function testNullPrices() {
  const { count: bothNotNull } = await supabaseAdmin
    .from('vtex_skus')
    .select('id', { count: 'exact', head: true })
    .not('list_price', 'is', null)
    .not('base_price', 'is', null);

  const { count: listPriceNotNull } = await supabaseAdmin
    .from('vtex_skus')
    .select('id', { count: 'exact', head: true })
    .not('list_price', 'is', null);

  const { count: basePriceNotNull } = await supabaseAdmin
    .from('vtex_skus')
    .select('id', { count: 'exact', head: true })
    .not('base_price', 'is', null);

  console.log('SKUs with base_price NOT null:', basePriceNotNull);
  console.log('SKUs with list_price NOT null:', listPriceNotNull);
  console.log('SKUs with BOTH list_price AND base_price NOT null:', bothNotNull);
}

testNullPrices();
