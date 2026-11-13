const { describe, it } = require('node:test')
const nodeAssert = require('node:assert/strict')

const {
  DataformTemplateBuilder,
  HTTPArchiveReports,
  lenses,
  lensArrayExpression
} = require('../includes/reports.js')

const createMockCtx = () => ({
  ref: (...parts) => `\`httparchive.${parts.join('.')}\``,
  constants: {
    devRankFilter: 'AND rank <= 10000'
  }
})

describe('DataformTemplateBuilder', () => {
  it('throws TypeError when templateFn is not a function', () => {
    for (const invalidInput of [null, undefined, 'SELECT 1', 123, {}]) {
      nodeAssert.throws(
        () => DataformTemplateBuilder.create(invalidInput),
        TypeError
      )
    }
  })

  it('interpolates template literals with ctx and params', () => {
    const query = DataformTemplateBuilder.create(
      (mockCtx, params) =>
        `SELECT * FROM ${mockCtx.ref('crawl', 'pages')} WHERE date = '${params.date}'`
    )

    const sql = query(createMockCtx(), { date: '2026-10-01' })
    nodeAssert.equal(
      sql,
      "SELECT * FROM `httparchive.crawl.pages` WHERE date = '2026-10-01'"
    )
  })

  it('resolves deferred string placeholders without wrapping identifiers in single quotes', () => {
    const query = DataformTemplateBuilder.create(
      () =>
        "SELECT * FROM ${params:table} WHERE date = '${params:date}' ${ctx:constants.devRankFilter}"
    )

    const sql = query(createMockCtx(), {
      table: '`httparchive.crawl.pages`',
      date: '2026-10-01'
    })

    nodeAssert.equal(
      sql,
      "SELECT * FROM `httparchive.crawl.pages` WHERE date = '2026-10-01' AND rank <= 10000"
    )
  })

  it('handles nested paths, numbers, booleans, objects, and missing values', () => {
    const query = DataformTemplateBuilder.create(
      () =>
        'LIMIT ${nested.limit} FLAG=${flag} TAGS=${tags} MISSING=${missing.key}'
    )

    const sql = query(createMockCtx(), {
      nested: { limit: 100 },
      flag: true,
      tags: ['a', 'b']
    })

    nodeAssert.equal(sql, 'LIMIT 100 FLAG=true TAGS=["a","b"] MISSING=')
  })
})

describe('HTTPArchiveReports', () => {
  const reportsInstance = new HTTPArchiveReports()

  it('exports expected lenses and lensArrayExpression', () => {
    nodeAssert.equal(typeof lenses, 'object')
    nodeAssert.ok(lenses !== null && !Array.isArray(lenses))
    for (const expectedLens of [
      'all',
      'drupal',
      'magento',
      'top1k',
      'top10k',
      'top100k',
      'top1m',
      'wordpress'
    ]) {
      nodeAssert.ok(
        Object.prototype.hasOwnProperty.call(lenses, expectedLens),
        `Expected lens "${expectedLens}" to be present`
      )
      nodeAssert.equal(typeof lenses[expectedLens], 'string')
    }
    nodeAssert.equal(typeof lensArrayExpression, 'string')
    nodeAssert.ok(lensArrayExpression.startsWith('ARRAY['))
  })

  it('lists configured reports with valid metadata', () => {
    nodeAssert.deepEqual(reportsInstance.listReports(), [])

    const customReports = new HTTPArchiveReports({
      _reports: ['page-weight'],
      'page-weight': {
        name: 'Page Weight',
        metrics: ['bytesTotal', 'bytesJs']
      },
      _metrics: reportsInstance.config._metrics
    })

    const reportList = customReports.listReports()
    nodeAssert.equal(reportList.length, 1)
    nodeAssert.equal(reportList[0].id, 'page-weight')
    nodeAssert.equal(reportList[0].name, 'Page Weight')
    nodeAssert.deepEqual(reportList[0].metrics, ['bytesTotal', 'bytesJs'])
  })

  it('validates reportId in getReport and listMetrics', () => {
    for (const invalidId of [
      'non-existent-report',
      '_metrics',
      '_reports',
      '',
      null,
      undefined,
      123
    ]) {
      nodeAssert.throws(
        () => reportsInstance.getReport(invalidId),
        /Unknown report ID/
      )
    }

    nodeAssert.throws(
      () => reportsInstance.listMetrics('non-existent-report'),
      /Unknown report ID/
    )

    const customReports = new HTTPArchiveReports({
      _reports: ['page-weight'],
      'page-weight': {
        name: 'Page Weight',
        metrics: ['bytesTotal', 'bytesJs']
      },
      _metrics: reportsInstance.config._metrics
    })

    const validReport = customReports.getReport('page-weight')
    nodeAssert.equal(validReport.id, 'page-weight')
    nodeAssert.equal(validReport.name, 'Page Weight')

    const reportMetrics = customReports.listMetrics('page-weight')
    nodeAssert.equal(reportMetrics.length, 2)
    nodeAssert.deepEqual(
      reportMetrics.map((m) => m.id),
      ['bytesTotal', 'bytesJs']
    )
  })

  it('validates metricId in getMetric', () => {
    const metric = reportsInstance.getMetric('bytesTotal')
    nodeAssert.equal(metric.id, 'bytesTotal')
    nodeAssert.ok(Array.isArray(metric.SQL))

    for (const invalidId of [
      'nonExistentMetric',
      '',
      null,
      undefined,
      '__proto__'
    ]) {
      nodeAssert.throws(
        () => reportsInstance.getMetric(invalidId),
        /Unknown metric ID/
      )
    }
  })

  it('compiles SQL queries cleanly for every configured metric', () => {
    const allMetrics = reportsInstance.listMetrics()
    nodeAssert.ok(allMetrics.length > 0)

    const mockCtx = createMockCtx()
    const params = { date: '2026-10-01' }

    for (const metric of allMetrics) {
      nodeAssert.ok(
        Array.isArray(metric.SQL) && metric.SQL.length > 0,
        `Metric "${metric.id}" must define non-empty SQL array`
      )

      for (const entry of metric.SQL) {
        nodeAssert.ok(
          ['histogram', 'timeseries'].includes(entry.type),
          `Metric "${metric.id}" has unexpected query type "${entry.type}"`
        )
        nodeAssert.equal(
          typeof entry.query,
          'function',
          `Metric "${metric.id}" (${entry.type}) query must be a function`
        )

        const sql = entry.query(mockCtx, params)
        nodeAssert.equal(typeof sql, 'string')
        nodeAssert.ok(sql.includes('SELECT'), `${metric.id} missing SELECT`)
        nodeAssert.ok(
          sql.includes("'2026-10-01'"),
          `${metric.id} (${entry.type}) missing rendered date literal`
        )
        nodeAssert.ok(
          sql.includes('`httparchive.crawl.'),
          `${metric.id} (${entry.type}) missing resolved table reference`
        )
        nodeAssert.ok(
          !sql.includes("'undefined'"),
          `${metric.id} (${entry.type}) contains literal 'undefined'`
        )
        nodeAssert.ok(
          !sql.includes("'null'"),
          `${metric.id} (${entry.type}) contains literal 'null'`
        )
        nodeAssert.ok(
          !sql.includes("''2026-10-01''"),
          `${metric.id} (${entry.type}) contains double-quoted date literal`
        )
      }
    }
  })
})
