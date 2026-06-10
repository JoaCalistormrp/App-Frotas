import { readFile } from 'fs/promises';
import { createClient } from '@supabase/supabase-js';
const text = await readFile('.env', 'utf8');
const parse = (key) => {
  const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) throw new Error(`${key} not found`);
  let v = m[1].trim();
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  return v;
};
const url = parse('SUPABASE_URL');
const key = parse('SUPABASE_SERVICE_ROLE_KEY');
const sup = createClient(url, key);
const { data, error } = await sup.from('profiles').select('id, cnh_category').limit(1);
console.log('error', error);
console.log('data', data);
