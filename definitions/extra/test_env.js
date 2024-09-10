const date = constants.fn_past_month(constants.current_month);

var resources_list = [
  {datasetId: "all",              tableId: "pages"},
  {datasetId: "all",              tableId: "requests"},
  //{datasetId: "all",              tableId: "parsed_css"},
  //{datasetId: "core_web_vitals",  tableId: "technologies"},
];

resources_list.forEach(resource => {
  operate(`test_table ${resource.datasetId}_${resource.tableId}`, {
    disabled: !constants.is_dev_env // enabled when workflow variable env_name = "dev"
  }).tags([
    "test_tables"
  ]).queries(ctx => `
CREATE SCHEMA IF NOT EXISTS ${resource.datasetId}_dev;

CREATE TABLE ${resource.datasetId}_dev.dev_${resource.tableId}
LIKE httparchive.${resource.datasetId}.${resource.tableId};

INSERT INTO ${resource.datasetId}_dev.dev_${resource.tableId}
SELECT *
FROM httparchive.${resource.datasetId}.${resource.tableId} ${constants.dev_TABLESAMPLE}
WHERE date = '${date}'
  `);
})
