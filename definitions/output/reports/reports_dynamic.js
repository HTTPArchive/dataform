/**
 * Dynamic Reports Generator
 *
 * This file automatically generates Dataform operations for HTTP Archive reports.
 * It creates operations for each combination of:
 * - Date range (from startDate to endDate)
 * - Metrics (defined in includes/reports.js)
 * - SQL types (histogram, timeseries)
 *
 * Each operation:
 * 1. Calculates metrics for ALL lenses in a single pass
 * 2. Stores results in BigQuery tables partitioned by date and clustered by metric, lens, client
 * 3. Exports data to Cloud Storage as JSON files for each lens
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
 * @param {string} lensName - Target lens name
 * @returns {string} - Cloud Storage object path
 */
function buildExportPath(reportConfig, lensName) {
  const { sql, date, metric } = reportConfig
  const lensPath = lensName && lensName !== 'all' ? `${lensName}/` : ''
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
 * @param {string} lensName - Target lens name
 * @returns {string} - SQL query for exporting data
 */
function buildExportQuery(reportConfig, lensName) {
  const { sql, date, metric, tableName } = reportConfig
  let query

  if (sql.type === 'histogram') {
    query = `
      SELECT
        * EXCEPT(date, metric, lens)
      FROM \`${EXPORT_CONFIG.dataset}.${tableName}\`
      WHERE date = '${date}'
        AND metric = '${metric.id}'
        AND lens = '${lensName}'
      ORDER BY client, bin ASC
    `
  } else if (sql.type === 'timeseries') {
    query = `
      SELECT
        CAST(UNIX_DATE(date) * 1000 * 60 * 60 * 24 AS STRING) AS timestamp,
        FORMAT_DATE('%Y_%m_%d', date) AS date,
        * EXCEPT(date, metric, lens)
      FROM \`${EXPORT_CONFIG.dataset}.${tableName}\`
      WHERE
        metric = '${metric.id}'
        AND lens = '${lensName}'
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
 * @returns {Object} - Complete report configuration
 */
function createReportConfig(date, metric, sql) {
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

    // For each available metric
    availableMetrics.forEach(metric => {
      // For each SQL type (histogram, timeseries)
      metric.SQL.forEach(sql => {
        const config = createReportConfig(date, metric, sql)
        reportConfigs.push(config)
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
  const { sql, date, metric } = reportConfig
  return `${metric.id}_${sql.type}_${date}`
}

/**
 * Generates the SQL for a Dataform operation
 * @param {Object} ctx - Dataform context
 * @param {Object} reportConfig - Report configuration object
 * @returns {string} - Complete SQL for the operation
 */
function generateOperationSQL(ctx, reportConfig) {
  const { date, metric, sql, tableName } = reportConfig

  const exportStatements = Object.keys(availableLenses).map(lensName => {
    return `
SET job_config = TO_JSON(
  STRUCT(
    "cloud_storage" AS destination,
    STRUCT(
      "httparchive" AS bucket,
      "${buildExportPath(reportConfig, lensName)}" AS name
    ) AS config,
    r"${buildExportQuery(reportConfig, lensName)}" AS query
  )
);

SELECT reports.run_export_job(job_config);
`
  }).join('\n')

  return `
DECLARE job_config JSON;

-- Run analysis once for all lenses
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
  lens,
  * EXCEPT(client, lens)
FROM ${tableName}_temp
WHERE FALSE;

-- Delete existing data for this partition across all lenses
DELETE FROM ${EXPORT_CONFIG.dataset}.${tableName}
WHERE date = '${date}'
  AND metric = '${metric.id}';

-- Insert fresh multi-lens data
INSERT INTO ${EXPORT_CONFIG.dataset}.${tableName}
SELECT
  client,
  DATE('${date}') AS date,
  '${metric.id}' AS metric,
  lens,
  * EXCEPT(client, lens)
FROM ${tableName}_temp;

-- Export data for each lens to Cloud Storage
${exportStatements}
`
}

// Generate all report configurations
const reportConfigurations = generateReportConfigurations()

// Concurrency limits configuration
const MAX_GLOBAL_CONCURRENCY = 10     // Max active operations globally across all reports
const MAX_PER_REPORT_CONCURRENCY = 1 // Max active operations per report destination table

// Map to track operations created per report table
const opsByTable = {}

reportConfigurations.forEach((reportConfig, index) => {
  const operationName = createOperationName(reportConfig)
  const table = reportConfig.tableName

  if (!opsByTable[table]) {
    opsByTable[table] = []
  }
  const tableHistory = opsByTable[table]
  const dependencies = []

  // 1. Global sliding stream constraint (max global concurrency)
  if (index >= MAX_GLOBAL_CONCURRENCY) {
    const globalPredecessor = createOperationName(reportConfigurations[index - MAX_GLOBAL_CONCURRENCY])
    dependencies.push(globalPredecessor)
  }

  // 2. Per-report sliding stream constraint (max per-table concurrency)
  if (tableHistory.length >= MAX_PER_REPORT_CONCURRENCY) {
    const tablePredecessor = tableHistory[tableHistory.length - MAX_PER_REPORT_CONCURRENCY]
    dependencies.push(tablePredecessor)
  }

  // Create Dataform operation
  const op = operate(operationName)
    .tags(['crawl_complete'])
    .queries(ctx => generateOperationSQL(ctx, reportConfig))

  // Apply deduplicated dependencies
  const uniqueDeps = [...new Set(dependencies)]
  if (uniqueDeps.length > 0) {
    op.dependencies(uniqueDeps)
  }

  // Record operation in table history
  tableHistory.push(operationName)
})

