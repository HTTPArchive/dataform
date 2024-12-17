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
/* {"dataform_trigger": "report_cwv_tech_complete", "date": "${pastMonth}", "name": "adoption", "type": "report"} */
SELECT
  date,
  app AS technology,
  rank,
  geo,
  STRUCT(
    COALESCE(MAX(IF(client = 'desktop', origins, NULL))) AS desktop,
    COALESCE(MAX(IF(client = 'mobile', origins, NULL))) AS mobile
  ) AS adoption
FROM ${ctx.ref('core_web_vitals', 'technologies')}
WHERE date = '${pastMonth}'
GROUP BY
  date,
  app,
  rank,
  geo
`)
