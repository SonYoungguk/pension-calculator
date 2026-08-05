// 원본 법령 CSV → src/data/*.json 변환
// 법령 표가 개정되면 CSV만 교체하고 이 스크립트를 다시 실행한다: npm run convert-data
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'src', 'data')
mkdirSync(outDir, { recursive: true })

const readCsv = (name) =>
  readFileSync(join(root, name), 'utf-8')
    .replace(/^﻿/, '')
    .trim()
    .split('\n')
    .map((line) => line.split(','))

// ── 이행률표: 33행 × 34열 삼각행렬, 빈 셀은 null ──
{
  const rows = readCsv('이행률표_시행령_부칙_제10조제10항.csv')
  const table = rows.slice(1).map((r) => r.slice(1, 35).map((c) => (c.trim() ? Number(c) : null)))
  writeFileSync(join(outDir, 'transitionRates.json'), JSON.stringify(table))
}

// ── 인상률 시계열: 연도 → { 보수, 물가, 연금 } (%, 없으면 null) ──
{
  const rows = readCsv('보수인상률_물가변동률_시계열.csv')
  const out = {}
  for (const r of rows.slice(1)) {
    const num = (s) => (s && s.trim() ? Number(s) : null)
    out[r[0]] = { salary: num(r[1]), cpi: num(r[2]), pension: num(r[3]) }
  }
  writeFileSync(join(outDir, 'rateSeries.json'), JSON.stringify(out))
}

// ── 전체 공무원 기준소득월액 평균액 (고시연도 → 원, 미확보 연도는 제외) ──
{
  const rows = readCsv('전체공무원_기준소득월액_평균액.csv')
  const out = {}
  for (const r of rows.slice(1)) {
    if (r[2] && r[2].trim()) out[r[0]] = Number(r[2])
  }
  writeFileSync(join(outDir, 'averageIncome.json'), JSON.stringify(out))
}

console.log('src/data/*.json 생성 완료')
