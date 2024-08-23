constants.clients.forEach(client => {
    publish("lighthouse_" + constants.date_underscored + "_" + client)
        .type("table")
        .query(
            ctx => `
          SELECT
            page AS url,
            lighthouse AS report
          FROM
            ${ctx.ref("pages")}
          WHERE
            date = '${constants.date}'
            AND client = '${client}'
            AND is_root_page
            AND lighthouse IS NOT NULL
            AND LENGTH(lighthouse) <= 2 * 1024 * 1024 -- legacy tables have a different limit
        `
        );
})
