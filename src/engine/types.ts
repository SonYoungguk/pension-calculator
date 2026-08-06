/** 연월. month는 1~12 */
export type YM = readonly [year: number, month: number]

/** 미래 가정값 — 전부 UI에 노출하고 사용자가 조정할 수 있어야 한다 */
export interface Assumptions {
  /** 공무원보수인상률 (연, 예: 0.023) */
  salaryGrowth: number
  /** 전국소비자물가변동률 (연) */
  cpi: number
  /** 호봉승급 기여분 — 기준소득월액 명목 증가율 = salaryGrowth + gradeStep */
  gradeStep: number
  /** 전체 공무원 기준소득월액 평균액 인상률 (외삽용) */
  avgIncomeGrowth: number
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  salaryGrowth: 0.023,
  cpi: 0.021,
  gradeStep: 0.015,
  avgIncomeGrowth: 0.023,
}

export interface PensionInput {
  birthYear: number
  hire: YM
  retire: YM
  /** 기준연도 시점 본인 기준소득월액 (원) */
  baseIncome: number
  /** baseIncome이 어느 연도 값인지 */
  baseYear: number
  /** 군복무 산입기간 (없으면 null) */
  military: readonly [YM, YM] | null
  /** ★법령 미확정: 2009년 이전 군복무분의 1기간 소득 인정 여부 */
  includeP1Income: boolean
  /** ★법령 미확정: 군복무 기간을 평균기준소득월액 분모에 포함할지 */
  includeMilitaryInAvg: boolean
  /** 조기퇴직연금 선택 */
  earlyPension: boolean
  assumptions: Assumptions
}

export interface EarlyPension {
  startYear: number
  shortfallYears: number
  payRate: number
  monthlyAmount: number
}

export interface PensionResult {
  /** 재직기간 (년) */
  service: { total: number; p1: number; p2: number; p3: number }
  transitionRate: number
  /** 평균기준소득월액 (연금 개시시점 현재가치) */
  B: number
  /** 전체 공무원 3년 평균 (A값, 개시시점 현재가치) */
  A: number
  /** floor(B/A, 2자리) */
  incomeRatio: number
  /** 소득재분배 적용비율 */
  redistributionRate: number
  /** 구간별 월액 */
  byPeriod: { p1: number; p2: number; p3: number }
  p3Detail: {
    /** 개인소득분 (B × 이행률 × Σ연도별(지급률−1%)) */
    individualPart: number
    /** 소득재분배분 (C × 이행률 × min(재직, 30년) × 1%) */
    redistributionPart: number
    /** 개정규정 산식 합계 */
    redistributed: number
    /** 종전규정 산식 (소득재분배 미적용) */
    oldRule: number
    /** 역전 방지 상한 적용 여부 — 부칙 제13조제4항 */
    capApplied: boolean
  }
  monthlyPension: number
  startYear: number
  startAge: number
  /** 퇴직 후 연금 개시까지 무연금 기간 (년) */
  gapYears: number
  /** 기준연도 구매력으로 환산한 월액 */
  realValueAtBaseYear: number
  /** 퇴직 시점 명목 기준소득월액 (퇴직수당·일시금 산정 기초) */
  finalIncomeAtRetirement: number
  /** 월 연금액을 퇴직 시점 가치로 되돌린 금액 — 공단 예상퇴직급여 조회와 같은 기준 */
  pensionAtRetirementValue: number
  /** 재직 중 기여금 납부 총액 추정 (명목 합계, 산입기간 제외) — 법 제67조 */
  totalContributions: number
  early: EarlyPension | null
}

/** 공제일시금 선택 결과 — 법 제43조제3항·제6항 */
export interface DeductedOption {
  /** 연금으로 받는 재직연수 */
  pensionYears: number
  /** 일시금으로 받는 재직연수 (공제재직연수) */
  deductedYears: number
  /** 감액된 월 연금액 (개시 시점) */
  monthlyPension: number
  /** 감액된 월 연금액 (퇴직 시점 가치) */
  monthlyPensionAtRetirement: number
  /** 공제일시금 (퇴직 시 수령, 명목) */
  lumpSum: number
}
