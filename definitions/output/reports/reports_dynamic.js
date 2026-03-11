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
  fileFormat: '.json'
}

// Date range for report generation
// Adjust these dates to update reports retrospectively
const DATE_RANGE = {
  startDate: constants.currentMonth,
  endDate: constants.currentMonth
}

/**
 * Generates the Cloud Storage export path for a report
 * @param {Object} reportConfig - Report configuration object
 * @returns {string} - Cloud Storage object path
 */
function buildExportPath(reportConfig) {
  const { sql, date, metric, lens } = reportConfig
  const lensPath = lens && lens.name && lens.name !== 'all' ? `${lens.name}/` : ''
  let objectPath = EXPORT_CONFIG.storagePath

  if (sql.type === 'histogram') {
    // Histogram exports are organized under date and lens folders
    const dateFolder = date.replaceAll('-', '_')
    objectPath += `${dateFolder}/${lensPath}${metric.id}${EXPORT_CONFIG.fileFormat}`
  } else if (sql.type === 'timeseries') {
    // Timeseries exports are organized under lens folders
    objectPath += `${lensPath}${metric.id}${EXPORT_CONFIG.fileFormat}`
  } else {
    throw new Error(`Unknown SQL type: ${sql.type}`)
  }

  return objectPath
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
      ORDER BY client, bin ASC
    `
  } else if (sql.type === 'timeseries') {
    query = `
      SELECT
        UNIX_DATE(date) * 1000 * 60 * 60 * 24 AS timestamp,
        * EXCEPT(date, metric, lens)
      FROM \`${EXPORT_CONFIG.dataset}.${tableName}\`
      WHERE
        metric = '${metric.id}'
        AND lens = '${lens.name}'
      ORDER BY date, client DESC
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
  let tableName
  if (sql.type === 'timeseries' || sql.type === 'histogram') {
    tableName = `${metric.id}_${sql.type}`
  } else {
    throw new Error(`Unknown SQL type: ${sql.type}`)
  }

  return {
    date,
    metric,
    sql,
    lens: { name: lensName, sql: lensSQL },
    devRankFilter: constants.devRankFilter,
    tableName: tableName
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

    const whitelistedMetrics = availableMetrics.filter(metric => metric.enabled) // TODO: reports are whitelisted during migration

    // For each available metric
    whitelistedMetrics.forEach(metric => {
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
  const { sql, date, lens, metric } = reportConfig
  const lensSuffix = lens && lens.name ? `_${lens.name}` : ''

  return `${metric.id}_${sql.type}_${date}${lensSuffix}`
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

-- Run analysis once
CREATE TEMP TABLE ${tableName}_temp AS (
  ${sql.query(ctx, reportConfig)}
);

-- Create table on first run (schema only, no data)
CREATE TABLE IF NOT EXISTS ${EXPORT_CONFIG.dataset}.${tableName}
PARTITION BY date
CLUSTER BY metric, lens, client
AS
SELECT
  client,
  DATE('${date}') AS date,
  '${metric.id}' AS metric,
  '${lens.name}' AS lens,
  * EXCEPT(client)
FROM ${tableName}_temp
WHERE FALSE;

-- Delete existing data for this partition
DELETE FROM ${EXPORT_CONFIG.dataset}.${tableName}
WHERE date = '${date}'
  AND metric = '${metric.id}'
  AND lens = '${lens.name}';

-- Insert fresh data
INSERT INTO ${EXPORT_CONFIG.dataset}.${tableName}
SELECT
  client,
  DATE('${date}') AS date,
  '${metric.id}' AS metric,
  '${lens.name}' AS lens,
  * EXCEPT(client)
FROM ${tableName}_temp;

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

  operate(operationName)
    .tags(['crawl_complete'])
    .queries(ctx => generateOperationSQL(ctx, reportConfig))
})
