// 교원 기준소득월액 추정 모델
import { describe, expect, it } from 'vitest'
import { estimateTeacherIncome, teacherBasePay, TEACHER_DEFAULTS } from './teacherIncome'
import type { TeacherProfile } from './teacherIncome'

const BASE: TeacherProfile = {
  grade: 15,
  serviceYears: 8,
  homeroom: false,
  headTeacher: false,
  spouse: false,
  children: 0,
  annualBonus: TEACHER_DEFAULTS.annualBonus,
  overtimeMonthly: TEACHER_DEFAULTS.overtimeMonthly,
}

describe('교원 봉급표 (별표 11, 2026)', () => {
  it('공식 페이지 대조값과 일치한다', () => {
    expect(teacherBasePay(1)).toBe(2_041_500)
    expect(teacherBasePay(15)).toBe(2_889_700)
    expect(teacherBasePay(40)).toBe(6_205_700)
  })
  it('호봉에 대해 단조증가한다', () => {
    for (let g = 2; g <= 40; g++) expect(teacherBasePay(g)).toBeGreaterThan(teacherBasePay(g - 1))
  })
  it('범위 밖 호봉은 오류다', () => {
    expect(() => teacherBasePay(0)).toThrow()
    expect(() => teacherBasePay(41)).toThrow()
  })
})

describe('수당 추정', () => {
  it('구성 항목 합계가 기준소득월액 추정치다', () => {
    const r = estimateTeacherIncome(BASE)
    expect(r.monthlyIncome).toBeCloseTo(r.components.reduce((s, c) => s + c.monthly, 0), 6)
  })

  it('정근수당은 근무연수 × 5%p, 10년에서 50%로 상한', () => {
    const base = teacherBasePay(15)
    const y8 = estimateTeacherIncome(BASE)
    const rate8 = y8.components.find((c) => c.label.startsWith('정근수당 ('))!.monthly
    expect(rate8).toBeCloseTo((base * 0.4 * 2) / 12, 6)
    const y30 = estimateTeacherIncome({ ...BASE, serviceYears: 30 })
    const rate30 = y30.components.find((c) => c.label.startsWith('정근수당 ('))!.monthly
    expect(rate30).toBeCloseTo((base * 0.5 * 2) / 12, 6)
  })

  it('담임·보직 수당은 체크 시에만 붙는다 (20만/15만)', () => {
    const off = estimateTeacherIncome(BASE).monthlyIncome
    const on = estimateTeacherIncome({ ...BASE, homeroom: true, headTeacher: true }).monthlyIncome
    expect(on - off).toBeCloseTo(350_000, 6)
  })

  it('가족수당: 배우자 4만 + 첫째 5만 + 둘째 8만 + 셋째부터 각 12만', () => {
    const none = estimateTeacherIncome(BASE).monthlyIncome
    const fam = estimateTeacherIncome({ ...BASE, spouse: true, children: 3 }).monthlyIncome
    expect(fam - none).toBeCloseTo(40_000 + 50_000 + 80_000 + 120_000, 6)
  })

  it('정근수당 가산금 구간: 4년 3만 / 12년 6만 / 27년 13만', () => {
    const at = (y: number) =>
      estimateTeacherIncome({ ...BASE, serviceYears: y }).components.find(
        (c) => c.label === '정근수당 가산금',
      )!.monthly
    expect(at(4)).toBe(30_000)
    expect(at(12)).toBe(60_000)
    expect(at(27)).toBe(130_000)
  })
})
