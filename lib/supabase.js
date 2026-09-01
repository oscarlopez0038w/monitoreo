import { createClient } from '@supabase/supabase-js';

// Parche de resolución DNS para servidores de desarrollo local donde el DNS del ISP (ej. Enitel/Claro)
// falla o genera timeouts al resolver dominios *.supabase.co.
if (typeof window === 'undefined') {
  try {
    const dns = require('dns');
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    const origLookup = dns.lookup;
    dns.lookup = function (hostname, options, callback) {
      const cb = typeof options === 'function' ? options : callback;
      const opts = typeof options === 'object' ? options : {};

      dns.resolve4(hostname, (err, addrs) => {
        if (!err && addrs && addrs.length > 0) {
          if (opts.all) {
            return cb(null, addrs.map((a) => ({ address: a, family: 4 })));
          }
          return cb(null, addrs[0], 4);
        }
        origLookup.call(dns, hostname, options, callback);
      });
    };
  } catch (e) {
    // Silencioso en entornos no Node.js
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

export const isSupabaseConfigured = () => {
  return (
    Boolean(supabaseUrl) &&
    !supabaseUrl.includes('placeholder.supabase.co') &&
    !supabaseUrl.includes('tu-proyecto-ref') &&
    Boolean(supabaseAnonKey) &&
    !supabaseAnonKey.includes('placeholder-key') &&
    supabaseAnonKey !== 'tu_anon_key_aqui'
  );
};

// Cliente genérico para frontend o backend
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Cliente con permisos elevados para operaciones en servidor (sync masivo)
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
