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
      origins INT64
    >>
  >>
)
RETURNS ARRAY<STRUCT<
  category STRING,
  id STRING,
  mobile STRUCT<
    origins INT64
  >,
  desktop STRUCT<
    origins INT64
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
        mobile: { origins: 0 },
        desktop: { origins: 0 }
      };
    }
    // Add the origins to the proper client type.
    if (record.client === 'mobile') {
      auditMap[key].mobile.origins += audit.origins;
    } else if (record.client === 'desktop') {
      auditMap[key].desktop.origins += audit.origins;
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
/* {"dataform_trigger": "tech_report_complete", "date": "${pastMonth}", "name": "audits", "type": "report"} */
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
`)
