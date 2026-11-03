import { describe, expect, it } from 'vitest'
import { activeFilterOp, dateFilterMatches, numberFilterMatches } from '../views/products/shared'

describe('filtros de valor e data', () => {
  it('número usa maior, menor e igual quando a condição ainda é a de texto', () => {
    expect(activeFilterOp('contains', 'number')).toBe('gt')
    expect(numberFilterMatches(8500, '4200', 'contains')).toBe(true)
    expect(numberFilterMatches(1800, '4200', 'gt')).toBe(false)
    expect(numberFilterMatches(4200, '4200', 'gte')).toBe(true)
    expect(numberFilterMatches(1800, '4200', 'lt')).toBe(true)
    expect(numberFilterMatches(4200, '4200', 'lte')).toBe(true)
    expect(numberFilterMatches(4200.5, '4200,5', 'equals')).toBe(true)
    expect(numberFilterMatches(8500, '8500', 'not-equals')).toBe(false)
  })

  it('data usa depois, antes, a partir de e até', () => {
    expect(activeFilterOp('contains', 'date')).toBe('after')
    expect(dateFilterMatches('2026-10-30', '2026-10-22', 'after')).toBe(true)
    expect(dateFilterMatches('2026-10-22', '2026-10-22', 'after')).toBe(false)
    expect(dateFilterMatches('2026-10-22', '2026-10-22', 'from')).toBe(true)
    expect(dateFilterMatches('2026-10-15', '2026-10-22', 'before')).toBe(true)
    expect(dateFilterMatches('2026-10-22', '2026-10-22', 'until')).toBe(true)
    expect(dateFilterMatches('2026-10-30T11:00:00.000Z', '2026-10-30', 'equals')).toBe(true)
    expect(dateFilterMatches('', '2026-10-30', 'equals')).toBe(false)
    expect(dateFilterMatches(undefined, '2026-10-30', 'not-equals')).toBe(true)
  })
})
