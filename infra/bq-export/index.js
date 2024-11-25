const { BigQueryExport } = require('./bigquery')

class BigQueryReports {
  constructor () {
    this.bigquery = new BigQueryExport('httparchive')
  }

  async getReport (reportId) {
    const query = `SELECT * FROM ${reportId}`
    const rows = await this.bigquery.query(query)
    return rows
  }
}

module.exports = {
  BigQueryReports
}
