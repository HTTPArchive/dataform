constants.clients.forEach(client => {
    constants.booleans.forEach(boolean => {
        operate("pages,client=" + client + ",is_root_page=" + boolean, {
            tags: ["after_crawl"]
        }).queries(
            ctx => `
              INSERT INTO ${ctx.ref("all", "pages")}
              SELECT
                *
              FROM
                ${ctx.ref("crawl_staging", "pages")}
              WHERE
                date = '${constants.date}'
                AND client = '${client}'
                AND is_root_page = ${boolean}
      `)
    })
})
