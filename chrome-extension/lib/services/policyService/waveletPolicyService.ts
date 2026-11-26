import { DatabaseService } from '@root/lib/db';
import { BasePolicyService } from './basePolicyService';
import { PolicyClassification, WaveletKind, WaveletPolicyDecision } from './types';

export class WaveletPolicyService extends BasePolicyService {
  constructor(databaseService: DatabaseService) {
    super(databaseService);
  }

  protected get serviceName(): string {
    return 'WaveletPolicyService';
  }

  public async evaluate(url: string, waveletKind: WaveletKind): Promise<WaveletPolicyDecision> {
    const classification = await this.resolvePolicy(url);
    console.log(`[${this.serviceName}] Classification for ${url}: ${classification}, wavelet: ${waveletKind}`);
    return this.decide(classification);
  }

  private decide(classification: PolicyClassification): WaveletPolicyDecision {
    switch (classification) {
      case 'full_allow':
      case 'only_host':
      case 'default':
        return { action: 'allow' };

      case 'private':
      case 'full_deny':
        return { action: 'block', reason: classification };

      default:
        console.warn(`[${this.serviceName}] Unknown classification: ${classification}`);
        return { action: 'allow' };
    }
  }
}
