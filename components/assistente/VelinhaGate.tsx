import { getSession, isStaff } from '@/lib/data';
import { supabaseConfigured } from '@/lib/supabase/server';
import { Velinha } from './Velinha';

// A Velinha aparece para membros aprovados e para a equipe (o acervo é de uso interno)
export async function VelinhaGate() {
  if (!supabaseConfigured()) return null;
  const { profile } = await getSession();
  if (!profile || !(profile.approved || isStaff(profile))) return null;
  return <Velinha />;
}
