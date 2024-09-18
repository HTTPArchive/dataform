const current_month_underscored = constants.fn_date_underscored(constants.current_month);

constants.clients.forEach(client => {
    publish(
        current_month_underscored + "_" + client, {
        type: "table",
        schema: "technologies",
        tags: ["crawl_results_legacy"]
    }).query(ctx => `
SELECT DISTINCT
  page as url,
  category,
  tech.technology AS app,
  info
FROM ${ctx.ref("all", "pages")},
UNNEST (technologies) AS tech,
UNNEST (tech.categories) AS category,
UNNEST (tech.info) AS info
WHERE date = '${constants.current_month}' AND
  client = '${client}' AND
  is_root_page AND
  tech.technology IS NOT NULL
    `);
})
