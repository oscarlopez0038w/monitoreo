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

async function run() {
  console.log('Testing range(0, 1999)...');
  const res1 = await supabaseAdmin.from('vtex_skus').select('id').range(0, 1999);
  console.log('Returned rows for range(0, 1999):', res1.data ? res1.data.length : 0);

  console.log('Testing range(0, 999)...');
  const res2 = await supabaseAdmin.from('vtex_skus').select('id').range(0, 999);
  console.log('Returned rows for range(0, 999):', res2.data ? res2.data.length : 0);
}

run();
