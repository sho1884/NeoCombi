import { describe, it, expect } from 'vitest'

// Scaffold smoke test. Verifies that the test infrastructure (vitest)
// runs end-to-end. Real tests will replace / extend this as features land.

describe('scaffold smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2)
  })
})
