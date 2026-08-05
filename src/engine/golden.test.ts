// reference_engine.py와의 출력 대조 — SPEC §0-1 "TypeScript 엔진을 짠 뒤 동일 입력으로 출력을 대조하세요."
// golden.json은 reference_engine.py를 실행해 생성한 기준값이다 (생성 스크립트: git log의 골든 생성 커밋 참조).
import { describe, expect, it } from 'vitest'
import { calculate } from './calculator'
import type { PensionInput, YM } from './types'
import { DEFAULT_ASSUMPTIONS } from './types'
import golden from './golden.json'

interface GoldenCase {
  input: {
    출생연: number
    임용: [number, number]
    퇴직: [number, number]
    기준소득월액: number
    군복무: [[number, number], [number, number]] | null
    일기간소득인정: boolean
    군복무_평균산입: boolean
    조기수령: boolean
  }
  월연금: number
  이행률: number
  BA: number
  적용비율: number
  구간별: { '1기간': number; '2기간': number; '3기간': number }
  상한적용: boolean
  개시연: number
  무연금년: number
  재직총년: number
  B: number
  A: number
  조기: { 수령개시연: number; 미달연수: number; 지급률: number; 월연금: number } | null
}

function toInput(g: GoldenCase['input']): PensionInput {
  return {
    birthYear: g.출생연,
    hire: g.임용 as YM,
    retire: g.퇴직 as YM,
    baseIncome: g.기준소득월액,
    baseYear: 2026,
    military: g.군복무 ? [g.군복무[0] as YM, g.군복무[1] as YM] : null,
    includeP1Income: g.일기간소득인정,
    includeMilitaryInAvg: g.군복무_평균산입,
    earlyPension: g.조기수령,
    assumptions: DEFAULT_ASSUMPTIONS,
  }
}

describe('reference_engine.py 골든 케이스 대조', () => {
  for (const [name, g] of Object.entries(golden as unknown as Record<string, GoldenCase>)) {
    it(`${name}: 월연금 ${Math.round(g.월연금).toLocaleString()}원`, () => {
      const r = calculate(toInput(g.input))
      expect(r.monthlyPension).toBeCloseTo(g.월연금, 0)
      expect(r.transitionRate).toBeCloseTo(g.이행률, 10)
      expect(r.incomeRatio).toBeCloseTo(g.BA, 10)
      expect(r.redistributionRate).toBeCloseTo(g.적용비율, 10)
      expect(r.byPeriod.p1).toBeCloseTo(g.구간별['1기간'], 0)
      expect(r.byPeriod.p2).toBeCloseTo(g.구간별['2기간'], 0)
      expect(r.byPeriod.p3).toBeCloseTo(g.구간별['3기간'], 0)
      expect(r.p3Detail.capApplied).toBe(g.상한적용)
      expect(r.startYear).toBe(g.개시연)
      expect(r.gapYears).toBe(g.무연금년)
      expect(r.service.total).toBeCloseTo(g.재직총년, 6)
      expect(r.B).toBeCloseTo(g.B, 0)
      expect(r.A).toBeCloseTo(g.A, 0)
      if (g.조기) {
        expect(r.early).not.toBeNull()
        expect(r.early!.startYear).toBe(g.조기.수령개시연)
        expect(r.early!.shortfallYears).toBe(g.조기.미달연수)
        expect(r.early!.payRate).toBeCloseTo(g.조기.지급률, 10)
        expect(r.early!.monthlyAmount).toBeCloseTo(g.조기.월연금, 0)
      } else {
        expect(r.early).toBeNull()
      }
    })
  }

  it('SPEC §5.3 기준 케이스 명시 검증: 4,874,116원 ±2,000', () => {
    const g = (golden as unknown as Record<string, GoldenCase>).base
    const r = calculate(toInput(g.input))
    expect(Math.abs(r.monthlyPension - 4_874_116)).toBeLessThan(2_000)
    expect(r.transitionRate).toBeCloseTo(1.0084, 10)
    expect(r.incomeRatio).toBe(0.79)
    expect(r.redistributionRate).toBe(1.2143)
    expect(r.p3Detail.capApplied).toBe(true)
    expect(r.startYear).toBe(2055)
    expect(r.startAge).toBe(65)
    expect(r.gapYears).toBe(8)
    expect(r.service.total).toBeCloseTo(30.33, 2)
  })
})
