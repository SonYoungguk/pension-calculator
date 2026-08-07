import { useMemo, useState } from 'react'
import averageIncome from './data/averageIncome.json'
import { calculate, deductedOption } from './engine/calculator'
import { INCOME_CAP_MULTIPLE, accrualRatePct } from './engine/constants'
import { REDISTRIBUTION_BRACKETS } from './engine/constants'
import { netPension } from './engine/netPension'
import { retirementLumpSum, severanceAllowance } from './engine/severance'
import { estimateTeacherIncome, TEACHER_DEFAULTS, TEACHER_SALARY_YEAR } from './engine/teacherIncome'
import type { PensionInput, PensionResult, YM } from './engine/types'
import { DEFAULT_ASSUMPTIONS } from './engine/types'

const AVG = averageIncome as Record<string, number>
/** 확보된 전체 평균액 고시의 마지막 연도 — 이후 연도는 평균액 인상률 가정으로 외삽 */
const AVG_YEAR = 2026
/** 교육공무원 정년 — 교육공무원법 제47조 (만 62세, 학기말 퇴직) */
const TEACHER_RETIRE_AGE = 62

/** 기준소득월액 법정 상한 (평균액 × 1.6배) — 기준연도가 미래면 가정 인상률로 외삽 */
function incomeCapFor(baseYear: number, avgGrowth: number): number {
  const avg =
    baseYear > AVG_YEAR ? AVG[AVG_YEAR] * Math.pow(1 + avgGrowth, baseYear - AVG_YEAR) : AVG[baseYear]
  return (avg ?? AVG[AVG_YEAR]) * INCOME_CAP_MULTIPLE
}

