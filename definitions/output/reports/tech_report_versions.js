const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_versions', {
  schema: 'reports',
  type: 'table',
  tags: ['tech_report']
}).query(ctx => `
SELECT
  technology,
  version,
  adoption AS origins
FROM ${ctx.ref('reports', 'tech_report_adoption')}
WHERE
  date = '${pastMonth}'
  AND rank = 'ALL'
  AND geo = 'ALL'
  ${constants.devRankFilter}
`).postOps(ctx => `
  SELECT
    reports.run_export_job(
      JSON '''{
        "destination": "firestore",
        "config": {
          "database": "tech-report-api-${constants.environment}",
          "collection": "versions",
          "type": "dict"
        },
        "query": "SELECT * FROM ${ctx.self()}"
      }'''
    );
  `)
