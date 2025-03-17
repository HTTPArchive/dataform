// Staging tables source: https://github.com/HTTPArchive/crawl/blob/main/crawl.py
['pages', 'requests', 'parsed_css'].forEach(table =>
  declare({
    schema: 'crawl_staging',
    name: table
  })
);

// Wappalyzer tables source: https://github.com/HTTPArchive/wappalyzer/blob/main/.github/workflows/upload.yml
['technologies', 'categories'].forEach(table =>
  declare({
    schema: 'wappalyzer',
    name: table
  })
)
