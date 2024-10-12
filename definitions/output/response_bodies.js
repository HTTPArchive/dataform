const current_month_underscored = constants.fnDateUnderscored(constants.currentMonth)

constants.clients.forEach(client => {
  publish(`${current_month_underscored}_${client}`, {
    type: 'table',
    schema: 'response_bodies',
    tags: ['crawl_results_legacy']
  }).query(ctx => `
SELECT
  page,
  url,
  SUBSTRING(response_body, 0, 2 * 1024 * 1024) AS response_body,
  LENGTH(response_body) >= 2 * 1024 * 1024 AS truncated
FROM ${ctx.ref('all', 'requests')}
WHERE date = '${constants.currentMonth}' AND
  client = '${client}' AND
  is_root_page AND
  response_body IS NOT NULL
  `)
})
