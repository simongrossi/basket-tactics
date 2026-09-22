import { expect, it } from 'vitest';
import { formatDistance, movementBudgetToMps, mpsToMovementBudget } from '../displayUnits';
it('convertit les distances terrain en mètres et le budget par transition en m/s', () => {
  expect(formatDistance(37)).toBe('1,0 m');
  expect(movementBudgetToMps(148)).toBe(1);
  expect(mpsToMovementBudget(1)).toBe(148);
  for (const budget of [40, 75, 100, 200]) {
    expect(mpsToMovementBudget(movementBudgetToMps(budget))).toBeCloseTo(budget, 12);
  }
});
