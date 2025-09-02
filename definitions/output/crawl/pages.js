// See https://github.com/HTTPArchive/dataform/issues/43
assert('corrupted_technology_values')
  .tags(['crawl_complete'])
  .query(ctx => `
${reservations.reservation_setter(ctx)}

SELECT
  /*
    date,
    client,
    tech,
    ARRAY_AGG(DISTINCT page LIMIT 3) AS sample_pages,
  */
  COUNT(DISTINCT page) AS cnt_pages
FROM ${ctx.ref('crawl_staging', 'pages')} AS pages
LEFT JOIN pages.technologies AS tech
LEFT JOIN tech.categories AS category
WHERE
  date = '${constants.currentMonth}' AND
  (
    tech.technology NOT IN (SELECT DISTINCT name FROM wappalyzer.technologies)
    OR category NOT IN (SELECT DISTINCT name FROM wappalyzer.categories)
    OR ARRAY_LENGTH(tech.categories) = 0
  )
/*
GROUP BY
  date,
  client,
  tech
ORDER BY cnt_pages DESC
*/
HAVING cnt_pages > 200
  `)

publish('pages', {
  type: 'incremental',
  protected: true,
  schema: 'crawl',
  bigquery: {
    partitionBy: 'date',
    clusterBy: ['client', 'is_root_page', 'rank', 'page'],
    requirePartitionFilter: true
  },
  columns: {
    date: 'YYYY-MM-DD format of the HTTP Archive monthly crawl',
    client: 'Test environment: desktop or mobile',
    page: 'The URL of the page being tested',
    is_root_page: 'Whether the page is the root of the origin',
    root_page: 'The URL of the root page being tested, the origin followed by /',
    rank: 'Site popularity rank, from CrUX',
    wptid: 'ID of the WebPageTest results',
    payload: 'JSON-encoded WebPageTest results for the page',
    summary: 'JSON-encoded summarization of the page-level data',
    custom_metrics: {
      description: 'Custom metrics from WebPageTest',
      columns: {
        a11y: 'JSON-encoded A11Y metrics',
        cms: 'JSON-encoded CMS detection',
        cookies: 'JSON-encoded cookie metrics',
        css_variables: 'JSON-encoded CSS variable metrics',
        ecommerce: 'JSON-encoded ecommerce metrics',
        element_count: 'JSON-encoded element count metrics',
        javascript: 'JSON-encoded JavaScript metrics',
        markup: 'JSON-encoded markup metrics',
        media: 'JSON-encoded media metrics',
        origin_trials: 'JSON-encoded origin trial metrics',
        performance: 'JSON-encoded performance metrics',
        privacy: 'JSON-encoded privacy metrics',
        responsive_images: 'JSON-encoded responsive image metrics',
        robots_txt: 'JSON-encoded robots.txt metrics',
        security: 'JSON-encoded security metrics',
        structured_data: 'JSON-encoded structured data metrics',
        third_parties: 'JSON-encoded third-party metrics',
        well_known: 'JSON-encoded well-known metrics',
        wpt_bodies: 'JSON-encoded WebPageTest bodies',
        other: 'JSON-encoded other custom metrics'
      }
    },
    lighthouse: 'JSON-encoded Lighthouse report',
    features: 'Blink features detected at runtime (see https://chromestatus.com/features)',
    technologies: 'Technologies detected at runtime (see https://www.wappalyzer.com/)',
    metadata: 'Additional metadata about the test'
  },
  tags: ['crawl_complete'],
  dependOnDependencyAssertions: true
}).preOps(ctx => `
${reservations.reservation_setter(ctx)}

DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}' AND
  client = 'desktop';

INSERT INTO ${ctx.self()}
SELECT
  *
FROM ${ctx.ref('crawl_staging', 'pages')}
WHERE date = '${constants.currentMonth}' AND
  client = 'desktop'
  ${constants.devRankFilter};

DELETE FROM ${ctx.self()}
WHERE date = '${constants.currentMonth}' AND
  client = 'mobile';
`).query(ctx => `
SELECT
  *
FROM ${ctx.ref('crawl_staging', 'pages')}
WHERE date = '${constants.currentMonth}' AND
  client = 'mobile'
  ${constants.devRankFilter}
`).postOps(ctx => `
SET @@RESERVATION='none';

CREATE TEMP TABLE technologies_cleaned AS (
  WITH technologies AS (
    SELECT DISTINCT
      name AS technology,
      categories
    FROM ${ctx.ref('wappalyzer', 'technologies')}
  ),

  pages AS (
    SELECT
      client,
      page,
      tech.technology,
      tech.categories,
      tech.info
    FROM ${ctx.self()} AS pages
    LEFT JOIN pages.technologies AS tech
    WHERE date = '${constants.currentMonth}' ${constants.devRankFilter}
  ),

  -- Identify impacted pages
  impacted_pages AS (
    SELECT DISTINCT
      client,
      page
    FROM pages
    LEFT JOIN pages.categories AS category
    WHERE
      -- Technology is corrupted
      technology NOT IN (SELECT DISTINCT technology FROM technologies) OR
      -- Technology's category is corrupted
      CONCAT(technology, category) NOT IN (
        SELECT DISTINCT
          CONCAT(technology, category)
        FROM technologies
        INNER JOIN technologies.categories AS category
      )
  ),

  -- Keep valid technologies and use correct categories
  reconstructed_technologies AS (
    SELECT
      client,
      page,
      ARRAY_AGG(STRUCT(
        pages.technology,
        technologies.categories,
        pages.info
      )) AS technologies
    FROM pages
    INNER JOIN impacted_pages
    USING (client, page)
    INNER JOIN technologies
    USING (technology)
    GROUP BY
      client,
      page
  )

  SELECT
    client,
    page,
    reconstructed_technologies.technologies
  FROM impacted_pages
  LEFT JOIN reconstructed_technologies
  USING(client,page)
);

-- Update the crawl.pages table with the cleaned and restored technologies
UPDATE ${ctx.self()} AS pages
SET technologies = technologies_cleaned.technologies
FROM technologies_cleaned
WHERE pages.date = '${constants.currentMonth}' AND
  pages.client = technologies_cleaned.client AND
  pages.page = technologies_cleaned.page;
`)
