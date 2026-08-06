// 교원(유·초·중등) 기준소득월액 추정 — 봉급표(보수규정 별표 11) + 주요 수당.
//
// 주의: 법령상 기준소득월액은 "개인 과세소득에서 본인의 성과상여금·초과근무수당·연가보상비를
// 빼고 직종·직급별 평균액을 더해" 산정한다(시행령 제4조·제5조). 여기서는 본인 추정치를
// 그대로 쓰는 근사 모델이므로 오차가 있을 수 있다. 연금복지포털의 실제 값이 항상 우선한다.
import teacherSalary from '../data/teacherSalary.json'

const SALARY = teacherSalary as { year: number; pay: Record<string, number> }

export const TEACHER_SALARY_YEAR = SALARY.year

/** 호봉별 봉급 (월, 원) */
export function teacherBasePay(grade: number): number {
  const pay = SALARY.pay[String(grade)]
  if (!pay) throw new Error(`호봉 범위를 벗어났습니다: ${grade}`)
  return pay
}

export interface TeacherProfile {
  /** 호봉 (1~40) */
  grade: number
  /** 정근수당 산정용 근무연수 (군복무 포함) */
  serviceYears: number
  /** 담임 여부 — 교직수당 가산금 */
  homeroom: boolean
  /** 보직교사(부장) 여부 */
  headTeacher: boolean
  spouse: boolean
  /** 자녀 수 */
  children: number
  /** 성과상여금 연액 (등급·학교별 상이, 조정 가능) */
  annualBonus: number
  /** 시간외근무수당 등 월 추정액 (조정 가능) */
  overtimeMonthly: number
}

export const TEACHER_DEFAULTS = {
  annualBonus: 4_500_000,
  overtimeMonthly: 130_000,
}

export interface IncomeComponent {
  label: string
  monthly: number
  note?: string
}

/** 정근수당 가산금 (월) — 공무원수당규정 별표 2 (추가 가산금 포함) */
function longevityBonus(years: number): number {
  if (years < 5) return 30_000
  if (years < 10) return 50_000
  if (years < 15) return 60_000
  if (years < 20) return 80_000
  if (years < 25) return 110_000
  return 130_000
}

/** 가족수당 (월) — 공무원수당규정 제10조 */
function familyAllowance(spouse: boolean, children: number): number {
  let v = spouse ? 40_000 : 0
  if (children >= 1) v += 50_000
  if (children >= 2) v += 80_000
  if (children >= 3) v += 120_000 * (children - 2)
  return v
}

export function estimateTeacherIncome(p: TeacherProfile): {
  monthlyIncome: number
  components: IncomeComponent[]
} {
  const base = teacherBasePay(p.grade)
  // 정근수당: 연 2회(1·7월), 각 월봉급액 × 근무연수별 지급률(연 5%p, 10년 이상 50%)
  const longevityRate = Math.min(Math.max(Math.floor(p.serviceYears), 0), 10) * 0.05
  const components: IncomeComponent[] = [
    { label: `봉급 (${p.grade}호봉)`, monthly: base },
    { label: '교직수당', monthly: 250_000 },
    ...(p.homeroom ? [{ label: '담임수당', monthly: 200_000 }] : []),
    ...(p.headTeacher ? [{ label: '보직교사수당', monthly: 150_000 }] : []),
    {
      label: '정근수당 (월평균)',
      monthly: (base * longevityRate * 2) / 12,
      note: `연 2회 × 봉급의 ${Math.round(longevityRate * 100)}%`,
    },
    { label: '정근수당 가산금', monthly: longevityBonus(p.serviceYears) },
    { label: '명절휴가비 (월평균)', monthly: (base * 0.6 * 2) / 12, note: '연 2회 × 봉급의 60%' },
    { label: '성과상여금 (월평균)', monthly: p.annualBonus / 12, note: '등급·학교별 상이' },
    { label: '시간외근무수당 등', monthly: p.overtimeMonthly, note: '추정' },
    ...(p.spouse || p.children > 0
      ? [{ label: '가족수당', monthly: familyAllowance(p.spouse, p.children) }]
      : []),
  ]
  const monthlyIncome = components.reduce((s, c) => s + c.monthly, 0)
  return { monthlyIncome, components }
}
