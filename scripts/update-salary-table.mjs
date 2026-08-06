// 교원 봉급표(공무원보수규정 별표 11) 자동 갱신
// 인사혁신처 공식 봉급표 페이지(mpm.go.kr)에서 해당 연도 표를 파싱해
// 교원봉급표.csv에 추가하고 src/data/teacherSalary.json을 재생성한다.
//
//   node scripts/update-salary-table.mjs [연도]   (기본: 올해)
//
// 페이지 구조가 바뀌어 파싱에 실패하면 명확히 실패한다 — 조용히 틀리게 두지 않는다.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSV = join(root, '교원봉급표.csv')
const year = Number(process.argv[2] ?? new Date().getFullYear())

const res = await fetch(`https://www.mpm.go.kr/mpm/info/resultPay/bizSalary/${year}/`)
if (!res.ok) throw new Error(`인사혁신처 봉급표 페이지 응답 오류: HTTP ${res.status}`)
const html = await res.text()

const start = html.indexOf('유치원')
if (start < 0) throw new Error('페이지에서 교원 봉급표 섹션을 찾지 못했습니다')
const section = html.slice(start, start + 20000)
const text = section
  .replace(/<[^>]+>/g, '|')
  .replace(/\|+/g, '|')
  .replace(/\s+/g, ' ')

// "|호봉| |봉급(원)|" 패턴: |1 | |2,041,500 | ... 호봉·금액 쌍 40개
const pairs = [...text.matchAll(/\|(\d{1,2}) \|[^|]*\|([\d,]{7,10})\s*\|/g)].map((m) => [
  Number(m[1]),
  Number(m[2].replaceAll(',', '')),
])
const table = new Map()
for (const [grade, pay] of pairs) {
  if (grade >= 1 && grade <= 40 && !table.has(grade)) table.set(grade, pay)
  if (table.size === 40) break
}
if (table.size !== 40) throw new Error(`호봉 40개를 찾지 못했습니다 (${table.size}개) — 페이지 구조 변경 의심`)
for (let g = 2; g <= 40; g++) {
  if (table.get(g) <= table.get(g - 1)) throw new Error(`봉급이 호봉에 대해 증가하지 않습니다: ${g}호봉`)
}

// CSV 갱신 (연도별 누적, 같은 연도는 교체)
let rows = []
try {
  rows = readFileSync(CSV, 'utf-8').trim().split('\n').slice(1).map((l) => l.split(','))
} catch {
  /* 최초 실행 */
}
rows = rows.filter((r) => Number(r[0]) !== year)
for (let g = 1; g <= 40; g++) rows.push([String(year), String(g), String(table.get(g))])
rows.sort((a, b) => Number(a[0]) - Number(b[0]) || Number(a[1]) - Number(b[1]))
writeFileSync(CSV, '연도,호봉,봉급(원)\n' + rows.map((r) => r.join(',')).join('\n') + '\n')

// 최신 연도만 JSON으로 (앱은 기준연도 표 하나만 쓴다)
const latest = Math.max(...rows.map((r) => Number(r[0])))
const json = { year: latest, pay: {} }
for (const r of rows) if (Number(r[0]) === latest) json.pay[r[1]] = Number(r[2])
writeFileSync(join(root, 'src', 'data', 'teacherSalary.json'), JSON.stringify(json))

console.log(`${year}년 교원 봉급표 갱신 완료 (1호봉 ${table.get(1).toLocaleString()}원 ~ 40호봉 ${table.get(40).toLocaleString()}원)`)
