// 퇴직수당(시행령 제58조)·퇴직일시금(법 제51조→제43조제5항) — SPEC §5.5
import { describe, expect, it } from 'vitest'
import { retirementLumpSum, severanceAllowance } from './severance'

describe('퇴직수당', () => {
  const income = 5_000_000
  it('재직연수 구간별 비율: 6.5 / 22.75 / 29.25 / 32.5 / 39%', () => {
    expect(severanceAllowance(income, 3)).toBeCloseTo(income * 3 * 0.065, 6)
    expect(severanceAllowance(income, 7)).toBeCloseTo(income * 7 * 0.2275, 6)
    expect(severanceAllowance(income, 12)).toBeCloseTo(income * 12 * 0.2925, 6)
    expect(severanceAllowance(income, 17)).toBeCloseTo(income * 17 * 0.325, 6)
    expect(severanceAllowance(income, 25)).toBeCloseTo(income * 25 * 0.39, 6)
  })
  it('구간 경계는 이상~미만: 정확히 5년이면 22.75%', () => {
    expect(severanceAllowance(income, 5)).toBeCloseTo(income * 5 * 0.2275, 6)
  })
  it('재직연수 33년 상한 (시행령 제58조제2항)', () => {
    expect(severanceAllowance(income, 36)).toBeCloseTo(income * 33 * 0.39, 6)
  })
  it('1년 미만 재직은 지급 대상이 아니다', () => {
    expect(severanceAllowance(income, 0.5)).toBe(0)
  })
})

describe('퇴직일시금 (재직 10년 미만)', () => {
  it('산식: 기준소득월액 × 재직연수 × (975/1000 + 65/10000 × (재직연수−5))', () => {
    expect(retirementLumpSum(4_000_000, 8)).toBeCloseTo(4_000_000 * 8 * (0.975 + 0.0065 * 3), 6)
  })
  it('5년 미만이면 (재직연수−5) 항이 음수로 반영된다', () => {
    expect(retirementLumpSum(4_000_000, 3)).toBeCloseTo(4_000_000 * 3 * (0.975 + 0.0065 * -2), 6)
  })
})
