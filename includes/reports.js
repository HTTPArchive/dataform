const { config } = require('./reports_config')

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

    console.log('reports', reports)

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
