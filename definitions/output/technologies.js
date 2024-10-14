const currentMonthUnderscored = constants.fnDateUnderscored(constants.currentMonth)

constants.clients.forEach(client => {
  publish(`${currentMonthUnderscored}_${client}`, {
    type: 'table',
    schema: 'technologies',
    tags: ['crawl_results_legacy']
  }).query(ctx => `
SELECT DISTINCT
  page as url,
  category,
  tech.technology AS app,
  info
FROM ${ctx.ref('all', 'pages')},
UNNEST (technologies) AS tech,
UNNEST (tech.categories) AS category,
UNNEST (tech.info) AS info
WHERE date = '${constants.currentMonth}' AND
  client = '${client}' AND
  is_root_page
  ${constants.devRankFilter} AND
  tech.technology IS NOT NULL
  `)
})
