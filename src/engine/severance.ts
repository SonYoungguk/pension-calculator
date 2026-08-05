import { SEVERANCE_RATES, SEVERANCE_SERVICE_CAP } from './constants'

/**
 * 퇴직수당 — 법 제62조제2항, 시행령 제58조.
 * 산식: 재직기간(년) × 기준소득월액 × 재직연수 구간별 비율. 재직연수 33년 상한.
 * 재직기간에는 군복무 산입·타 연금 합산 기간을 포함하지 않는다(법 제25조제4항).
 *
 * @param finalMonthlyIncome 퇴직한 날의 전날이 속하는 달의 기준소득월액 (명목)
 * @param ownServiceYears 산입 기간을 제외한 본무 재직연수
 */
export function severanceAllowance(finalMonthlyIncome: number, ownServiceYears: number): number {
  if (ownServiceYears < 1) return 0
  const years = Math.min(ownServiceYears, SEVERANCE_SERVICE_CAP)
  const rate = SEVERANCE_RATES.find(([capYears]) => years < capYears)![1]
  return finalMonthlyIncome * years * rate
}

/**
 * 퇴직일시금 (재직 10년 미만) — 법 제51조제2항이 준용하는 제43조제5항 계산식.
 * 기준소득월액 × 재직연수 × (975/1000 + 65/10000 × (재직연수 − 5)). 재직연수 36년 상한.
 * 산정액이 "기여금 + 민법 제379조 이자"보다 적으면 후자를 지급하지만(제51조제3항),
 * 기여금 납부 이력이 없으므로 여기서는 산식 값만 계산한다. UI에서 하한 존재를 고지할 것.
 *
 * @param finalMonthlyIncome 퇴직한 날의 전날이 속하는 달의 기준소득월액 (명목)
 * @param totalServiceYears 산입 기간을 포함한 재직연수
 */
export function retirementLumpSum(finalMonthlyIncome: number, totalServiceYears: number): number {
  const years = Math.min(totalServiceYears, 36)
  return finalMonthlyIncome * years * (975 / 1000 + (65 / 10000) * (years - 5))
}
