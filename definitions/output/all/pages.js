constants.clients.forEach(client => {
    constants.booleans.forEach(boolean => {
        operate(
            "all/pages client=" + client + ",is_root_page=" + boolean, {
                hasOutput: true,
            }
        ).queries(
            ctx => `
                DELETE FROM
                  ${ctx.ref("all", "pages")}
                WHERE
                  date = '${constants.current_month}'
                  AND client = '${client}'
                  AND is_root_page = ${boolean};
                
                INSERT INTO ${ctx.ref("all", "pages")}
                SELECT
                  *
                FROM
                  \`crawl_staging.pages\`
                WHERE
                  date = '${constants.current_month}'
                  AND client = '${client}'
                  AND is_root_page = ${boolean};
            `
        )
    })
})
