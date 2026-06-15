import { NextResponse } from 'next/server';
import { PLANS, CHAIN_ID, USDC_ADDRESS } from '@/utils/constants';

export async function GET() {
  return NextResponse.json({
    network: 'base',
    chainId: CHAIN_ID,
    paymentToken: USDC_ADDRESS,
    plans: PLANS,
  });
}
