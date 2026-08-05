// 법령 상수. 근거 조문은 공무원연금_계산기_파라미터_레퍼런스.md 참조.

/** 연도별 연금지급률(%) — 공무원연금법 부칙(법률 제15523호) 제13조제1항, 2035년 이후는 본문 제43조제4항 1.7% */
export function accrualRatePct(year: number): number {
  if (year <= 2016) return 1.878
  if (year <= 2020) return Math.round((1.878 - 0.022 * (year - 2016)) * 1000) / 1000
  if (year <= 2025) return Math.round((1.79 - 0.01 * (year - 2020)) * 1000) / 1000
  if (year <= 2035) return Math.round((1.74 - 0.004 * (year - 2025)) * 1000) / 1000
  return 1.7
}

/** 소득재분배 적용비율 — 부칙 제13조제2항. [구간상한(미만), 적용비율] */
export const REDISTRIBUTION_BRACKETS: ReadonlyArray<readonly [number, number]> = [
  [0.3, 3.0], [0.4, 2.1667], [0.5, 1.75], [0.6, 1.5], [0.7, 1.3333],
  [0.8, 1.2143], [0.9, 1.125], [1.0, 1.0556], [1.1, 1.0], [1.2, 0.9545],
  [1.3, 0.9167], [1.4, 0.8846], [1.5, 0.8571], [1.6, 0.8333], [99.0, 0.8125],
]

/** 조기퇴직연금 감액 — 법 제43조제2항. [미달연수 상한, 지급률] */
export const EARLY_REDUCTION: ReadonlyArray<readonly [number, number]> = [
  [1, 0.95], [2, 0.9], [3, 0.85], [4, 0.8], [5, 0.75],
]

/** 퇴직수당 지급비율 — 시행령 제58조제1항 (2010년 이후 기간 기준). [재직연수 상한(미만), 비율] */
export const SEVERANCE_RATES: ReadonlyArray<readonly [number, number]> = [
  [5, 0.065], [10, 0.2275], [15, 0.2925], [20, 0.325], [Infinity, 0.39],
]

/** 기준소득월액 상한 배수 — 법 제30조제2항제2호, 제67조제2항 */
export const INCOME_CAP_MULTIPLE = 1.6
/** 기여율 — 법 제67조제2항 (2020년 이후) */
export const CONTRIBUTION_RATE = 0.09
/** 소득재분배가 적용되는 재직기간 상한 — 부칙 제13조제2항 단서 */
export const REDISTRIBUTION_SERVICE_CAP = 30
/** 퇴직수당 재직연수 상한 — 시행령 제58조제2항 */
export const SEVERANCE_SERVICE_CAP = 33
/** 이행률표 재직기간 합계 상한 — 시행령 부칙 제10조제10항 단서 */
export const TRANSITION_SERVICE_CAP = 33

/** 재직기간·기여금 납부기간 상한 — 법 부칙 제24조 (2015년말 재직기간 기준 단계) */
export function serviceCapYears(yearsBefore2016: number): number {
  if (yearsBefore2016 >= 21) return 33
  if (yearsBefore2016 >= 17) return 34
  if (yearsBefore2016 >= 15) return 35
  return 36
}

/** 지급개시연령 — 법 부칙 제11조제1항 (1996년 이후 임용자 기본) */
export function pensionStartAge(retireYear: number): number {
  if (retireYear <= 2021) return 60
  if (retireYear <= 2023) return 61
  if (retireYear <= 2026) return 62
  if (retireYear <= 2029) return 63
  if (retireYear <= 2032) return 64
  return 65
}
