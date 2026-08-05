import transitionTable from '../data/transitionRates.json'
import { REDISTRIBUTION_BRACKETS } from './constants'

const TABLE = transitionTable as (number | null)[][]

/**
 * 이행률 조회 — 시행령 부칙(제29181호) 제10조제10항.
 * 행 = 이후기간(2010년 이후), 열 = 종전기간(2009년 이전).
 * 열 인덱스: 0=32년이상, 1=31~32, …, 31=1~2년, 32=1월이상~1년미만, 33=신규자.
 * 행 인덱스: 0=1년이하, 1=1년초과~2년이하, …, 32=32년초과.
 * 재직기간 합계가 33년을 초과하면 33년에 해당하는 비율을 적용한다(단서).
 *
 * @param priorMonths 종전기간 개월수
 * @param laterMonths 이후기간 개월수
 * @returns 이행률 (예: 1.0084)
 */
export function transitionRate(priorMonths: number, laterMonths: number): number {
  if (priorMonths < 0 || laterMonths < 0) throw new Error('재직기간이 음수입니다')

  let col: number
  if (priorMonths <= 0) col = 33
  else if (priorMonths < 12) col = 32
  else if (priorMonths >= 32 * 12) col = 0
  else col = 32 - Math.floor(priorMonths / 12)

  let row: number
  if (laterMonths % 12 === 0) row = laterMonths / 12 - 1
  else row = Math.floor(laterMonths / 12)
  row = Math.min(32, Math.max(0, row))

  // 33년 초과 단서: 합계가 33년을 넘어 빈 셀에 닿으면, 해당 종전 열에서
  // 재직기간 합계 33년에 해당하는 마지막 유효 행(대각 셀)의 비율을 적용한다.
  while (row > 0 && TABLE[row][col] === null) row--

  const v = TABLE[row][col]
  if (v === null) {
    throw new Error(`이행률표에 값이 없는 조합입니다: 종전 ${priorMonths}개월 + 이후 ${laterMonths}개월`)
  }
  return v / 100
}

/**
 * 소득재분배 적용비율 조회 — 부칙 제13조제2항.
 * @param ratio B/A를 소수 둘째 자리에서 절사한 값
 */
export function redistributionRate(ratio: number): number {
  for (const [threshold, rate] of REDISTRIBUTION_BRACKETS) {
    if (ratio < threshold) return rate
  }
  throw new Error(`소득재분배 구간을 찾을 수 없습니다: ${ratio}`)
}

/** B/A 절사 (소수 둘째 자리) — 공단 산정 사례 기준 */
export function truncateRatio(ba: number): number {
  return Math.floor(ba * 100) / 100
}
