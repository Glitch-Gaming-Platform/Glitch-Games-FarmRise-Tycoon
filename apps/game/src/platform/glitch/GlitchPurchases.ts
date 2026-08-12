import type { GlitchClient, GlitchResult } from './GlitchClient.js';

export interface VerifiedPurchase {
  readonly purchase_type?: string;
  readonly purchase_amount?: number;
  readonly currency?: string;
  readonly transaction_id?: string;
  readonly item_sku?: string;
  readonly item_name?: string;
  readonly quantity?: number;
  readonly metadata?: Record<string, unknown>;
}

/** Revenue endpoint kept dormant until a storefront/backend verifies a purchase. */
export class GlitchPurchases {
  constructor(
    private readonly client: GlitchClient,
    private readonly titleId: string,
    private readonly revenueBuild: boolean,
  ) {}

  recordVerified(
    installId: string | null,
    purchase: VerifiedPurchase,
  ): Promise<GlitchResult<unknown>> | null {
    if (!installId || !this.revenueBuild) return null;
    return this.client.post(`/titles/${this.titleId}/purchases`, {
      game_install_id: installId,
      ...purchase,
    });
  }
}
