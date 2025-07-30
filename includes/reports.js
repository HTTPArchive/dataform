const { DataformTemplateBuilder } = require('./constants')

const config = {
  _metrics: {
    bytesTotal: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
WITH pages AS (
  SELECT
    date,
    client,
    CAST(FLOOR(FLOAT64(summary.bytesTotal) / 1024 / 100) * 100 AS INT64) AS bin
  FROM crawl.pages
  WHERE
    date = '${params.date}'
    ${params.lens.sql}
    AND is_root_page
    AND FLOAT64(summary.bytesTotal) > 0
)

SELECT
  *,
  SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
FROM (
  SELECT
    *,
    volume / SUM(volume) OVER (PARTITION BY client) AS pdf
  FROM (
    SELECT
      *,
      COUNT(0) AS volume
    FROM pages
    WHERE bin IS NOT NULL
    GROUP BY
      date,
      client,
      bin
  )
)
ORDER BY
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
    FLOAT64(summary.bytesTotal) AS bytesTotal
  FROM crawl.pages
  WHERE
    date = '${params.date}'
    ${params.lens.sql}
    AND is_root_page
    AND INT64(summary.bytesTotal) > 0
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
ORDER BY
  date,
  client
`)
        }
      ]
    }
  }
}

const lenses = {
  all: '',
  top1k: 'AND rank <= 1000',
  top10k: 'AND rank <= 10000',
  top100k: 'AND rank <= 100000',
  top1m: 'AND rank <= 1000000',
  drupal: 'AND \'Drupal\' IN UNNEST(technologies.technology)',
  magento: 'AND \'Magento\' IN UNNEST(technologies.technology)',
  wordpress: 'AND \'WordPress\' IN UNNEST(technologies.technology)'
}

class HTTPArchiveReports {
  constructor() {
    this.config = config
    this.lenses = lenses
  }

  listReports() {
    const reportIds = this.config._reports

    const reports = reportIds.map(reportId => {
      const report = this.getReport(reportId)
      return report
    })

    return reports
  }

  getReport(reportId) {
    const report = this.config[reportId]
    return {
      id: reportId,
      ...report
    }
  }

  listMetrics(reportId) {
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

  getMetric(metricId) {
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
