let month = '2024-08-01',
    month_YYYYMM = constants.fn_past_month(month).replace('-', '').substring(0, 6);

publish("pages_stable", {
    type: "incremental",
    schema: "all",
    bigquery: {
        partitionBy: "date",
        clusterBy: ["client", "is_root_page", "rank"],
        requirePartitionFilter: true,
    },
    columns: {
      date: "YYYY-MM-DD format of the HTTP Archive monthly crawl",
      client: "Test environment: desktop or mobile",
      page: "The URL of the page being tested",
      is_root_page: "Whether the page is the root of the origin.",
      root_page: "The URL of the root page being tested, the origin followed by /",
      rank: "Site popularity rank, from CrUX",
      wptId: "ID of the WebPageTest results",
      payload: "JSON-encoded WebPageTest results for the page",
      summary: "JSON-encoded summarization of the page-level data",
      custom_metrics: {
        description: "JSON-encoded test results of the custom metrics",
        columns: {
          performance: "JSON-encoded performance metrics",
          javascript: "JSON-encoded JavaScript metrics",
          media: "JSON-encoded media metrics",
          other: "JSON-encoded test results of the other custom metrics"
        }
      },
      lighthouse: "JSON-encoded Lighthouse report",
      features: {
        description: "Blink features detected at runtime (see https://chromestatus.com/features)",
        columns: {
          feature: "Blink feature name",
          id: "Blink feature  ID",
          type: "Blink feature type (css, default)"
        }
      },
      technologies: {
        description: "Technologies detected at runtime (see https://www.wappalyzer.com/)",
        columns: {
          technology: "Name of the detected technology",
          categories: "List of categories to which this technology belongs",
          info: "Additional metadata about the detected technology, ie version number"
        }
      },
      metadata: "Additional metadata about the test"
    },
    tags: ["pages_stable"],
}).preOps(ctx => `
CREATE TABLE IF NOT EXISTS ${ctx.self()}
(
  date DATE NOT NULL OPTIONS(description="YYYY-MM-DD format of the HTTP Archive monthly crawl"),
  client STRING NOT NULL OPTIONS(description="Test environment: desktop or mobile"),
  page STRING NOT NULL OPTIONS(description="The URL of the page being tested"),
  is_root_page BOOL NOT NULL OPTIONS(description="Whether the page is the root of the origin"),
  root_page STRING NOT NULL OPTIONS(description="The URL of the root page being tested, the origin followed by /"),
  rank INT64 OPTIONS(description="Site popularity rank, from CrUX"),
  wptid STRING OPTIONS(description="ID of the WebPageTest results"),
  payload STRING OPTIONS(description="JSON-encoded WebPageTest results for the page"),
  summary STRING OPTIONS(description="JSON-encoded summarization of the page-level data"),
  custom_metrics ARRAY<STRUCT<
    performance STRING OPTIONS(description="JSON-encoded performance metrics"),
    javascript STRING OPTIONS(description="JSON-encoded JavaScript metrics"),
    media STRING OPTIONS(description="JSON-encoded media metrics"),
    other STRING OPTIONS(description="JSON-encoded test results of the other custom metrics")
  >> OPTIONS(description="JSON-encoded test results of the custom metrics"),
  lighthouse STRING OPTIONS(description="JSON-encoded Lighthouse report"),
  features ARRAY<STRUCT<feature STRING OPTIONS(description="Blink feature name"), id STRING OPTIONS(description="Blink feature ID"), type STRING OPTIONS(description="Blink feature type (css, default)")>> OPTIONS(description="Blink features detected at runtime (see https://chromestatus.com/features)"),
  technologies ARRAY<STRUCT<technology STRING OPTIONS(description="Name of the detected technology"), categories ARRAY<STRING> OPTIONS(description="List of categories to which this technology belongs"), info ARRAY<STRING> OPTIONS(description="Additional metadata about the detected technology, ie version number")>> OPTIONS(description="Technologies detected at runtime (see https://www.wappalyzer.com/)"),
  metadata STRING OPTIONS(description="Additional metadata about the test")
)
PARTITION BY date
CLUSTER BY client, is_root_page, rank
OPTIONS(
  require_partition_filter=true
);

CREATE TEMP FUNCTION GET_CUSTOM_METRICS(custom_metrics STRING)
RETURNS STRUCT<performance STRING, other STRING> LANGUAGE js AS '''
  const topLevelMetrics = new Set([
    'performance'
  ]);
  try {
    custom_metrics = JSON.parse(custom_metrics);
  } catch {
    return {};
  }

  if (!custom_metrics) {
    return {};
  }

  const performance = JSON.stringify(custom_metrics.performance);
  delete custom_metrics.performance;

  const other = JSON.stringify(custom_metrics);

  return {
    performance,
    other
  }
'''
    `).query(ctx => `
SELECT
  date,
  client,
  page,
  is_root_page,
  root_page,
  rank,
  wptid,
  payload,
  summary,
  GET_CUSTOM_METRICS(custom_metrics) AS custom_metrics,
  lighthouse,
  features,
  technologies,
  metadata
FROM ${ctx.ref("all", "pages")} ${constants.dev_TABLESAMPLE}
WHERE date = '${month}'
`)

month = constants.fn_past_month(month)
month_YYYYMM = constants.fn_past_month(month).replace('-', '').substring(0, 6)

while (month >= '2022-07-01') {
  operate(`all_pages_stable ${month}`, {
    hasOutput: true
  }).tags(
    ["pages_stable"]
  ).queries(ctx => `
INSERT INTO ${ctx.ref("all", "pages_stable")}
AS
SELECT
  date,
  client,
  page,
  is_root_page,
  root_page,
  rank,
  wptid,
  payload,
  summary,
  GET_CUSTOM_METRICS(custom_metrics) AS custom_metrics,
  lighthouse,
  features,
  technologies,
  metadata
FROM ${ctx.ref("all", "pages")} ${constants.dev_TABLESAMPLE}
WHERE date = '${month}'
  `)

  month = constants.fn_past_month(month)
  month_YYYYMM = constants.fn_past_month(month).replace('-', '').substring(0, 6)
}
