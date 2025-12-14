/**
 * Dynamic Reports Generator
 *
 * This file automatically generates Dataform operations for HTTP Archive reports.
 * It creates operations for each combination of:
 * - Date range (from startDate to endDate)
 * - Metrics (defined in includes/reports.js)
 * - SQL types (histogram, timeseries)
 * - Lenses (data filters like all, top1k, wordpress, etc.)
 *
 * Each operation:
 * 1. Calculates metrics from crawl data
 * 2. Stores results in BigQuery tables
 * 3. Exports data to Cloud Storage as JSON
 */

// Initialize configurations
const httpArchiveReports = new reports.HTTPArchiveReports()
const availableMetrics = httpArchiveReports.listMetrics()
const availableLenses = httpArchiveReports.lenses

// Configuration constants
const EXPORT_CONFIG = {
  bucket: constants.bucket,
  storagePath: constants.storagePath,
  dataset: 'reports',
  testSuffix: '.json'
}

// Date range for report generation
// Adjust these dates to update reports retrospectively
const DATE_RANGE = {
  startDate: constants.currentMonth, // '2025-07-01'
  endDate: constants.currentMonth    // '2025-07-01'
}

/**
 * Generates the Cloud Storage export path for a report
 * @param {Object} reportConfig - Report configuration object
 * @returns {string} - Cloud Storage object path
 */
function buildExportPath(reportConfig) {
  const { sql, date, metric } = reportConfig
  let objectPath = EXPORT_CONFIG.storagePath

  if (sql.type === 'histogram') {
    // Histogram exports are organized by date folders
    const dateFolder = date.replaceAll('-', '_')
    objectPath += `${dateFolder}/${metric.id}`
  } else if (sql.type === 'timeseries') {
    // Timeseries exports are organized by metric
    objectPath += metric.id
  } else {
    throw new Error(`Unknown SQL type: ${sql.type}`)
  }

  return objectPath + EXPORT_CONFIG.testSuffix
}

/**
 * Generates the BigQuery export query for a report
 * @param {Object} reportConfig - Report configuration object
 * @returns {string} - SQL query for exporting data
 */
function buildExportQuery(reportConfig) {
  const { sql, date, metric, lens, tableName } = reportConfig

  let query
  if (sql.type === 'histogram') {
    query = `
      SELECT
        * EXCEPT(date, metric, lens)
      FROM \`${EXPORT_CONFIG.dataset}.${tableName}\`
      WHERE date = '${date}'
        AND metric = '${metric.id}'
        AND lens = '${lens.name}'
      ORDER BY bin ASC
    `
  } else if (sql.type === 'timeseries') {
    query = `
      SELECT
        FORMAT_DATE('%Y_%m_%d', date) AS date,
        * EXCEPT(date, metric, lens)
      FROM \`${EXPORT_CONFIG.dataset}.${tableName}\`
      WHERE metric = '${metric.id}'
        AND lens = '${lens.name}'
      ORDER BY date DESC
    `
  } else {
    throw new Error(`Unknown SQL type: ${sql.type}`)
  }

  // Convert to single line for JSON embedding
  return query.replace(/[\r\n]+/g, ' ').trim()
}

/**
 * Creates a report configuration object
 * @param {string} date - Report date (YYYY-MM-DD)
 * @param {Object} metric - Metric configuration
 * @param {Object} sql - SQL configuration (type and query)
 * @param {string} lensName - Lens name
 * @param {string} lensSQL - Lens SQL filter
 * @returns {Object} - Complete report configuration
 */
function createReportConfig(date, metric, sql, lensName, lensSQL) {
  return {
    date,
    metric,
    sql,
    lens: { name: lensName, sql: lensSQL },
    devRankFilter: constants.devRankFilter,
    tableName: `${metric.id}_${sql.type}`
  }
}

/**
 * Generates all report configurations for the specified date range
 * @returns {Array} - Array of report configuration objects
 */
function generateReportConfigurations() {
  const reportConfigs = []

  // Generate configurations for each date in range
  for (let date = DATE_RANGE.endDate;
    date >= DATE_RANGE.startDate;
    date = constants.fnPastMonth(date)) {

    // For each available metric
    availableMetrics.forEach(metric => {
      // For each SQL type (histogram, timeseries)
      metric.SQL.forEach(sql => {
        // For each available lens (all, top1k, wordpress, etc.)
        Object.entries(availableLenses).forEach(([lensName, lensSQL]) => {
          const config = createReportConfig(date, metric, sql, lensName, lensSQL)
          reportConfigs.push(config)
        })
      })
    })
  }

  return reportConfigs
}

/**
 * Creates a Dataform operation name for a report configuration
 * @param {Object} reportConfig - Report configuration object
 * @returns {string} - Operation name
 */
function createOperationName(reportConfig) {
  const { tableName, date, lens } = reportConfig
  return `${tableName}_${date}_${lens.name}`
}

/**
 * Generates the SQL for a Dataform operation
 * @param {Object} ctx - Dataform context
 * @param {Object} reportConfig - Report configuration object
 * @returns {string} - Complete SQL for the operation
 */
function generateOperationSQL(ctx, reportConfig) {
  const { date, metric, lens, sql, tableName } = reportConfig

  return `
DECLARE job_config JSON;

/* First report run - uncomment to create table
CREATE TABLE IF NOT EXISTS ${EXPORT_CONFIG.dataset}.${tableName}
PARTITION BY date
CLUSTER BY metric, lens, client
AS
*/

--/* Subsequent report run
DELETE FROM ${EXPORT_CONFIG.dataset}.${tableName}
WHERE date = '${date}'
  AND metric = '${metric.id}'
  AND lens = '${lens.name}';
INSERT INTO ${EXPORT_CONFIG.dataset}.${tableName}
--*/

SELECT
  '${metric.id}' AS metric,
  '${lens.name}' AS lens,
  *
FROM (
  ${sql.query(ctx, reportConfig)}
);

SET job_config = TO_JSON(
  STRUCT(
    "cloud_storage" AS destination,
    STRUCT(
      "httparchive" AS bucket,
      "${buildExportPath(reportConfig)}" AS name
    ) AS config,
    r"${buildExportQuery(reportConfig)}" AS query
  )
);

SELECT reports.run_export_job(job_config);
`
}

// Generate all report configurations
const reportConfigurations = generateReportConfigurations()

// Create Dataform operations for each report configuration
reportConfigurations.forEach(reportConfig => {
  const operationName = createOperationName(reportConfig)

  operate(operationName, {
    disabled: true,
  })
    .tags(['crawl_complete', 'crawl_reports'])
    .queries(ctx => generateOperationSQL(ctx, reportConfig))
})
