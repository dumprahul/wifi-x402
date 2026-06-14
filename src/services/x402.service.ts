import { supabaseAdmin } from '@/database/supabase';
import { Plan, X402PaymentHeader } from '@/types';
import { CHAIN_ID, USDC_ADDRESS, X402_VERSION } from '@/utils/constants';

export class X402Service {
  static issue402(plan: Plan, hotspotWallet: string): { status: 402; headers: Record<string, string>; body: object } {
    const paymentHeader: X402PaymentHeader = {
      scheme: 'erc7710',
      network: `eip155:${CHAIN_ID}`,
      maxAmountRequired: plan.price_usdc,
      resource: `/purchase`,
      description: `WiFi access: ${plan.name}`,
      mimeType: 'application/json',
      payTo: hotspotWallet,
      maxTimeoutSeconds: 300,
      asset: USDC_ADDRESS,
      extra: {
        planId: plan.id,
        durationSeconds: plan.duration_seconds,
        version: X402_VERSION,
      },
    };

    return {
      status: 402,
      headers: {
        'X-Payment-Version': X402_VERSION,
        'X-Payment': JSON.stringify(paymentHeader),
        'WWW-Authenticate': `x402 realm="WiFi Access", scheme="erc7710"`,
      },
      body: {
        error: 'Payment Required',
        paymentRequired: paymentHeader,
      },
    };
  }

  static async getPlan(planId: string): Promise<Plan | null> {
    const { data } = await supabaseAdmin
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single();
    return data as Plan | null;
  }
}
