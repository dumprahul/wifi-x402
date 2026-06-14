import { supabaseAdmin } from '@/database/supabase';
import { ERC7710Delegation, Delegation } from '@/types';

export class DelegationService {
  static validate(delegation: ERC7710Delegation): { valid: boolean; error?: string } {
    if (!delegation) return { valid: false, error: 'No delegation provided' };
    if (!delegation.delegator) return { valid: false, error: 'Missing delegator' };
    if (!delegation.delegate) return { valid: false, error: 'Missing delegate' };
    if (!delegation.signature) return { valid: false, error: 'Missing signature' };

    // Check expiry caveat if present
    const expiryCaveat = delegation.authority?.caveats?.find(c => c.type === 'expiry');
    if (expiryCaveat && typeof expiryCaveat.value === 'number') {
      if (expiryCaveat.value < Math.floor(Date.now() / 1000)) {
        return { valid: false, error: 'Delegation expired' };
      }
    }

    return { valid: true };
  }

  static canExecute(delegation: ERC7710Delegation, action: { to: string; amount: string }): boolean {
    const caveats = delegation.authority?.caveats ?? [];
    for (const caveat of caveats) {
      if (caveat.type === 'allowed-targets') {
        const targets = caveat.value as string[];
        if (!targets.includes(action.to)) return false;
      }
      if (caveat.type === 'erc20-token-transfer') {
        const data = caveat.value as { allowance: string };
        if (parseFloat(data.allowance) < parseFloat(action.amount)) return false;
      }
    }
    return true;
  }

  static async store(
    wallet: string,
    hotspotId: string,
    delegation: ERC7710Delegation,
    totalAuthorized: string,
    scopeExpiry?: number
  ): Promise<Delegation> {
    const { data, error } = await supabaseAdmin
      .from('delegations')
      .upsert({
        wallet,
        hotspot_id: hotspotId,
        permissions_context: delegation as Record<string, unknown>,
        total_usdc_authorized: totalAuthorized,
        created_at: Date.now(),
        scope_expiry: scopeExpiry,
        is_active: true,
        usdc_spent: 0,
        used_count: 0,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data as Delegation;
  }

  static async get(wallet: string, hotspotId: string): Promise<Delegation | null> {
    const { data } = await supabaseAdmin
      .from('delegations')
      .select('*')
      .eq('wallet', wallet)
      .eq('hotspot_id', hotspotId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data as Delegation | null;
  }

  static async recordUsage(delegationId: string, amountUsdc: string): Promise<void> {
    await supabaseAdmin.rpc('increment_delegation_usage', {
      delegation_id: delegationId,
      amount: parseFloat(amountUsdc),
    }).throwOnError();
  }
}
