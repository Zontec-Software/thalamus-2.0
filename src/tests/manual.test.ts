import { describe, expect, it } from 'vitest'
import { MANUAL_SECTIONS, sectionById } from '../help/manual'
import { PAGE_TOURS } from '../tour/steps'

describe('manual do sistema', () => {
  it('tem ids únicos e numeração sequencial', () => {
    const ids = MANUAL_SECTIONS.map(section => section.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('completo')
    expect(MANUAL_SECTIONS[0].number).toBe('1.1')
  })

  it('só aponta para seções e guias que existem', () => {
    for (const section of MANUAL_SECTIONS) {
      for (const id of section.related ?? []) expect(sectionById(id), `${section.id} → ${id}`).toBeDefined()
      if (section.tour) expect(PAGE_TOURS[section.tour], `${section.id} → ${section.tour}`).toBeDefined()
    }
  })
})
