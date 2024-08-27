constants.clients.forEach(client => {
    publish(
        constants.current_month_underscored + "_" + client, {
            type: "table",
            schema: "lighthouse",
            tags: ["after_crawl_legacy"],
            disabled: true
        }
    ).query(
        ctx => `
SELECT
  page AS url,
  lighthouse AS report
FROM
  ${ctx.ref("all", "pages")}
WHERE
  date = '${constants.current_month}'
  AND client = '${client}'
  AND is_root_page
  AND lighthouse IS NOT NULL
  AND LENGTH(lighthouse) <= 2 * 1024 * 1024 -- legacy tables have a different limit
`);
})
