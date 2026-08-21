/**
 * Universal Agent Brain Main Subsystem Entry Point
 *
 * Implements the Universal Agent Brain interface and runtime lifecycle for SanMine Space.
 */

import { UniversalBrainRunOptions, UniversalBrainRunResult } from './types.js';
import { brainDecisionEngine } from './decisionEngine.js';

export class UniversalAgentBrain {
  /**
   * Primary entry point to execute an arbitrary user request through the LLM brain.
   */
  async executeTask(options: UniversalBrainRunOptions): Promise<UniversalBrainRunResult> {
    return await brainDecisionEngine.run(options);
  }
}

export const universalAgentBrain = new UniversalAgentBrain();
