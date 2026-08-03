import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

let envText = '';
try { envText = fs.readFileSync('.env.local', 'utf8'); } catch(e) {
  try { envText = fs.readFileSync('.env', 'utf8'); } catch(e2) {}
}

const envVars = {};
envText.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    envVars[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log('URL:', supabaseUrl ? 'Found' : 'Missing');

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function test() {
  const { data, error } = await supabaseAdmin.from('vtex_skus').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Sample row keys:', Object.keys(data[0] || {}));
    console.log('Sample row:', data[0]);
  }

  // Count total skus
  const { count: totalCount } = await supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true });
  console.log('Total SKUs in vtex_skus:', totalCount);

  // Count priced skus
  const { count: pricedCount } = await supabaseAdmin.from('vtex_skus').select('id', { count: 'exact', head: true }).not('base_price', 'is', null);
  console.log('Priced SKUs in vtex_skus:', pricedCount);
}

test();
