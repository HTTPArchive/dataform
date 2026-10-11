operate('get_host_categories').tags(['functions']).queries(`
CREATE OR REPLACE FUNCTION \`httparchive.fn.GET_HOST_CATEGORIES\`(input_host STRING)
RETURNS ARRAY<STRUCT<host STRING, category_id INT64, full_category STRING, subcategory STRING, parent_category STRING>>
AS (
(
    WITH
      formatted_host AS (
        SELECT
          net.host(input_host) AS formatted_input_host
      ),
      host_to_query AS (
        SELECT
          CASE
            WHEN net.reg_domain((SELECT formatted_input_host FROM formatted_host)) IN (
                'googlesyndication.com', 'gstatic.com', 'imrworldwide.com', 'cloudfront.net', 'upravel.com', 
                'adsco.re', 'fastly-insights.com', 'cedexis-radar.net', 'beeline.ru', 'quora.com', 
                'online-metrix.net', 'ampproject.net', 'bumlam.com', 'forter.com', 'googleusercontent.com', 
                'dropboxusercontent.com', 'yahoodns.net', 'hinet.net', 'alibaba.com', 'tumblr.com', 
                'amazonaws.com', 'googleadservices.com', 'akamaihd.net', 'filesusr.com', 'dotnxdomain.net', 
                'nitrocdn.com', 'doubleclick.net', 'disqus.com', 'business.site', 'softonic.com', 'sensic.net', 
                'zendesk.com', 'stbid.ru', 'uptodown.com', 'wpengine.com', 'dca0.com', 'onef.pro', 
                'netdna-ssl.com', 'secureserver.net', 'bandcamp.com', 'parsely.com', 'editmysite.com', 
                'footprintdns.com', 'ioam.de', 'ridge1.com', 'optimole.com', 'whiteboxdigital.ru', 
                'sentry.io', 'mysimplestore.com', 'wix-code.com', 'smushcdn.com'
            ) THEN net.reg_domain((SELECT formatted_input_host FROM formatted_host))
            ELSE (SELECT formatted_input_host FROM formatted_host)
          END AS query_host
      ),
      -- Retrieve the categories
      categories_data AS (
        SELECT
          hostname,
          category_id,
          full_category,
          subcategory,
          parent_category
        FROM
          \`httparchive.urls.categories\`
        WHERE
          hostname = (SELECT query_host FROM host_to_query)
      )
    SELECT
      ARRAY_AGG(STRUCT(
        hostname AS host,
        category_id,
        full_category,
        subcategory,
        parent_category
      ))
    FROM
      categories_data
  )
);
`)
