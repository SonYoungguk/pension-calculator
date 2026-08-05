// 데이터 불변식 검증 — SPEC §2. 앱 부팅 시(개발 모드) 실행하며, 실패는 곧 데이터 훼손이다.
// 이 검사들은 법령 원문 대조를 거쳐 수동으로 통과시킨 것들의 회귀 방지용이다.
import transitionTable from '../data/transitionRates.json'
import rateSeries from '../data/rateSeries.json'
import averageIncome from '../data/averageIncome.json'
import { accrualRatePct, REDISTRIBUTION_BRACKETS } from './constants'

const TABLE = transitionTable as (number | null)[][]
const RATES = rateSeries as Record<string, { salary: number | null; cpi: number | null; pension: number | null }>
const AVG = averageIncome as Record<string, number>

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`데이터 검증 실패: ${msg}`)
}

export function validateData(): void {
  // 이행률표: 행 k(1부터)의 유효 셀 수 = 35 - k (삼각구조)
  assert(TABLE.length === 33, `이행률표 행 수 ${TABLE.length} ≠ 33`)
  TABLE.forEach((row, i) => {
    assert(row.length === 34, `이행률표 ${i + 1}행 열 수 ${row.length} ≠ 34`)
    const valid = row.filter((v) => v !== null).length
    assert(valid === 34 - i, `이행률표 ${i + 1}행 유효 셀 ${valid} ≠ ${34 - i}`)
  })
  // 대각선(각 행의 첫 유효값) 단조증가
  const diag = TABLE.map((row) => row.find((v) => v !== null)!)
  diag.forEach((v, i) => i > 0 && assert(v > diag[i - 1], `이행률표 대각선 단조성 위반: ${i + 1}행`))
  // 신규자 열 단조증가, 범위 77.25 ~ 103.44
  const newcomer = TABLE.map((row) => row[33]!)
  newcomer.forEach((v, i) => i > 0 && assert(v > newcomer[i - 1], `신규자 열 단조성 위반: ${i + 1}행`))
  assert(newcomer[0] === 77.25 && newcomer[32] === 103.44, '신규자 열 범위 불일치')

  // 소득재분배: 구간 하한 r에 대해 적용비율 ≈ (1 + 0.5(r-1)) / r
  for (let i = 1; i < REDISTRIBUTION_BRACKETS.length; i++) {
    const lo = REDISTRIBUTION_BRACKETS[i - 1][0]
    const rate = REDISTRIBUTION_BRACKETS[i][1]
    const expected = (1 + 0.5 * (lo - 1)) / lo
    assert(Math.abs(rate - expected) < 5e-5, `소득재분배 검산식 불일치: 하한 ${lo}`)
  }

  // 지급률: 2016 = 1.878 → 2035 = 1.700, 인하폭 0.022 / 0.01 / 0.004
  assert(accrualRatePct(2016) === 1.878 && accrualRatePct(2035) === 1.7, '지급률 양끝값 불일치')
  for (let y = 2017; y <= 2035; y++) {
    const step = Math.round((accrualRatePct(y - 1) - accrualRatePct(y)) * 1000) / 1000
    const expected = y <= 2020 ? 0.022 : y <= 2025 ? 0.01 : 0.004
    assert(step === expected, `지급률 인하폭 불일치: ${y}년 ${step}`)
  }

  // 인상률 시계열: 연금인상률(t) == 물가변동률(t-1), 2021~2026
  for (let y = 2021; y <= 2026; y++) {
    assert(RATES[y]?.pension === RATES[y - 1]?.cpi, `연금인상률(${y}) ≠ 물가변동률(${y - 1})`)
  }

  // 기준소득월액 평균액: 2011~2026 전 연도 존재.
  // ★단조증가를 가정하지 말 것 — 2021년만 코로나로 전년 대비 감소(-0.74%)
  for (let y = 2011; y <= 2026; y++) assert(AVG[y] !== undefined, `평균액 결측: ${y}년`)
  for (let y = 2012; y <= 2026; y++) {
    if (y === 2021) assert(AVG[y] < AVG[y - 1], '2021년 감소가 사라짐 — 데이터 확인 필요')
    else assert(AVG[y] >= AVG[y - 1], `${y}년 평균액이 감소 — 2021년 외 감소는 데이터 오류 의심`)
  }
}
