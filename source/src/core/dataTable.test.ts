import { describe, expect, it } from 'vitest'
import { columnKinds, looksLikeTable, parseNumber, parseTable, suggestChart, tableFromValue, tableToValue, toSeries, toTSV } from './dataTable'

describe('parseTable', () => {
  it('reads Excel clipboard (TSV) and pads ragged rows', () => {
    const t = parseTable('月份\t收縮壓\t舒張壓\r\n一月\t128\t82\r\n二月\t125\r\n\r\n')
    expect(t.columns).toEqual(['月份', '收縮壓', '舒張壓'])
    expect(t.rows).toEqual([
      ['一月', '128', '82'],
      ['二月', '125', ''],
    ])
  })

  it('reads CSV with quoted cells', () => {
    const t = parseTable('項目,說明\n"A, B","第一行\n第二行"\n"say ""hi""",x')
    expect(t.rows[0]).toEqual(['A, B', '第一行\n第二行'])
    expect(t.rows[1][0]).toBe('say "hi"')
  })

  it('round-trips through TSV', () => {
    const t = parseTable('a\tb\n1\t2')
    expect(parseTable(toTSV(t))).toEqual(t)
  })
})

describe('parseNumber', () => {
  it.each([
    ['1,234', 1234],
    ['１２．５', 12.5],
    ['NT$1,200', 1200],
    ['35%', 35],
    ['-3.2', -3.2],
  ])('%s → %s', (s, n) => expect(parseNumber(s)).toBe(n))

  it('treats blanks and dashes as missing, units as text', () => {
    expect(parseNumber('')).toBeNull()
    expect(parseNumber('—')).toBeNull()
    expect(parseNumber('14.2 g/dL')).toBeUndefined()
    expect(parseNumber('13.5–17.5')).toBeUndefined()
  })
})

describe('series and suggestion', () => {
  it('treats month column as time → line', () => {
    const t = parseTable('月份\t體重\n1月\t72\n2月\t70\n3月\t71')
    expect(columnKinds(t)).toEqual(['date', 'number'])
    expect(suggestChart(t).kind).toBe('line')
  })

  it('treats a year column as categories, not a series', () => {
    const d = toSeries(parseTable('年\t人數\n2022\t10\n2023\t12\n2024\t15'))
    expect(d.categories).toEqual(['2022', '2023', '2024'])
    expect(d.series).toHaveLength(1)
    expect(d.timeLike).toBe(true)
  })

  it('suggests donut for shares that sum to 100', () => {
    expect(suggestChart(parseTable('類別\t占比\n門診\t55%\n住院\t30%\n急診\t15%')).kind).toBe('donut')
  })

  it('suggests kpi for a single number and table for text only', () => {
    expect(suggestChart(parseTable('指標\t數值\n滿意度\t92')).kind).toBe('kpi')
    expect(suggestChart(parseTable('項目\t結果\n血紅素\t14.2 g/dL')).kind).toBe('table')
  })

  it('reads a horizontal single row', () => {
    const d = toSeries(parseTable('一月\t二月\t三月\n72\t70\t71'))
    expect(d.categories).toEqual(['一月', '二月', '三月'])
    expect(d.series[0].values).toEqual([72, 70, 71])
  })
})

describe('JSON values', () => {
  it('accepts report_template_3 DataPoint arrays and writes them back', () => {
    const t = tableFromValue([
      { name: '一月', value: 72 },
      { name: '二月', value: 70 },
    ])!
    expect(t.columns).toEqual(['項目', '數值'])
    expect(tableToValue(t)).toEqual([
      { name: '一月', value: 72 },
      { name: '二月', value: 70 },
    ])
  })

  it('accepts arrays of rows and row objects', () => {
    expect(tableFromValue([['a', 'b'], [1, 2]])).toEqual({ columns: ['a', 'b'], rows: [['1', '2']] })
    expect(tableFromValue([{ 月: '1月', A: 1, B: 2 }])?.columns).toEqual(['月', 'A', 'B'])
  })
})

describe('looksLikeTable', () => {
  it('accepts spreadsheet ranges and rejects plain text', () => {
    expect(looksLikeTable('月份\t值\n一月\t3')).toBe(true)
    expect(looksLikeTable('這是一段文字，沒有數字')).toBe(false)
    expect(looksLikeTable('單一值')).toBe(false)
  })
})
