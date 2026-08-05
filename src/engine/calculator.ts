// 퇴직연금 계산 엔진 — reference_engine.py의 TypeScript 포팅.
// 동일 입력에 대해 동일 출력을 내야 하며, 대조는 golden.test.ts가 수행한다.
import averageIncome from '../data/averageIncome.json'
import {
  accrualRatePct,
  EARLY_REDUCTION,
  pensionStartAge,
  REDISTRIBUTION_SERVICE_CAP,
  serviceCapYears,
} from './constants'
import { redistributionRate, transitionRate, truncateRatio } from './lookup'
import type { EarlyPension, PensionInput, PensionResult, YM } from './types'

const AVG = averageIncome as Record<string, number>
/** 평균액 고시 마지막 확보 연도 — 이후는 가정값으로 외삽 */
export const AVG_LAST_YEAR = 2026

/** a월부터 b월까지 포함 개월수 — 법 제25조제1항 */
function monthsBetween(a: YM, b: YM): number {
  return (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1
}

interface Segments {
  p1: number
  p2: number
  p3: number
}

/** 재직기간을 2009말/2015말 경계로 3분할 (개월) */
function splitPeriods(spans: ReadonlyArray<readonly [YM, YM]>): Segments {
  const seg = { p1: 0, p2: 0, p3: 0 }
  for (const [s, e] of spans) {
    for (let y = s[0]; y <= e[0]; y++) {
      const lo = y === s[0] ? s[1] : 1
      const hi = y === e[0] ? e[1] : 12
      const key = y <= 2009 ? 'p1' : y <= 2015 ? 'p2' : 'p3'
      seg[key] += hi - lo + 1
    }
  }
  return seg
}

export function calculate(inp: PensionInput): PensionResult {
  const { salaryGrowth: r, cpi: p, gradeStep, avgIncomeGrowth } = inp.assumptions
  const m = r + gradeStep // 기준소득월액 명목 성장률

  const retireYear = inp.retire[0]
  const startAge = pensionStartAge(retireYear)
  const startYear = inp.birthYear + startAge
  const gapYears = Math.max(0, startYear - retireYear)

  // ── 재직기간 3분할 ──
  const ownMonths = monthsBetween(inp.hire, inp.retire)
  const spans: Array<readonly [YM, YM]> = [[inp.hire, inp.retire]]
  if (inp.military) spans.push(inp.military)
  const seg = splitPeriods(spans)
  let totalMonths = seg.p1 + seg.p2 + seg.p3
  const priorMonths = seg.p1
  const laterMonths = seg.p2 + seg.p3

  const cap = serviceCapYears((seg.p1 + seg.p2) / 12)
  if (totalMonths / 12 > cap) totalMonths = cap * 12

  const ih = transitionRate(priorMonths, laterMonths)

  // ── 평균기준소득월액 (퇴직시점 → 개시시점 환산, 시행령 제10조제2항: 보수인상률) ──
  const incomeAtRetire = inp.baseIncome * Math.pow(1 + m, retireYear - inp.baseYear)
  const q = (1 + r) / (1 + m) // 과거 연도를 보수인상률로만 환산했을 때의 감쇠
  const n = inp.includeMilitaryInAvg ? totalMonths : ownMonths
  let qSum = 0
  for (let k = 0; k < n; k++) qSum += Math.pow(q, k / 12)
  const bAtRetire = (incomeAtRetire * qSum) / n
  const B = bAtRetire * Math.pow(1 + r, startYear - retireYear)

  // ── A값 (법 제30조제2항제1호: 3년 평균, 물가변동률 환산) ──
  const avg = (y: number) =>
    y > AVG_LAST_YEAR ? AVG[AVG_LAST_YEAR] * Math.pow(1 + avgIncomeGrowth, y - AVG_LAST_YEAR) : AVG[y]
  const aPrevYear =
    (avg(retireYear - 3) * Math.pow(1 + p, 2) + avg(retireYear - 2) * (1 + p) + avg(retireYear - 1)) / 3
  const A = aPrevYear * Math.pow(1 + r, startYear - (retireYear - 1))

  const incomeRatio = truncateRatio(B / A)
  const redistRate = redistributionRate(incomeRatio)
  const C = B * redistRate

  // ── 구간별 급여 ──
  // 1기간: 재직 20년 미만 전제(MVP) → 평균보수월액 × 재직연수 × 2.5%
  //   ★법령 미확정: 군복무 산입분의 1기간 소득을 인정할지 (includeP1Income)
  const p1Base = inp.includeP1Income ? B : 0
  const y1 = p1Base * (seg.p1 / 12) * 0.025
  // 2기간: 평균기준소득월액 × 이행률 × 재직기간 × 1.9%
  const y2 = B * ih * (seg.p2 / 12) * 0.019
  // 3기간: 지급률은 재직 연도별로 각각 적용한다 (퇴직연도 지급률 일괄 적용 금지)
  let s3 = 0
  for (let y = Math.max(2016, inp.hire[0]); y <= retireYear; y++) {
    const lo = y === inp.hire[0] ? inp.hire[1] : 1
    const hi = y === retireYear ? inp.retire[1] : 12
    s3 += ((hi - lo + 1) / 12) * ((accrualRatePct(y) - 1.0) / 100)
  }
  const p3Years = seg.p3 / 12
  const individual = B * ih * s3
  const redistributedPart = C * ih * Math.min(p3Years, REDISTRIBUTION_SERVICE_CAP) * 0.01
  const revised = individual + redistributedPart
  const oldRule = B * ih * (s3 + p3Years * 0.01) // 소득재분배 미적용 산식
  const y3 = Math.min(revised, oldRule) // ★역전 방지 상한 — 부칙 제13조제4항
  const capApplied = revised > oldRule

  const monthlyPension = y1 + y2 + y3

  // ── 조기퇴직연금 (법 제43조제2항) ──
  let early: EarlyPension | null = null
  if (inp.earlyPension) {
    const shortfall = Math.min(5, startYear - Math.max(retireYear, inp.birthYear + 60))
    if (shortfall > 0) {
      const payRate = EARLY_REDUCTION.find(([k]) => shortfall <= k)![1]
      const earlyStartYear = startYear - shortfall
      early = {
        startYear: earlyStartYear,
        shortfallYears: shortfall,
        payRate,
        monthlyAmount: (monthlyPension / Math.pow(1 + r, startYear - earlyStartYear)) * payRate,
      }
    }
  }

  return {
    service: { total: totalMonths / 12, p1: seg.p1 / 12, p2: seg.p2 / 12, p3: seg.p3 / 12 },
    transitionRate: ih,
    B,
    A,
    incomeRatio,
    redistributionRate: redistRate,
    byPeriod: { p1: y1, p2: y2, p3: y3 },
    p3Detail: { individualPart: individual, redistributionPart: redistributedPart, redistributed: revised, oldRule, capApplied },
    monthlyPension,
    startYear,
    startAge,
    gapYears,
    realValueAtBaseYear: monthlyPension / Math.pow(1 + p, startYear - inp.baseYear),
    finalIncomeAtRetirement: incomeAtRetire,
    early,
  }
}
