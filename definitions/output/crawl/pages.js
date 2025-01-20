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
  tags: ['crawl_complete']
}).preOps(ctx => `
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
CREATE TEMP TABLE technologies_cleaned AS (
  WITH wappalyzer AS (
    SELECT
      name AS technology,
      categories AS valid_categories
    FROM ${ctx.ref('wappalyzer', 'technologies')}
  ), pages AS (
    SELECT
      client,
      page,
      tech.technology,
      tech.categories,
      tech.info
    FROM ${ctx.ref('crawl', 'pages')} AS pages
    LEFT JOIN pages.technologies AS tech
    WHERE date = '${constants.currentMonth}' ${constants.devRankFilter}
  ), -- Identify impacted pages
  impacted_pages AS (
    SELECT DISTINCT
      client,
      page
    FROM pages
    WHERE
      -- Categories are empty OR technology is corrupted OR contains invalid categories
      (technology IS NOT NULL AND ARRAY_LENGTH(categories) = 0)
      OR technology NOT IN (SELECT technology FROM wappalyzer)
      OR EXISTS (
        SELECT category
        FROM UNNEST(categories) AS category
        WHERE category NOT IN (SELECT DISTINCT UNNEST(valid_categories) FROM wappalyzer)
      )
  ), -- Flatten technologies for reconstruction
  flattened_technologies AS (
    SELECT
      client,
      page,
      technology,
      ARRAY(
        SELECT category
        FROM UNNEST(categories) AS category
        WHERE category IN (
          SELECT DISTINCT UNNEST(valid_categories)
          FROM wappalyzer
          WHERE technology = flattened_technologies.technology
        )
      ) AS valid_categories,
      info
    FROM pages
    WHERE page IN (SELECT DISTINCT page FROM impacted_pages)
  ), -- Reconstruct valid technologies
  reconstructed_technologies AS (
    SELECT
      client,
      page,
      ARRAY_AGG(STRUCT(
        f.technology,
        IF(ARRAY_LENGTH(f.valid_categories) = 0, w.valid_categories, f.valid_categories) AS categories,
        f.info
      )) AS technologies
    FROM flattened_technologies f
    LEFT JOIN wappalyzer w
    ON f.technology = w.technology
    WHERE f.technology IN (SELECT technology FROM wappalyzer)
    GROUP BY
      client,
      page
  )

  SELECT
    client,
    page,
    r.technologies
  FROM impacted_pages
  LEFT JOIN reconstructed_technologies r
  USING (client, page)
);

-- Update the crawl.pages table with the cleaned and restored technologies
UPDATE crawl.pages
SET technologies = technologies_cleaned.technologies
FROM technologies_cleaned
WHERE pages.date = '${constants.currentMonth}' AND
  pages.client = technologies_cleaned.client AND
  pages.page = technologies_cleaned.page;
`)
