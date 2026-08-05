import { describe, expect, it } from 'vitest'
import { validateData } from './validate'

describe('데이터 불변식 (SPEC §2)', () => {
  it('이행률표·소득재분배표·지급률·인상률·평균액이 전 검증을 통과한다', () => {
    expect(() => validateData()).not.toThrow()
  })
})