const won = new Intl.NumberFormat('ko-KR')
const fmtWon = (v: number) => `${won.format(Math.round(v))}원`
const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits)}%`

function parseYM(s: string): YM | null {
  const m = /^(\d{4})-(\d{2})$/.exec(s)
  if (!m) return null
  return [Number(m[1]), Number(m[2])]
}

interface FormState {
  hire: string
  retire: string
  incomeMode: 'direct' | 'teacher'
  baseIncome: string
  /** 직접 입력한 기준소득월액이 어느 연도 값인지 */
  baseYearSel: string
  grade: string
  homeroom: boolean
  headTeacher: boolean
  spouse: boolean
  children: string
  annualBonus: string
  overtimeMonthly: string
  hasMilitary: boolean
  militaryFrom: string
  militaryTo: string
  earlyPension: boolean
  salaryGrowth: string
  cpi: string
  gradeStep: string
  avgIncomeGrowth: string
}

const INITIAL: FormState = {
  hire: '',
  retire: '',
  incomeMode: 'direct',
  baseIncome: '',
  baseYearSel: String(AVG_YEAR),
  grade: '15',
  homeroom: false,
  headTeacher: false,
  spouse: false,
  children: '0',
  annualBonus: String(TEACHER_DEFAULTS.annualBonus),
  overtimeMonthly: String(TEACHER_DEFAULTS.overtimeMonthly),
  hasMilitary: false,
  militaryFrom: '',
  militaryTo: '',
  earlyPension: false,
  salaryGrowth: (DEFAULT_ASSUMPTIONS.salaryGrowth * 100).toString(),
  cpi: (DEFAULT_ASSUMPTIONS.cpi * 100).toString(),
  gradeStep: (DEFAULT_ASSUMPTIONS.gradeStep * 100).toString(),
  avgIncomeGrowth: (DEFAULT_ASSUMPTIONS.avgIncomeGrowth * 100).toString(),
}

/** 정근수당 산정용 근무연수 — 임용 후 경과 + 군복무 (근사) */
function estimateServiceYears(hire: YM | null, baseYear: number, militaryMonths: number): number {
  if (!hire) return 10
  return Math.max(0, baseYear - hire[0]) + militaryMonths / 12
}

type Built =
  | {
      ok: true
      input: PensionInput
      incomeClamped: boolean
      teacherEstimate: ReturnType<typeof estimateTeacherIncome> | null
    }
  | { ok: false; errors: string[] }

function buildInput(f: FormState): Built {
  const errors: string[] = []
  const hire = parseYM(f.hire)
  const retire = parseYM(f.retire)

  if (!hire) errors.push('임용 연월을 입력하세요.')
  if (!retire) errors.push('퇴직예정 연월을 입력하세요.')

  if (hire && hire[0] < 2010)
    errors.push('2009년 이전 임용자는 지원하지 않습니다(평균보수월액 자료 필요 — 공단에 문의하세요).')
  if (hire && retire && (retire[0] - hire[0]) * 12 + (retire[1] - hire[1]) < 0)
    errors.push('퇴직예정일이 임용일보다 빠릅니다.')
  if (retire && retire[0] < 2017) errors.push('2017년 이후 퇴직만 지원합니다.')

  let military: readonly [YM, YM] | null = null
  if (f.hasMilitary) {
    const from = parseYM(f.militaryFrom)
    const to = parseYM(f.militaryTo)
    if (!from || !to) errors.push('군복무 기간을 입력하세요.')
    else if ((to[0] - from[0]) * 12 + (to[1] - from[1]) < 0) errors.push('군복무 기간이 올바르지 않습니다.')
    else if (hire && (to[0] - hire[0]) * 12 + (to[1] - hire[1]) >= 0)
      errors.push('군복무 산입기간은 임용 전 기간이어야 합니다.')
    else military = [from, to]
  }

  // 소득: 직접 입력 또는 교원 호봉 기반 추정
  // 기준연도 — 교원 모드는 봉급표 연도로 고정, 직접 입력은 사용자가 고른 연도
  const baseYear = f.incomeMode === 'teacher' ? TEACHER_SALARY_YEAR : Number(f.baseYearSel) || AVG_YEAR
  let rawIncome = 0
  let teacherEstimate: ReturnType<typeof estimateTeacherIncome> | null = null
  if (f.incomeMode === 'teacher') {
    const militaryMonths = military
      ? (military[1][0] - military[0][0]) * 12 + (military[1][1] - military[0][1]) + 1
      : 0
    teacherEstimate = estimateTeacherIncome({
      grade: Number(f.grade),
      serviceYears: estimateServiceYears(hire, baseYear, militaryMonths),
      homeroom: f.homeroom,
      headTeacher: f.headTeacher,
      spouse: f.spouse,
      children: Number(f.children),
      annualBonus: Number(f.annualBonus) || 0,
      overtimeMonthly: Number(f.overtimeMonthly) || 0,
    })
    rawIncome = teacherEstimate.monthlyIncome
  } else {
    rawIncome = Number(f.baseIncome.replaceAll(',', ''))
    if (!f.baseIncome || !Number.isFinite(rawIncome) || rawIncome <= 0)
      errors.push('기준소득월액을 입력하세요.')
  }

  if (errors.length) return { ok: false, errors }

  const cap = incomeCapFor(baseYear, (Number(f.avgIncomeGrowth) || 0) / 100)
  const incomeClamped = rawIncome > cap
  return {
    ok: true,
    incomeClamped,
    teacherEstimate,
    input: {
      birthYear: 0, // 출생연도는 아래에서 채운다
      hire: hire!,
      retire: retire!,
      baseIncome: Math.min(rawIncome, cap),
      baseYear,
      military,
      includeP1Income: true,
      includeMilitaryInAvg: true,
      earlyPension: f.earlyPension,
      assumptions: {
        salaryGrowth: Number(f.salaryGrowth) / 100,
        cpi: Number(f.cpi) / 100,
        gradeStep: Number(f.gradeStep) / 100,
        avgIncomeGrowth: Number(f.avgIncomeGrowth) / 100,
      },
    },
  }
}

/** B/A가 소득재분배 구간 경계에 가까우면 해당 경계를 돌려준다 (스펙 §3.5) */
function nearBracketEdge(ratio: number): number | null {
  for (const [threshold] of REDISTRIBUTION_BRACKETS) {
    if (threshold > 2 || threshold <= 0.3) continue
    if (Math.abs(ratio - threshold) <= 0.02) return threshold
  }
  return null
}

export default function App() {
  const [f, setF] = useState<FormState>(INITIAL)
  const [birthYear, setBirthYear] = useState('')
  const set = (patch: Partial<FormState>) => setF((prev) => ({ ...prev, ...patch }))

  const built = useMemo(() => {
    const b = buildInput(f)
    if (!b.ok) return b
    const by = Number(birthYear)
    if (!/^\d{4}$/.test(birthYear) || by < 1940 || by > 2010)
      return { ok: false as const, errors: ['출생연도(4자리)를 입력하세요.'] }
    // 교원 정년(만 62세): 3~8월생은 그해 8/31, 9~2월생은 다음 해 2월 말 퇴직
    if (b.input.retire[0] > by + TEACHER_RETIRE_AGE + 1)
      return {
        ok: false as const,
        errors: [`퇴직예정일이 교원 정년(만 ${TEACHER_RETIRE_AGE}세)을 넘습니다. ${by + TEACHER_RETIRE_AGE}년 8월 31일 또는 ${by + TEACHER_RETIRE_AGE + 1}년 2월 말이 정년퇴직일입니다.`],
      }
    return { ...b, input: { ...b.input, birthYear: by } }
  }, [f, birthYear])

  type Results =
    | { kind: 'ok'; main: PensionResult; range: { min: number; max: number } | null }
    | { kind: 'err'; error: string }
    | null
  const results = useMemo((): Results => {
    if (!built.ok) return null
    try {
      const main = calculate(built.input)
      // ★법령 미확정 옵션 2가지의 조합 범위 (군복무가 있을 때만 의미 있음)
      let range: { min: number; max: number } | null = null
      if (built.input.military) {
        const amounts = [true, false].flatMap((a) =>
          [true, false].map(
            (b) => calculate({ ...built.input, includeP1Income: a, includeMilitaryInAvg: b }).monthlyPension,
          ),
        )
        range = { min: Math.min(...amounts), max: Math.max(...amounts) }
      }
      return { kind: 'ok', main, range }
    } catch (e) {
      return { kind: 'err', error: e instanceof Error ? e.message : String(e) }
    }
  }, [built])

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">공무원연금 계산기</h1>
          <p className="mt-1 text-sm text-slate-600">
            2010년 이후 임용자 대상 · 공무원연금법(법률 제21065호)·시행령(제35948호) 기준 · 모든 계산은
            브라우저 안에서만 수행됩니다
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <InputPanel f={f} set={set} birthYear={birthYear} setBirthYear={setBirthYear} />
          <div>
            {!built.ok && (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                <p className="mb-2 font-medium text-slate-700">입력을 완성하면 결과가 표시됩니다.</p>
                <ul className="list-inside list-disc space-y-1">
                  {built.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            {built.ok && results?.kind === 'err' && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                계산할 수 없습니다: {results.error}
              </div>
            )}
            {built.ok && results?.kind === 'ok' && (
              <div className="space-y-4">
                {built.teacherEstimate && (
                  <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold">추정 기준소득월액 (교원)</h3>
                      <span className="font-semibold">{fmtWon(built.teacherEstimate.monthlyIncome)}</span>
                    </div>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-slate-600">항목별 내역</summary>
                      <table className="mt-1.5 w-full text-xs">
                        <tbody>
                          {built.teacherEstimate.components.map((c) => (
                            <tr key={c.label} className="border-t border-slate-100">
                              <td className="py-1">
                                {c.label}
                                {c.note && <span className="ml-1 text-slate-400">({c.note})</span>}
                              </td>
                              <td className="py-1 text-right">{fmtWon(c.monthly)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </details>
                  </div>
                )}
                <ResultPanel
                  r={results.main}
                  range={results.range}
                  input={built.input}
                  incomeClamped={built.incomeClamped}
                />
              </div>
            )}
          </div>
        </div>

        <NoticeFooter />
      </div>
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200'

/**
 * 연·월 드롭다운. Safari는 <input type="month">를 지원하지 않아 자유 입력 텍스트로
 * 바뀌므로(형식 불일치로 계산 불가) 브라우저와 무관하게 동작하는 select를 쓴다.
 * value는 'YYYY-MM' (미완성이면 'YYYY-' / '-MM' / '').
 */
function YearMonthField({
  value,
  onChange,
  yearFrom,
  yearTo,
}: {
  value: string
  onChange: (v: string) => void
  yearFrom: number
  yearTo: number
}) {
  const [y = '', m = ''] = value.split('-')
  const years: number[] = []
  for (let yy = yearTo; yy >= yearFrom; yy--) years.push(yy)
  const update = (ny: string, nm: string) => onChange(ny || nm ? `${ny}-${nm}` : '')
  return (
    <div className="grid grid-cols-[3fr_2fr] gap-2">
      <select className={inputCls} value={y} onChange={(e) => update(e.target.value, m)}>
        <option value="">연도</option>
        {years.map((yy) => (
          <option key={yy} value={String(yy)}>
            {yy}년
          </option>
        ))}
      </select>
      <select className={inputCls} value={m} onChange={(e) => update(y, e.target.value)}>
        <option value="">월</option>
        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((mm) => (
          <option key={mm} value={mm}>
            {Number(mm)}월
          </option>
        ))}
      </select>
    </div>
  )
}

function InputPanel({
  f,
  set,
  birthYear,
  setBirthYear,
}: {
  f: FormState
  set: (p: Partial<FormState>) => void
  birthYear: string
  setBirthYear: (v: string) => void
}) {
  return (
    <section className="space-y-4 self-start rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">입력</h2>

      <div className="grid grid-cols-2 gap-3">
        <Field label="출생연도">
          <select
            className={inputCls}
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
          >
            <option value="">선택</option>
            {Array.from({ length: 2005 - 1950 + 1 }, (_, i) => 2005 - i).map((y) => (
              <option key={y} value={String(y)}>
                {y}년
              </option>
            ))}
          </select>
        </Field>
        <div />
        <Field label="임용 연월">
          <YearMonthField value={f.hire} onChange={(v) => set({ hire: v })} yearFrom={2010} yearTo={2035} />
        </Field>
        <Field
          label="퇴직예정 연월"
          hint={
            /^\d{4}$/.test(birthYear)
              ? `교원 정년(만 ${TEACHER_RETIRE_AGE}세) 기준 정년퇴직: ${Number(birthYear) + TEACHER_RETIRE_AGE}년 8월 31일(3~8월생) 또는 ${Number(birthYear) + TEACHER_RETIRE_AGE + 1}년 2월 말(9~2월생)`
              : undefined
          }
        >
          <YearMonthField
            value={f.retire}
            onChange={(v) => set({ retire: v })}
            yearFrom={2017}
            yearTo={
              /^\d{4}$/.test(birthYear)
                ? Math.min(2070, Number(birthYear) + TEACHER_RETIRE_AGE + 1)
                : 2070
            }
          />
        </Field>
      </div>

      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-medium text-slate-700">소득 입력 방식</legend>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            className="mt-0.5"
            checked={f.incomeMode === 'direct'}
            onChange={() => set({ incomeMode: 'direct' })}
          />
          <span>
            기준소득월액 직접 입력 <span className="text-slate-500">(권장)</span>
            <span className="mt-0.5 block text-xs text-slate-500">
              공무원연금공단 <b>연금복지포털</b>에서 본인 기준소득월액을 확인할 수 있습니다
            </span>
          </span>
        </label>
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input
            type="radio"
            className="mt-0.5"
            checked={f.incomeMode === 'teacher'}
            onChange={() => set({ incomeMode: 'teacher' })}
          />
          <span>
            교원 호봉 기반 추정
            <span className="mt-0.5 block text-xs text-slate-500">
              유·초·중등 교원 봉급표({TEACHER_SALARY_YEAR}년) + 주요 수당으로 추정합니다
            </span>
          </span>
        </label>

        {f.incomeMode === 'direct' ? (
          <div className="mt-3 grid grid-cols-[2fr_3fr] gap-2">
            <Field label="이 금액의 기준 연도" hint="연금복지포털에서 확인한 시점">
              <select
                className={inputCls}
                value={f.baseYearSel}
                onChange={(e) => set({ baseYearSel: e.target.value })}
              >
                {Array.from({ length: 15 }, (_, i) => AVG_YEAR + i).map((y) => (
                  <option key={y} value={String(y)}>
                    {y}년
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="기준소득월액 (원)"
              hint={`상한(평균액×1.6배${Number(f.baseYearSel) > AVG_YEAR ? ', 외삽' : ''}): ${won.format(Math.round(incomeCapFor(Number(f.baseYearSel) || AVG_YEAR, (Number(f.avgIncomeGrowth) || 0) / 100)))}원`}
            >
              <input
                className={inputCls}
                inputMode="numeric"
                placeholder="4,300,000"
                value={f.baseIncome}
                onChange={(e) => set({ baseIncome: e.target.value.replace(/[^\d,]/g, '') })}
              />
            </Field>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="호봉">
                <select className={inputCls} value={f.grade} onChange={(e) => set({ grade: e.target.value })}>
                  {Array.from({ length: 40 }, (_, i) => i + 1).map((g) => (
                    <option key={g} value={String(g)}>
                      {g}호봉
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="자녀 수">
                <select className={inputCls} value={f.children} onChange={(e) => set({ children: e.target.value })}>
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}명
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {(
                [
                  ['homeroom', '담임'],
                  ['headTeacher', '보직교사(부장)'],
                  ['spouse', '배우자 있음'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={f[key]} onChange={(e) => set({ [key]: e.target.checked })} />
                  {label}
                </label>
              ))}
            </div>
            <details>
              <summary className="cursor-pointer text-xs font-medium text-slate-600">
                변동 수당 조정 (성과상여금·시간외근무)
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <Field label="성과상여금 (연, 원)">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={f.annualBonus}
                    onChange={(e) => set({ annualBonus: e.target.value.replace(/\D/g, '') })}
                  />
                </Field>
                <Field label="시간외근무 등 (월, 원)">
                  <input
                    className={inputCls}
                    inputMode="numeric"
                    value={f.overtimeMonthly}
                    onChange={(e) => set({ overtimeMonthly: e.target.value.replace(/\D/g, '') })}
                  />
                </Field>
              </div>
            </details>
            <p className="text-xs text-amber-700">
              추정 모델입니다. 정근수당은 임용·군복무 기간에서 자동 계산되며, 실제 기준소득월액
              산정 방식(개인 3개 보수를 직종 평균으로 대체)과 달라 오차가 있을 수 있습니다.
              연금복지포털의 실제 값이 있으면 직접 입력을 쓰세요.
            </p>
          </div>
        )}
      </fieldset>

      <fieldset className="rounded-lg border border-slate-200 p-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={f.hasMilitary}
            onChange={(e) => set({ hasMilitary: e.target.checked })}
          />
          군복무 기간 산입 (임용 전 복무)
        </label>
        {f.hasMilitary && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="복무 시작">
              <YearMonthField value={f.militaryFrom} onChange={(v) => set({ militaryFrom: v })} yearFrom={1990} yearTo={2030} />
            </Field>
            <Field label="복무 종료">
              <YearMonthField value={f.militaryTo} onChange={(v) => set({ militaryTo: v })} yearFrom={1990} yearTo={2030} />
            </Field>
            <p className="col-span-2 text-xs text-amber-700">
              군복무 산입분의 소득 취급은 법령 문언만으로 확정되지 않습니다. 결과에 추정 범위를 함께
              표시하며, 정확한 값은 공단(1588-4321) 확인이 필요합니다.
            </p>
          </div>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          checked={f.earlyPension}
          onChange={(e) => set({ earlyPension: e.target.checked })}
        />
        조기퇴직연금 선택 (개시연령 전 감액 수령)
      </label>

      <details className="rounded-lg border border-slate-200 p-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-700">
          미래 가정값 조정 <span className="font-normal text-slate-500">(기본값: 최근 실적 평균)</span>
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(
            [
              ['salaryGrowth', '공무원보수인상률 (%/년)'],
              ['cpi', '물가변동률 (%/년)'],
              ['gradeStep', '호봉승급 기여 (%/년)'],
              ['avgIncomeGrowth', '전체 평균액 인상률 (%/년)'],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="number"
                step="0.1"
                className={inputCls}
                value={f[key]}
                onChange={(e) => set({ [key]: e.target.value })}
              />
            </Field>
          ))}
          <p className="col-span-2 text-xs text-slate-500">
            미래 보수·물가는 알 수 없으므로 가정입니다. 값을 바꿔 결과가 얼마나 달라지는지 확인해
            보세요.
          </p>
        </div>
      </details>
    </section>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

function ResultPanel({
  r,
  range,
  input,
  incomeClamped,
}: {
  r: PensionResult
  range: { min: number; max: number } | null
  input: PensionInput
  incomeClamped: boolean
}) {
  const lumpSumPath = r.service.total < 10
  const severance = severanceAllowance(
    r.finalIncomeAtRetirement,
    ((input.retire[0] - input.hire[0]) * 12 + (input.retire[1] - input.hire[1]) + 1) / 12,
  )
  const edge = nearBracketEdge(r.incomeRatio)
  const p3Years: number[] = []
  for (let y = Math.max(2016, input.hire[0]); y <= input.retire[0]; y++) p3Years.push(y)

  return (
    <section className="space-y-4">
      {incomeClamped && (
        <Callout tone="amber">
          입력한 기준소득월액이 법정 상한을 넘어 상한값으로 계산했습니다 (법 제30조제2항제2호).
        </Callout>
      )}

      {lumpSumPath ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">재직 10년 미만 — 퇴직일시금 대상</h2>
          <p className="mt-1 text-sm text-slate-600">
            퇴직연금은 10년 이상 재직해야 받을 수 있습니다 (법 제43조제1항).
          </p>
          <p className="mt-4 text-3xl font-bold">
            {fmtWon(retirementLumpSum(r.finalIncomeAtRetirement, r.service.total))}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            퇴직일시금 추정액 (재직 {r.service.total.toFixed(2)}년) · 산정액이 기여금+민법 소정 이자보다
            적으면 후자를 지급합니다
          </p>
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Stat label="퇴직수당 (별도 지급)" value={fmtWon(severance)} sub="퇴직 시점 명목 금액" />
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold">최초 월 연금액 (추정)</h2>
              <span className="text-xs text-slate-500">
                {r.startYear}년(만 {r.startAge}세) 개시 시점 금액
              </span>
            </div>
            <p className="mt-3 text-4xl font-bold tracking-tight">{fmtWon(r.monthlyPension)}</p>
            <p className="mt-1 text-sm text-slate-500">
              {input.baseYear}년 구매력으로 약 {fmtWon(r.realValueAtBaseYear)}
            </p>
            {r.gapYears > 0 && (
              <p className="mt-1 text-sm text-slate-500">
                퇴직({input.retire[0]}년) 시점 가치로는 약 <b>{fmtWon(r.pensionAtRetirementValue)}</b>
                <span className="text-xs"> — 공단 예상퇴직급여 조회의 표시 기준과 같은 시점입니다</span>
              </p>
            )}
            {range && (range.max - range.min > 1 || null) && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                군복무 소득 취급(미확정 2건)에 따라 <b>{fmtWon(range.min)} ~ {fmtWon(range.max)}</b> 범위로
                달라질 수 있습니다 — 공단 확인 필요
              </p>
            )}
            {r.gapYears > 0 && (
              <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                퇴직({input.retire[0]}년) 후 개시({r.startYear}년)까지 <b>무연금 {r.gapYears}년</b>이
                발생합니다. 명예퇴직은 지급개시연령 예외에 해당하지 않습니다.
              </p>
            )}
            {r.early && (
              <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm">
                <b>조기퇴직연금</b>: {r.early.startYear}년부터 {fmtWon(r.early.monthlyAmount)} (미달연수{' '}
                {r.early.shortfallYears}년 → 지급률 {pct(r.early.payRate, 0)})
              </div>
            )}
          </div>

          <NetPensionCard r={r} input={input} />

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold">재직기간 구간별 내역</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              총 재직 {r.service.total.toFixed(2)}년 (1기간 {r.service.p1.toFixed(2)} / 2기간{' '}
              {r.service.p2.toFixed(2)} / 3기간 {r.service.p3.toFixed(2)})
            </p>
            <table className="mt-3 w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <Row
                  name="1기간 (~2009.12)"
                  desc="평균보수월액 × 재직연수 × 2.5%"
                  amount={r.byPeriod.p1}
                />
                <Row
                  name="2기간 (2010~2015)"
                  desc="평균기준소득월액 × 이행률 × 재직연수 × 1.9%"
                  amount={r.byPeriod.p2}
                />
                <Row
                  name="3기간 (2016~)"
                  desc={
                    r.p3Detail.capApplied
                      ? `역전 방지 상한 적용 — 소득재분배 산식(${fmtWon(r.p3Detail.redistributed)})이 종전규정(${fmtWon(r.p3Detail.oldRule)})보다 커서 종전규정 금액 지급 (부칙 제13조제4항)`
                      : `소득재분배분 ${fmtWon(r.p3Detail.redistributionPart)} + 개인소득분 ${fmtWon(r.p3Detail.individualPart)}`
                  }
                  amount={r.byPeriod.p3}
                  badge={r.p3Detail.capApplied ? '상한 적용' : undefined}
                />
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 font-semibold">
                  <td className="py-2">합계</td>
                  <td className="py-2 text-right">{fmtWon(r.monthlyPension)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <BenefitOptions r={r} input={input} severance={severance} />

          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-semibold">적용된 파라미터</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="이행률" value={pct(r.transitionRate)} sub="시행령 부칙 제10조제10항" />
              <Stat label="본인 평균기준소득월액 (B)" value={fmtWon(r.B)} sub="개시시점 현재가치" />
              <Stat label="전체 3년 평균 (A)" value={fmtWon(r.A)} sub="개시시점 현재가치" />
              <Stat label="B/A (절사)" value={r.incomeRatio.toFixed(2)} />
              <Stat label="소득재분배 적용비율" value={pct(r.redistributionRate)} sub="부칙 제13조제2항" />
              <Stat
                label="기여금 납부 총액 (추정)"
                value={fmtWon(r.totalContributions)}
                sub="법 제67조 · 연도별 기여율 적용 · 산입기간 제외"
              />
            </div>
            {edge && (
              <Callout tone="amber" className="mt-3">
                B/A({r.incomeRatio.toFixed(2)})가 소득재분배 구간 경계({edge.toFixed(1)}) 부근입니다.
                소득이 조금 달라지면 적용비율이 계단식으로 바뀌어 연금액이 갑자기 변할 수 있습니다.
              </Callout>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                연도별 지급률 (재직 연도별로 각각 적용)
              </summary>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                {p3Years.map((y) => (
                  <span key={y} className="rounded bg-slate-100 px-2 py-1">
                    {y} · {accrualRatePct(y).toFixed(3)}%
                  </span>
                ))}
              </div>
            </details>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * 실수령액 추정 — 연금소득세 + 건강보험료(지역가입자).
 * 미래 세법·보험료율은 알 수 없으므로 현행(2026년) 제도를 "기준연도 구매력 금액"에 적용한다
 * (과표 구간이 장기적으로 물가를 따라간다는 가정 — 명목 금액에 적용하면 세금이 과대 추정된다).
 */
function NetPensionCard({ r, input }: { r: PensionResult; input: PensionInput }) {
  const [dependent, setDependent] = useState(false)
  const net = netPension(r.realValueAtBaseYear, dependent)
  const inflate = Math.pow(1 + input.assumptions.cpi, r.startYear - input.baseYear)
  const monthlyTax = (net.incomeTax + net.localTax) / 12

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">실수령액 추정 (현행 {input.baseYear}년 제도 기준)</h3>
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <input type="checkbox" checked={dependent} onChange={(e) => setDependent(e.target.checked)} />
          건강보험 피부양자 (보험료 없음)
        </label>
      </div>
      <p className="mt-0.5 text-xs text-slate-500">
        {input.baseYear}년 구매력 금액 기준. 과표 구간이 물가를 따라 조정된다고 가정합니다.
      </p>
      <table className="mt-3 w-full text-sm">
        <tbody className="divide-y divide-slate-100">
          <tr>
            <td className="py-1.5">세전 연금 ({input.baseYear}년 구매력)</td>
            <td className="py-1.5 text-right font-medium">{fmtWon(r.realValueAtBaseYear)}</td>
          </tr>
          <tr className="text-slate-600">
            <td className="py-1.5">
              소득세 + 지방소득세 (월환산)
              <span className="ml-1 text-xs text-slate-400">
                연금소득공제 {fmtWon(net.incomeDeduction)} · 과표 {fmtWon(net.taxBase)}/년
              </span>
            </td>
            <td className="py-1.5 text-right">−{fmtWon(monthlyTax)}</td>
          </tr>
          <tr className="text-slate-600">
            <td className="py-1.5">
              건강보험료 (지역가입자)
              <span className="ml-1 text-xs text-slate-400">연금소득의 50% × 7.09%</span>
            </td>
            <td className="py-1.5 text-right">−{fmtWon(net.healthInsurance)}</td>
          </tr>
          <tr className="text-slate-600">
            <td className="py-1.5">장기요양보험료</td>
            <td className="py-1.5 text-right">−{fmtWon(net.longTermCare)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <td className="py-2">월 실수령액 ({input.baseYear}년 구매력)</td>
            <td className="py-2 text-right">{fmtWon(net.netMonthly)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-1 text-xs text-slate-500">
        개시({r.startYear}년) 시점 명목으로는 약 {fmtWon(net.netMonthly * inflate)}
      </p>
      <Callout tone="amber" className="mt-2">
        인적공제는 본인 기본공제(150만원)만 반영했고, 다른 소득·재산·자동차 부과분과 부양가족
        공제는 포함하지 않은 추정입니다. 연금 외 소득이 있거나 재산이 많으면 실제 부담이
        달라집니다.
      </Callout>
    </div>
  )
}

/** 퇴직급여 종류별 비교 — 법 제43조. 셋 중 하나만 선택할 수 있고 퇴직수당은 별도다. */
function BenefitOptions({
  r,
  input,
  severance,
}: {
  r: PensionResult
  input: PensionInput
  severance: number
}) {
  const total = r.service.total
  const maxPensionYears = Math.floor(total)
  const [pensionYears, setPensionYears] = useState(10)
  const canDeduct = total > 10
  const py = Math.min(Math.max(pensionYears, 10), Math.max(10, maxPensionYears))
  const deducted = canDeduct && py < total ? deductedOption(input, py) : null
  const fullLump = retirementLumpSum(r.finalIncomeAtRetirement, total)
  const retireYear = input.retire[0]

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="font-semibold">퇴직급여 종류별 비교</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        셋 중 <b>하나만</b> 선택할 수 있으며, 선택 후 변경할 수 없습니다 (법 제43조). 퇴직수당은
        선택과 무관하게 별도 지급됩니다.
      </p>

      <div className="mt-3 space-y-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">① 퇴직연금 (종신)</span>
            <span className="font-semibold">월 {fmtWon(r.monthlyPension)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {r.startYear}년부터 사망 시까지 · 매년 물가연동 조정 · 퇴직({retireYear}년) 시점 가치로는
            월 {fmtWon(r.pensionAtRetirementValue)}
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">② 퇴직일시금 (연금 포기)</span>
            <span className="font-semibold">{fmtWon(fullLump)}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            퇴직({retireYear}년) 시 일시 수령 · 법 제43조제5항 산식 · 산정액이 기여금+민법 소정
            이자보다 적으면 후자를 지급 (참고: 기여금 원금 추정 {fmtWon(r.totalContributions)})
          </p>
        </div>

        {canDeduct && (
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">③ 퇴직연금공제일시금 (절충)</span>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                연금 선택 재직기간
                <select
                  className="rounded border border-slate-300 px-1.5 py-0.5 text-xs"
                  value={py}
                  onChange={(e) => setPensionYears(Number(e.target.value))}
                >
                  {Array.from({ length: maxPensionYears - 10 + 1 }, (_, i) => 10 + i).map((n) => (
                    <option key={n} value={n}>
                      {n}년
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {deducted ? (
              <>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded bg-slate-50 p-2">
                    <div className="text-xs text-slate-500">연금 ({r.startYear}년부터 종신)</div>
                    <div className="font-semibold">월 {fmtWon(deducted.monthlyPension)}</div>
                    <div className="text-xs text-slate-500">
                      퇴직 시점 가치 월 {fmtWon(deducted.monthlyPensionAtRetirement)}
                    </div>
                  </div>
                  <div className="rounded bg-slate-50 p-2">
                    <div className="text-xs text-slate-500">
                      일시금 (퇴직 시 · {deducted.deductedYears.toFixed(2)}년분)
                    </div>
                    <div className="font-semibold">{fmtWon(deducted.lumpSum)}</div>
                  </div>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  이른 재직기간 {py}년을 연금으로, 나머지를 일시금으로 환산한 추정입니다. 공단의
                  실제 산정 방식과 차이가 있을 수 있습니다.
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                전체 재직기간을 연금으로 선택한 상태입니다 (①과 동일).
              </p>
            )}
          </div>
        )}

        <div className="flex items-baseline justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
          <span className="text-sm font-medium">퇴직수당 (공통 · 별도 지급)</span>
          <span className="font-semibold">{fmtWon(severance)}</span>
        </div>
      </div>
    </div>
  )
}

function Row({ name, desc, amount, badge }: { name: string; desc: string; amount: number; badge?: string }) {
  return (
    <tr>
      <td className="py-2 pr-4">
        <div className="font-medium">
          {name}
          {badge && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {badge}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-slate-500">{desc}</div>
      </td>
      <td className="py-2 text-right align-top font-medium whitespace-nowrap">{fmtWon(amount)}</td>
    </tr>
  )
}

function Callout({
  tone,
  children,
  className = '',
}: {
  tone: 'amber' | 'red'
  children: React.ReactNode
  className?: string
}) {
  const cls = tone === 'amber' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-red-200 bg-red-50 text-red-700'
  return <div className={`rounded-lg border px-3 py-2 text-xs ${cls} ${className}`}>{children}</div>
}

function NoticeFooter() {
  return (
    <footer className="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-xs leading-relaxed text-slate-500">
      <p className="font-medium text-slate-700">
        이 결과는 추정치이며 법적 효력이 없습니다. 정확한 연금액은 공무원연금공단(☎ 1588-4321)에서
        확인하세요.
      </p>
      <p className="mt-1">입력값은 브라우저를 벗어나지 않으며 어떤 서버로도 전송되지 않습니다.</p>
      <p className="mt-2">
        근거: 공무원연금법(법률 제21065호) 제30조·제43조·제50조·제51조·제62조·부칙(법률 제15523호)
        제11조·제13조·제24조, 같은 법 시행령(대통령령 제35948호) 제5조·제10조·제26조·제58조·부칙(대통령령
        제29181호) 제10조제10항. 미래 보수인상률·물가변동률은 가정값이며, 수급 개시 후 물가연동 조정은
        최초 연금액과 별개로 매년 적용됩니다.
      </p>
    </footer>
  )
}
