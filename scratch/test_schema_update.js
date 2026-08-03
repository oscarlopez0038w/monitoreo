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

async function testColumn() {
  console.log('Testing if discount_pct exists...');
  const { data, error } = await supabaseAdmin.from('vtex_skus').select('id, discount_pct').limit(1);
  if (error) {
    console.log('Column discount_pct does NOT exist yet. Error:', error.message);
  } else {
    console.log('Column discount_pct EXISTS! Data:', data);
  }
}

testColumn();
