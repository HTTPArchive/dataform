const stagingTables = ['pages', 'requests', 'parsed_css']
for (const table of stagingTables) {
  declare({
    schema: 'crawl_staging',
    name: table
  })
}

declare({
  schema: 'wappalyzer',
  name: 'technologies'
})

declare({
  schema: 'wappalyzer',
  name: 'categories'
})
