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

async function testFilters() {
  // Test if PostgREST supports list_price gt base_price syntax or raw filter
  const { count, error } = await supabaseAdmin
    .from('vtex_skus')
    .select('id', { count: 'exact', head: true })
    .filter('list_price', 'gt', 'base_price');

  console.log('Filter list_price gt base_price result:', count, error ? error.message : 'No error');
}

testFilters();
