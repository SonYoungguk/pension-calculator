// 연금 실수령액 추정 — 연금소득세 + 건강보험료 (지역가입자).
//
// 미래의 세법·보험료율은 알 수 없으므로 "현행(2026년) 제도"를 그대로 적용한다.
// 과표 구간이 장기적으로 물가를 따라 조정된다고 가정하면, 현행 제도는 실질(현재 구매력)
// 금액에 적용하는 것이 왜곡이 가장 적다. UI에서도 그렇게 사용할 것.
//
// 단순화 (전부 화면에 고지):
// - 2010년 이후 임용자만 지원하므로 연금 전액이 과세대상이다 (2002년 이전 기여분 비과세 이슈 없음)
// - 인적공제는 본인 기본공제 150만원만 반영 (부양가족·배우자공제 등 제외)
// - 건강보험 재산·자동차 부과분, 다른 소득 합산은 반영하지 않음

/** 연금소득공제 — 소득세법 제47조의2 (한도 900만원) */
export function pensionIncomeDeduction(annualTaxablePension: number): number {
  const p = annualTaxablePension
  let d: number
  if (p <= 3_500_000) d = p
  else if (p <= 7_000_000) d = 3_500_000 + (p - 3_500_000) * 0.4
  else if (p <= 14_000_000) d = 4_900_000 + (p - 7_000_000) * 0.2
  else d = 6_300_000 + (p - 14_000_000) * 0.1
  return Math.min(d, 9_000_000)
}

/** 종합소득세 기본세율 (2023년 개정 현행) — 과세표준에 대한 산출세액 */
export function basicIncomeTax(taxBase: number): number {
  if (taxBase <= 0) return 0
  const brackets: ReadonlyArray<readonly [number, number, number]> = [
    // [구간 상한, 세율, 누진공제]
    [14_000_000, 0.06, 0],
    [50_000_000, 0.15, 1_260_000],
    [88_000_000, 0.24, 5_760_000],
    [150_000_000, 0.35, 15_440_000],
    [300_000_000, 0.38, 19_940_000],
    [500_000_000, 0.4, 25_940_000],
    [1_000_000_000, 0.42, 35_940_000],
    [Infinity, 0.45, 65_940_000],
  ]
  const [, rate, sub] = brackets.find(([cap]) => taxBase <= cap)!
  return taxBase * rate - sub
}

/** 본인 기본공제 — 소득세법 제50조 */
const PERSONAL_DEDUCTION = 1_500_000
/** 표준세액공제 — 소득세법 제59조의4제9항 */
const STANDARD_TAX_CREDIT = 70_000
/** 건강보험료율 (2026) — 직장·지역 동일 */
const HEALTH_RATE = 0.0709
/** 공적연금소득의 보험료 부과 반영률 (2022.9 부과체계 개편) */
const PENSION_INCOME_RATIO = 0.5
/** 장기요양보험료율 — 건강보험료 대비 (2026) */
const LONG_TERM_CARE_RATE = 0.1295

export interface NetPensionResult {
  /** 월 세전 연금 */
  grossMonthly: number
  /** 연금소득공제 (연) */
  incomeDeduction: number
  /** 과세표준 (연) */
  taxBase: number
  /** 소득세 (연, 표준세액공제 반영) */
  incomeTax: number
  /** 지방소득세 (연, 소득세의 10%) */
  localTax: number
  /** 건강보험료 (월) */
  healthInsurance: number
  /** 장기요양보험료 (월) */
  longTermCare: number
  /** 월 실수령액 */
  netMonthly: number
}

/**
 * @param grossMonthly 월 세전 연금액
 * @param dependent 피부양자(자녀 직장보험 등) 여부 — true면 건강보험료 0
 */
export function netPension(grossMonthly: number, dependent = false): NetPensionResult {
  const annual = grossMonthly * 12
  const incomeDeduction = pensionIncomeDeduction(annual)
  const taxBase = Math.max(0, annual - incomeDeduction - PERSONAL_DEDUCTION)
  const incomeTax = Math.max(0, basicIncomeTax(taxBase) - STANDARD_TAX_CREDIT)
  const localTax = incomeTax * 0.1
  const healthInsurance = dependent ? 0 : grossMonthly * PENSION_INCOME_RATIO * HEALTH_RATE
  const longTermCare = healthInsurance * LONG_TERM_CARE_RATE
  return {
    grossMonthly,
    incomeDeduction,
    taxBase,
    incomeTax,
    localTax,
    healthInsurance,
    longTermCare,
    netMonthly: grossMonthly - (incomeTax + localTax) / 12 - healthInsurance - longTermCare,
  }
}
