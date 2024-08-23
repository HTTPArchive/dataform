operate('pages cleanup',
    ctx => `
      DELETE FROM
        \`all.pages\`
      WHERE
        date = '${constants.date}'
`)

constants.clients.forEach(client => {
    constants.booleans.forEach(boolean => {
        operate("pages,client=" + client + ",is_root_page=" + boolean,
            ctx => `
              INSERT INTO \`all.pages\`
              SELECT
                *
              FROM
                \`test.pages\`
              WHERE
                date = '${constants.date}'
                AND client = '${client}'
                AND is_root_page = ${boolean}
      `)
    })
})

declare({
    schema: "all",
    name: "pages"
});
