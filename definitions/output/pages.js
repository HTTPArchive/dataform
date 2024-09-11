const current_month_underscored = constants.fn_date_underscored(constants.current_month);

constants.clients.forEach(client => {
    publish(
        current_month_underscored + "_" + client, {
        type: "table",
        schema: "pages",
        tags: ["crawl_results_legacy"]
    }).query(ctx => `
SELECT
  page AS url,
  payload
FROM ${ctx.ref("all", "pages")}
WHERE date = '${constants.current_month}' AND
  client = '${client}' AND
  is_root_page AND
  payload IS NOT NULL AND
  LENGTH(payload) <= 2 * 1024 * 1024 AND -- legacy tables have a different limit
    `);
})
