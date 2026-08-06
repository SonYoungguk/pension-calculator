// 실수령액 모듈 — 연금소득세(소득세법 제47조의2·제55조)·건강보험료
import { describe, expect, it } from 'vitest'
import { basicIncomeTax, netPension, pensionIncomeDeduction } from './netPension'

describe('연금소득공제 (소득세법 제47조의2)', () => {
  it('구간별 산식과 일치한다', () => {
    expect(pensionIncomeDeduction(3_000_000)).toBe(3_000_000) // 350만 이하 전액
    expect(pensionIncomeDeduction(5_000_000)).toBe(3_500_000 + 1_500_000 * 0.4)
    expect(pensionIncomeDeduction(10_000_000)).toBe(4_900_000 + 3_000_000 * 0.2)
    expect(pensionIncomeDeduction(20_000_000)).toBe(6_300_000 + 6_000_000 * 0.1)
  })
  it('한도 900만원', () => {
    expect(pensionIncomeDeduction(50_000_000)).toBe(9_000_000)
  })
})

describe('종합소득세 기본세율 (누진공제 방식)', () => {
  it('구간 경계에서 연속이다', () => {
    for (const edge of [14_000_000, 50_000_000, 88_000_000, 150_000_000]) {
      expect(basicIncomeTax(edge + 1) - basicIncomeTax(edge)).toBeLessThan(1)
    }
  })
  it('알려진 값: 과표 1,400만 → 84만, 과표 5,000만 → 624만', () => {
    expect(basicIncomeTax(14_000_000)).toBeCloseTo(840_000, 0)
    expect(basicIncomeTax(50_000_000)).toBeCloseTo(50_000_000 * 0.15 - 1_260_000, 0)
  })
})

describe('실수령액', () => {
  it('저액 연금(월 40만)은 공제만으로 세금 0', () => {
    const r = netPension(400_000)
    expect(r.incomeTax).toBe(0)
    expect(r.netMonthly).toBeCloseTo(400_000 - r.healthInsurance - r.longTermCare, 6)
  })

  it('월 100만원: 과표 = 1,200만 − 공제, 건보 = 연금×50%×7.09%', () => {
    const r = netPension(1_000_000)
    const annual = 12_000_000
    const expectedBase = annual - (4_900_000 + (annual - 7_000_000) * 0.2) - 1_500_000
    expect(r.taxBase).toBeCloseTo(expectedBase, 6)
    expect(r.incomeTax).toBeCloseTo(Math.max(0, expectedBase * 0.06 - 70_000), 4)
    expect(r.healthInsurance).toBeCloseTo(1_000_000 * 0.5 * 0.0709, 6)
    expect(r.longTermCare).toBeCloseTo(r.healthInsurance * 0.1295, 6)
    expect(r.netMonthly).toBeCloseTo(
      1_000_000 - (r.incomeTax + r.localTax) / 12 - r.healthInsurance - r.longTermCare,
      6,
    )
  })

  it('피부양자면 건강보험료가 0이다', () => {
    const r = netPension(1_000_000, true)
    expect(r.healthInsurance).toBe(0)
    expect(r.longTermCare).toBe(0)
  })

  it('실수령액은 세전보다 작고, 공제 항목 합과 정합적이다', () => {
    const r = netPension(2_000_000)
    expect(r.netMonthly).toBeLessThan(2_000_000)
    const deductions = (r.incomeTax + r.localTax) / 12 + r.healthInsurance + r.longTermCare
    expect(r.grossMonthly - r.netMonthly).toBeCloseTo(deductions, 6)
  })
})
