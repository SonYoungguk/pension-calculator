// 경계 케이스 — SPEC §5.4
import { describe, expect, it } from 'vitest'
import { calculate } from './calculator'
import type { PensionInput } from './types'
import { DEFAULT_ASSUMPTIONS } from './types'

function input(overrides: Partial<PensionInput>): PensionInput {
  return {
    birthYear: 1990,
    hire: [2016, 1],
    retire: [2045, 12],
    baseIncome: 4_000_000,
    baseYear: 2026,
    military: null,
    includeP1Income: true,
    includeMilitaryInAvg: true,
    earlyPension: false,
    assumptions: DEFAULT_ASSUMPTIONS,
    ...overrides,
  }
}

describe('구간 경계 (SPEC §5.4)', () => {
  it('2009-12 임용은 1기간이 생기고, 2010-01 임용은 생기지 않는다', () => {
    const dec = calculate(input({ hire: [2009, 12], retire: [2040, 12] }))
    const jan = calculate(input({ hire: [2010, 1], retire: [2040, 12] }))
    expect(dec.service.p1).toBeCloseTo(1 / 12, 10)
    expect(dec.byPeriod.p1).toBeGreaterThan(0)
    expect(jan.service.p1).toBe(0)
    expect(jan.byPeriod.p1).toBe(0)
  })

  it('2015-12 임용은 2기간이 생기고, 2016-01 임용은 전액 3기간이다', () => {
    const dec = calculate(input({ hire: [2015, 12], retire: [2045, 12] }))
    const jan = calculate(input({ hire: [2016, 1], retire: [2045, 12] }))
    expect(dec.service.p2).toBeCloseTo(1 / 12, 10)
    expect(dec.byPeriod.p2).toBeGreaterThan(0)
    expect(jan.service.p2).toBe(0)
    expect(jan.byPeriod.p2).toBe(0)
  })

  it('재직 30년 초과분은 소득재분배 없이 전액 소득비례다', () => {
    // 2016-01 ~ 2047-06 = 3기간만 31.5년. 재분배분은 30년에서 멈춰야 한다
    const r = calculate(input({ birthYear: 1986, hire: [2016, 1], retire: [2047, 6], baseIncome: 6_200_000 }))
    expect(r.service.p3).toBeGreaterThan(30)
    const C = r.B * r.redistributionRate
    expect(r.p3Detail.redistributionPart).toBeCloseTo(C * r.transitionRate * 30 * 0.01, 4)
  })

  it('2016년 이후 임용 36년 초과 재직은 36년으로 절단된다', () => {
    const r = calculate(input({ birthYear: 1980, hire: [2010, 1], retire: [2047, 12] })) // 38년
    expect(r.service.total).toBe(36)
  })

  it('저소득 구간(적용비율 > 100%)에서는 역전 방지 상한이 반드시 걸린다', () => {
    const r = calculate(input({ baseIncome: 2_400_000, hire: [2016, 1], retire: [2040, 12] }))
    expect(r.redistributionRate).toBeGreaterThan(1)
    expect(r.p3Detail.capApplied).toBe(true)
    expect(r.byPeriod.p3).toBeCloseTo(r.p3Detail.oldRule, 6)
  })

  it('군복무 산입기간이 2009/2010에 걸치면 1기간과 2기간으로 쪼개진다', () => {
    const r = calculate(
      input({ birthYear: 1990, hire: [2019, 3], retire: [2047, 8], military: [[2009, 6], [2011, 3]] }),
    )
    expect(r.service.p1).toBeCloseTo(7 / 12, 10) // 2009.6~2009.12
    expect(r.service.p2).toBeCloseTo(15 / 12, 10) // 2010.1~2011.3
  })
})
