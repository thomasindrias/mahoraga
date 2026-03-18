/**
 * Tracks cumulative cost and dispatch count for budget enforcement.
 */
export class CostTracker {
  private totalCostUsd = 0;
  private dispatchCount = 0;

  /**
   * Record a completed dispatch's cost.
   * @param costUsd - Cost in USD for this dispatch
   */
  recordDispatch(costUsd: number): void {
    this.totalCostUsd += costUsd;
    this.dispatchCount++;
  }

  /**
   * Check if another dispatch is allowed within budget.
   * @param maxCostPerRun - Maximum total cost per run
   * @param maxDispatchesPerRun - Maximum dispatch count per run
   * @returns Whether dispatch is allowed and reason if not
   */
  canDispatch(maxCostPerRun: number, maxDispatchesPerRun: number): { allowed: boolean; reason?: string } {
    if (this.totalCostUsd >= maxCostPerRun) {
      return { allowed: false, reason: `Cost budget exhausted ($${this.totalCostUsd.toFixed(2)}/$${maxCostPerRun.toFixed(2)})` };
    }
    if (this.dispatchCount >= maxDispatchesPerRun) {
      return { allowed: false, reason: `Dispatch limit reached (${this.dispatchCount}/${maxDispatchesPerRun})` };
    }
    return { allowed: true };
  }

  /**
   * Get current cost and dispatch summary.
   * @returns Summary of total cost and dispatch count
   */
  getSummary(): { totalCostUsd: number; dispatchCount: number } {
    return { totalCostUsd: this.totalCostUsd, dispatchCount: this.dispatchCount };
  }
}
