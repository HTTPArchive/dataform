const pastMonth = constants.fnPastMonth(constants.currentMonth)

publish('cwv_tech_technologies', {
  schema: 'reports',
  type: 'table',
  tags: ['cwv_tech_report']
}).query(ctx => `
/* {"dataform_trigger": "report_cwv_tech_complete", "name": "technologies", "type": "dict"} */
SELECT
  client,
  app AS technology,
  description,
  category,
  SPLIT(category, ",") AS category_obj,
  NULL AS similar_technologies,
  origins
FROM ${ctx.ref('core_web_vitals', 'technologies')}
LEFT JOIN ${ctx.ref('wappalyzer', 'apps')}
ON app = name
WHERE date = '${pastMonth}' AND
  geo = 'ALL' AND
  rank = 'ALL'
ORDER BY origins DESC
`)
