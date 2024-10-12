const currentMonthUnderscored = constants.fnDateUnderscored(constants.currentMonth)

constants.clients.forEach(client => {
  publish(`${currentMonthUnderscored}_${client}`, {
    type: 'table',
    schema: 'lighthouse',
    tags: ['crawl_results_legacy']
  }).query(ctx => `
SELECT
  page AS url,
  lighthouse AS report
FROM ${ctx.ref('all', 'pages')}
WHERE
  date = '${constants.currentMonth}'
  AND client = '${client}'
  AND is_root_page
  AND lighthouse IS NOT NULL
  AND LENGTH(lighthouse) <= 2 * 1024 * 1024 -- legacy tables have a different limit
  `)
})
