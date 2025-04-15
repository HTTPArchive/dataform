const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('cwv_tech_adoption', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['crux_ready']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
SELECT
  date,
  app AS technology,
  rank,
  geo,
  STRUCT(
    COALESCE(MAX(IF(client = 'desktop', origins, 0))) AS desktop,
    COALESCE(MAX(IF(client = 'mobile', origins, 0))) AS mobile
  ) AS adoption
FROM ${ctx.ref('core_web_vitals', 'technologies')}
WHERE date = '${pastMonth}'
GROUP BY
  date,
  app,
  rank,
  geo
`).postOps(ctx => `
  SELECT
    reports.run_export_job(
      JSON '''{
        "destination": "firestore",
        "config": {
          "databaseId": "tech-report-apis-${constants.environment}",
          "collectionName": "adoption",
          "collectionType": "report",
          "date": "${pastMonth}"
        },
        "query": "SELECT STRING(date) AS date, * EXCEPT(date) FROM ${ctx.self()} WHERE date = '${pastMonth}'"
      }'''
    );
  `)
