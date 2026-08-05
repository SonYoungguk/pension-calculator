import { describe, expect, it } from 'vitest'
import { redistributionRate, transitionRate, truncateRatio } from './lookup'

describe('이행률 조회 (시행령 부칙 제10조제10항)', () => {
  it('기준 케이스: 종전 10개월 + 이후 29년 7개월 → 100.84%', () => {
    // 종전 1년 미만은 신규자가 아니라 1월이상~1년미만 열이다
    expect(transitionRate(10, 355)).toBeCloseTo(1.0084, 10)
  })
  it('신규자: 이후 1년 이하 → 77.25%, 32년 초과 → 103.44%', () => {
    expect(transitionRate(0, 12)).toBeCloseTo(0.7725, 10)
    expect(transitionRate(0, 396)).toBeCloseTo(1.0344, 10)
  })
  it('경계: 이후기간이 정확히 n년이면 "n-1년초과~n년이하" 행', () => {
    expect(transitionRate(0, 24)).toBeCloseTo(0.7803, 10) // 1년초과~2년이하
    expect(transitionRate(0, 25)).toBeCloseTo(0.7835, 10) // 2년초과~3년이하
  })
  it('재직기간 합계 33년 초과 시 33년에 해당하는 비율 적용 (단서)', () => {
    // 종전 5년(5년이상~6년미만 열) + 이후 30년(합 35년)
    // → 그 열에서 합계 33년에 해당하는 마지막 유효 행(이후 27초과~28이하, 대각 셀)의 비율
    expect(transitionRate(5 * 12, 30 * 12)).toBe(transitionRate(5 * 12, 28 * 12))
    // 신규자 36년 재직도 33년(32년초과 행) 비율
    expect(transitionRate(0, 36 * 12)).toBeCloseTo(1.0344, 10)
  })
  it('20년 고원: 종전 단독 20년 이상이면 저값 고정', () => {
    expect(transitionRate(20 * 12, 6)).toBeCloseTo(0.6746, 10)
  })
})

describe('소득재분배 (부칙 제13조제2항) — 공식 예시 SPEC §5.1', () => {
  const A = 4_380_000
  it('B=600만 → 비율 1.36 → 88.46% → C=5,307,600', () => {
    const ratio = truncateRatio(6_000_000 / A)
    expect(ratio).toBe(1.36)
    expect(redistributionRate(ratio)).toBe(0.8846)
    expect(6_000_000 * redistributionRate(ratio)).toBeCloseTo(5_307_600, 0)
  })
  it('B=150만 → 비율 0.34 → 216.67% → C=3,250,050', () => {
    const ratio = truncateRatio(1_500_000 / A)
    expect(ratio).toBe(0.34)
    expect(redistributionRate(ratio)).toBe(2.1667)
    expect(1_500_000 * redistributionRate(ratio)).toBeCloseTo(3_250_050, 0)
  })
  it('구간 경계는 계단식: 1.09 → 100%, 1.10 → 95.45%', () => {
    expect(redistributionRate(1.09)).toBe(1.0)
    expect(redistributionRate(1.1)).toBe(0.9545)
  })
  it('양끝: 0.3 미만 300%, 1.6 이상 81.25%', () => {
    expect(redistributionRate(0.29)).toBe(3.0)
    expect(redistributionRate(2.5)).toBe(0.8125)
  })
})
