const date = constants.currentMonth

var resources_list = [{
    datasetId: 'all',
    tableId: 'pages'
  },
  {
    datasetId: 'all',
    tableId: 'requests'
  },
  // {datasetId: 'all', tableId: 'parsed_css'},
  // {datasetId: 'core_web_vitals', tableId: 'technologies'},
]

resources_list.forEach(resource => {
  operate(
    `test_table ${resource.datasetId}_${resource.tableId}`, {
      hasOutput: true
    }
  ).queries(`
CREATE SCHEMA IF NOT EXISTS ${resource.datasetId}_dev;

DROP TABLE IF EXISTS ${resource.datasetId}_dev.dev_${resource.tableId};

CREATE TABLE IF NOT EXISTS ${resource.datasetId}_dev.dev_${resource.tableId} AS
SELECT *
FROM \`${resource.datasetId}.${resource.tableId}\` ${constants.devTABLESAMPLE}
WHERE date = '${date}'
  `)
})

operate('test_table blink_features_dev_dev_usage', {
  hasOutput: true,
}).queries(`
CREATE SCHEMA IF NOT EXISTS blink_features_dev;

CREATE TABLE IF NOT EXISTS blink_features_dev.dev_usage AS
SELECT *
FROM blink_features.usage ${constants.devTABLESAMPLE}
WHERE yyyymmdd = '${date}';
`)

operate('test_table blink_features_dev_dev_features', {
  hasOutput: true,
}).queries(`
CREATE SCHEMA IF NOT EXISTS blink_features_dev;

DROP TABLE IF EXISTS blink_features_dev.dev_features;

CREATE TABLE IF NOT EXISTS blink_features_dev.dev_features AS
SELECT *
FROM blink_features.features ${constants.devTABLESAMPLE}
WHERE yyyymmdd = DATE '${date}';
`)
