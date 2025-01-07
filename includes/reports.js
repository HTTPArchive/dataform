const { DataformTemplateBuilder } = require('./constants')

const config = {
  _metrics: {
    bytesTotal: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
SELECT
  *,
  SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
FROM (
  SELECT
    *,
    volume / SUM(volume) OVER (PARTITION BY client) AS pdf
  FROM (
    SELECT
      date,
      client,
      CAST(FLOOR(INT64(summary.bytesTotal) / 1024 / 100) * 100 AS INT64) AS bin,
      COUNT(0) AS volume
    FROM ${ctx.ref('crawl', 'pages')}
    WHERE
      date = '${params.date}' ${params.devRankFilter} ${params.lense.sql} AND
      is_root_page AND
      INT64(summary.bytesTotal) > 0
    GROUP BY
      date,
      client,
      bin
    HAVING bin IS NOT NULL
  )
)
ORDER BY
  date,
  bin,
  client
`)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
WITH pages AS (
  SELECT
    date,
    client,
    INT64(summary.bytesTotal) AS bytesTotal
  FROM ${ctx.ref('crawl', 'pages')}
  WHERE
    date = '${params.date}' ${params.devRankFilter} ${params.lense.sql} AND
    is_root_page AND
    INT64(summary.bytesTotal) > 0
)

SELECT
  date,
  client,
  UNIX_SECONDS(TIMESTAMP(date)) AS timestamp,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(101)] / 1024, 2) AS p10,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(251)] / 1024, 2) AS p25,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(501)] / 1024, 2) AS p50,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(751)] / 1024, 2) AS p75,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(901)] / 1024, 2) AS p90
FROM pages
GROUP BY
  date,
  client,
  timestamp
`)
        }
      ]
    }
  }
}

class HTTPArchiveReports {
  constructor () {
    this.config = config
  }

  listReports () {
    const reportIds = this.config._reports

    const reports = reportIds.map(reportId => {
      const report = this.getReport(reportId)
      return report
    })

    return reports
  }

  getReport (reportId) {
    const report = this.config[reportId]
    return {
      id: reportId,
      ...report
    }
  }

  listMetrics (reportId) {
    if (reportId === undefined) {
      const metrics = Object.keys(this.config._metrics).map(metricId => {
        const metric = this.getMetric(metricId)
        return metric
      }).filter(metric => metric.SQL)

      return metrics
    } else {
      const report = this.getReport(reportId)
      const metricIds = report.metrics

      const metrics = metricIds.map(metricId => {
        const metric = this.getMetric(metricId)
        return metric
      }).filter(metric => metric.SQL)

      return metrics
    }
  }

  getMetric (metricId) {
    const metric = this.config._metrics[metricId]

    return {
      id: metricId,
      ...metric
    }
  }
}

module.exports = {
  HTTPArchiveReports
}
