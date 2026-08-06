// 퇴직급여 선택지(공제일시금)·기여금·퇴직시점 가치 — 법 제43조제3항·제6항, 제67조
import { describe, expect, it } from 'vitest'
import { calculate, deductedOption } from './calculator'
import { contributionRate } from './constants'
import { deductedLumpSum } from './severance'
import type { PensionInput } from './types'
import { DEFAULT_ASSUMPTIONS } from './types'

const BASE: PensionInput = {
  birthYear: 1990,
  hire: [2016, 1],
  retire: [2035, 12], // 정확히 20년
  baseIncome: 4_000_000,
  baseYear: 2026,
  military: null,
  includeP1Income: true,
  includeMilitaryInAvg: true,
  earlyPension: false,
  assumptions: DEFAULT_ASSUMPTIONS,
}

describe('퇴직시점 가치 환산', () => {
  it('개시시점 월연금을 보수인상률^무연금년수로 나눈 값이다', () => {
    const r = calculate(BASE)
    expect(r.pensionAtRetirementValue).toBeCloseTo(
      r.monthlyPension / Math.pow(1.023, r.startYear - 2035),
      6,
    )
    expect(r.pensionAtRetirementValue).toBeLessThan(r.monthlyPension)
  })
})

describe('공제일시금 (법 제43조제6항)', () => {
  it('산식: 기준소득월액 × 공제연수 × (975/1000 + 65/10000 × 공제연수)', () => {
    expect(deductedLumpSum(5_000_000, 4)).toBeCloseTo(5_000_000 * 4 * (0.975 + 0.0065 * 4), 6)
    expect(deductedLumpSum(5_000_000, 0)).toBe(0)
  })

  it('연금 선택 연수를 전체 재직으로 잡으면 원래 연금과 같다', () => {
    const full = calculate(BASE)
    const opt = deductedOption(BASE, full.service.total)
    expect(opt.monthlyPension).toBeCloseTo(full.monthlyPension, 6)
    expect(opt.deductedYears).toBe(0)
    expect(opt.lumpSum).toBe(0)
  })

  it('연금 10년 선택 시: 연금은 줄고, 공제연수는 나머지 전부', () => {
    const full = calculate(BASE)
    const opt = deductedOption(BASE, 10)
    expect(opt.monthlyPension).toBeLessThan(full.monthlyPension)
    expect(opt.monthlyPension).toBeGreaterThan(0)
    expect(opt.deductedYears).toBeCloseTo(10, 6)
    expect(opt.lumpSum).toBeCloseTo(deductedLumpSum(full.finalIncomeAtRetirement, 10), 6)
  })

  it('절단은 나중 재직기간부터다 — 남는 연금 연수의 지급률은 이른 연도 것', () => {
    // 2016~2035 재직에서 연금 10년 선택 → 2016~2025년의 지급률(높은 쪽)이 남아야 한다.
    // 연도별 지급률이 단조 감소하므로, 연금 월액이 (전체 연금 × 10/20)보다 크면 이른 기간이 남은 것.
    const full = calculate(BASE)
    const opt = deductedOption(BASE, 10)
    expect(opt.monthlyPension).toBeGreaterThan((full.monthlyPension * 10) / 20)
  })
})

describe('기여금 납부 총액 (법 제67조)', () => {
  it('연도별 기여율 단계(8→9%)를 적용해 합산한다', () => {
    const r = calculate({ ...BASE, retire: [2017, 12] }) // 2016~2017 두 해만
    const inc = (y: number) => 4_000_000 * Math.pow(1 + 0.023 + 0.015, y - 2026)
    const expected = inc(2016) * 0.08 * 12 + inc(2017) * 0.0825 * 12
    expect(r.totalContributions).toBeCloseTo(expected, 4)
  })

  it('기여율 단계가 법정값과 일치한다', () => {
    expect(contributionRate(2015)).toBe(0.07)
    expect(contributionRate(2016)).toBe(0.08)
    expect(contributionRate(2019)).toBe(0.0875)
    expect(contributionRate(2030)).toBe(0.09)
  })
})
