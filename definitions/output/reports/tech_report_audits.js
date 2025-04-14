const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_audits', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['tech_report']
}).preOps(ctx => `
CREATE TEMP FUNCTION GET_AUDITS(
  records ARRAY<STRUCT<
    client STRING,
    audits ARRAY<STRUCT<
      category STRING,
      id STRING,
      pass_rate FLOAT64
    >>
  >>
)
RETURNS ARRAY<STRUCT<
  category STRING,
  id STRING,
  mobile STRUCT<
    pass_rate FLOAT64
  >,
  desktop STRUCT<
    pass_rate FLOAT64
  >
>>
LANGUAGE js AS '''
// Create a map to accumulate audits based on a unique key (category + id).
var auditMap = {};

// Loop over each record.
records.forEach(function(record) {
  // Loop over each audit in the record.
  record.audits.forEach(function(audit) {
    // Create a unique key for combining audits.
    var key = audit.category + '|' + audit.id;
    // Initialize the audit in the map if not present.
    if (!auditMap[key]) {
      auditMap[key] = {
        category: audit.category,
        id: audit.id,
        mobile: { pass_rate: 0 },
        desktop: { pass_rate: 0 }
      };
    }
    // Add the pass_rate to the proper client type.
    if (record.client === 'mobile') {
      auditMap[key].mobile.pass_rate += audit.pass_rate;
    } else if (record.client === 'desktop') {
      auditMap[key].desktop.pass_rate += audit.pass_rate;
    }
  });
});

// Convert the map into an array of audits.
return Object.keys(auditMap).map(function(key) {
  return auditMap[key];
});
''';

DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
SELECT
  date,
  geo,
  rank,
  technology,
  version,
  GET_AUDITS(ARRAY_AGG(STRUCT(
    client,
    audits
  ))) AS audits
FROM ${ctx.ref('reports', 'tech_crux')}
WHERE date = '${pastMonth}'
GROUP BY
  date,
  geo,
  rank,
  technology,
  version
`).postOps(ctx => `
  SELECT
    reports.run_export_job(
      JSON '''{
        "destination": "firestore",
        "config": {
          "databaseId": "tech-report-api-{constants.environment}",
          "collectionName": "audits",
          "collectionType": "report",
          "date": "${pastMonth}"
        },
        "query": "SELECT STRING(date) AS date, * EXCEPT(date) FROM ${ctx.self()} WHERE date = '${pastMonth}'"
      }'''
    );
  `)
