const date = constants.currentMonth
operate('test')

// List of resources to be copied to the test environment. Comment out the ones you don't need.
const resourcesList = [
  { datasetId: 'all', tableId: 'pages', filter: `date = '${date}'` },
  { datasetId: 'all', tableId: 'requests', filter: `date = '${date}'` },
  { datasetId: 'all', tableId: 'parsed_css', filter: `date = '${date}'` },
  { datasetId: 'core_web_vitals', tableId: 'technologies', filter: `date = '${date}'` },
  { datasetId: 'blink_features', tableId: 'usage', filter: `yyyymmdd = '${date}'` },
  { datasetId: 'blink_features', tableId: 'features', filter: `yyyymmdd = '${date}'` }
]

// Copying the resources to the test environment. Using views instead of tables to avoid processing and speed things up.
// Prefixes and suffixes hardcoded in the query for the sake of safety.
resourcesList.forEach(resource => {
  operate(
    `test_table ${resource.datasetId}_dev_dev_${resource.tableId}`
  ).dependencies(['test']).queries(`
CREATE SCHEMA IF NOT EXISTS ${resource.datasetId}_dev;
DROP TABLE IF EXISTS ${resource.datasetId}_dev.dev_${resource.tableId};

CREATE VIEW IF NOT EXISTS ${resource.datasetId}_dev.dev_${resource.tableId} AS
SELECT *
FROM \`${resource.datasetId}.${resource.tableId}\` ${constants.devTABLESAMPLE}
WHERE ${resource.filter}
  `)
})
