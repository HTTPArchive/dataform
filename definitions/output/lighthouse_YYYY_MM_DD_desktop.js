constants.clients.forEach(client => {
    publish(constants.date_underscored + "_" + client, {
        type: "table",
        schema: "lighthouse",
        tags: ["after_crawl"],
    }).query(
        ctx => `
          SELECT
            page AS url,
            lighthouse AS report
          FROM
            ${ctx.ref("all", "pages")}
          WHERE
            date = '${constants.date}'
            AND client = '${client}'
            AND is_root_page
            AND lighthouse IS NOT NULL
            AND LENGTH(lighthouse) <= 2 * 1024 * 1024 -- legacy tables have a different limit
        `
    );
})
