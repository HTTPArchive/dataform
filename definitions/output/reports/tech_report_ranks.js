const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('tech_report_ranks', {
  schema: 'reports',
  type: 'table',
  tags: ['tech_report']
}).query(ctx => `
SELECT
  rank,
  adoption.mobile AS mobile_origins
FROM ${ctx.ref('reports', 'tech_report_adoption')}
WHERE
  date = '${pastMonth}'
  AND geo = 'ALL'
  AND technology = 'ALL'
  AND version = 'ALL'
  ${constants.devRankFilter}
`).postOps(ctx => `
  SELECT
    reports.run_export_job(
      JSON '''{
        "destination": "firestore",
        "config": {
          "database": "tech-report-api-${constants.environment}",
          "collection": "ranks",
          "type": "dict"
        },
        "query": "SELECT * FROM ${ctx.self()}"
      }'''
    );
  `)
