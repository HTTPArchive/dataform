declare({
    schema: "all",
    name: "pages",
});

operate('pages cleanup',
    ctx => `
      DELETE FROM
        ${ctx.ref("all", "pages")}
      WHERE
        date = '${constants.date}'
`)
