const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_adoption', {
  schema: 'reports',
  type: 'incremental',
  protected: true,
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['rank', 'geo']
  },
  tags: ['tech_report']
}).preOps(ctx => `
DELETE FROM ${ctx.self()}
WHERE date = '${pastMonth}';
`).query(ctx => `
SELECT
  date,
  geo,
  rank,
  technology,
  version,
  STRUCT(
    MAX(IF(client = 'desktop', origins, 0)) AS desktop,
    MAX(IF(client = 'mobile', origins, 0)) AS mobile
  ) AS adoption
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
        "database": "tech-report-api-${constants.environment}",
        "collection": "adoption",
        "type": "report",
        "date": "${pastMonth}"
      },
      "query": "SELECT STRING(date) AS date, * EXCEPT(date) FROM ${ctx.self()} WHERE date = '${pastMonth}'"
    }'''
  );
`)
