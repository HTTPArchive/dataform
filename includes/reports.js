/**
 * WARNING & NOTES: Historical Report Data Issues & Backfill Status
 *
 * During the full migration backfill of GCS reports to per-metric BQ tables,
 * the following metrics had missing, incomplete, or corrupted data files in GCS:
 *
 * 1. Timeseries (GCS Consolidated JSON Files):
 *    - compileJs: Missing - No timeseries file exists in GCS.
 *    - evalJs: Missing - No timeseries file exists in GCS.
 *
 * 2. Histograms (GCS Monthly JSON Files):
 *    - compileJs: 27 files failed to download/parse (empty or truncated JSON)
 *      * reports/2016_01_01/compileJs.json to 2016_12_01/compileJs.json
 *      * reports/2017_08_01/compileJs.json to 2017_08_15/compileJs.json
 *      * reports/wordpress/2018_06_01/compileJs.json to 2018_06_15/compileJs.json
 *    - dcl: 51 files failed to download/parse (empty legacy JSON files)
 *      * reports/2011_06_01/dcl.json to 2013_07_01/dcl.json
 *    - evalJs: 26 files failed to download/parse (empty or truncated JSON)
 *      * reports/2016_01_01/evalJs.json to 2017_08_15/evalJs.json
 *      * reports/wordpress/2018_06_01/evalJs.json to 2018_06_15/evalJs.json
 *    - fcp: 2 files failed to download/parse (corrupted files)
 *      * reports/2017_08_01/fcp.json
 *      * reports/2017_08_15/fcp.json
 *
 * 3. Bin Schema & Data Precision Classifications:
 *    - FLOAT64 Bin Metrics: 11 metrics require exact floating-point decimal precision
 *      (bootupJs, dcl, ol, reqCss, reqFont, reqHtml, reqImg, reqJs, reqOther, reqTotal, reqVideo).
 *      Do NOT apply Math.round() or CAST AS INT64 on bin values during GCS ingestion or SQL generation.
 *    - INT64 Bin Metrics: 26 metrics represent integer counts, byte buckets, or integer calculations
 *      (bytesCss, bytesFont, bytesHtml, bytesImg, bytesJs, bytesOther, bytesTotal, bytesVideo, compileJs,
 *       crux*, evalJs, fcp, gzipSavings, imgSavings, offscreenImages, optimizedImages, speedIndex, tcp, ttci).
 *
 * If you need to backfill the missing/corrupted historical dates listed above, they must be
 * re-generated from the raw crawl pages tables (httparchive.crawl.pages) using Dataform operations.
 *
 * 4. Suggested Post-Migration Validation Tests:
 *    - Quantile Monotonicity: Verify that for all timeseries tables, quantiles satisfy
 *      p10 <= p25 <= p50 <= p75 <= p90.
 *    - CDF Integrity Check: Verify that for all histogram tables, the cdf increases
 *      monotonically and reaches exactly 1.0 at the highest bin of each partition.
 *    - Gap Analysis: Run a query to identify any missing dates/gaps in the backfilled BQ tables
 *      that are not documented in the missing list above.
 *    - Page Volume Validation: Compare total page counts in reports.numUrls_timeseries with
 *      the sum of volumes in corresponding histograms to ensure no missed/duplicate uploads.
 */
class DataformTemplateBuilder {
  /**
   * Create a Dataform SQL template that can be dynamically interpolated
   * @param {function} templateFn - A function that returns the SQL template string
   * @returns {function} A function that can be called with a context to resolve the template
   */
  static create(templateFn) {
    return (ctx, params) => {
      // Custom replacer function to handle nested variables
      const resolveVariable = (path, scope) => {
        // Split the path into parts (handles nested objects like 'constants.devRankFilter')
        const parts = path.split('.')

        // Traverse the provided scope (ctx or global) to find the value
        let value = scope
        for (const part of parts) {
          if (value === undefined || value === null) break
          value = value[part]
        }

        // Convert value to appropriate string representation
        if (value === undefined || value === null) return ''
        if (typeof value === 'string') return `'${value}'`
        if (typeof value === 'number') return value.toString()
        if (typeof value === 'boolean') return value.toString()
        if (typeof value === 'function') return value.toString()

        // For objects or arrays, use JSON.stringify
        return JSON.stringify(value)
      }

      // Generate the template with the provided context and global context
      return templateFn(ctx, params).replace(/\${(.*?)}/g, (match, p1) => {
        const [scope, path] = p1.includes(':') ? p1.split(':') : ['params', p1.trim()]
        return scope === 'ctx'
          ? resolveVariable(path.trim(), ctx)
          : resolveVariable(path.trim(), params)
      })
    }
  }
}

const config = {
  _metrics: {
    bytesCss: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(bytesCss / 10240) * 10 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.bytesCss) AS bytesCss
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(bytesCss, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(bytesCss, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(bytesCss, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(bytesCss, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(bytesCss, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.bytesCss) AS bytesCss
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.bytesCss) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    llmsTxt: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SAFE_DIVIDE(
                COUNTIF(valid),
                COUNT(0)
              ) * 100, 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                SAFE.BOOL(custom_metrics.other.llms_txt_validation.valid) AS valid,
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    bytesFont: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(bytesFont / 10240) * 10 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.bytesFont) AS bytesFont
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(bytesFont, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(bytesFont, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(bytesFont, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(bytesFont, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(bytesFont, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.bytesFont) AS bytesFont
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.bytesFont) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    bytesImg: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(bytesImg / 102400) * 100 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.bytesImg) AS bytesImg
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(bytesImg, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(bytesImg, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(bytesImg, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(bytesImg, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(bytesImg, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.bytesImg) AS bytesImg
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.bytesImg) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    bytesJs: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(bytesJS / 10240) * 10 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.bytesJS) AS bytesJS
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.bytesJS) AS bytesJS
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.bytesJS) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    bytesTotal: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(bytesTotal / 1024 / 100) * 100 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.bytesTotal) AS bytesTotal
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                INT64(summary.bytesTotal) AS bytesTotal
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND INT64(summary.bytesTotal) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    ttci: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(interactive_ms / 1000) AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    CAST(IFNULL(
                      SAFE.FLOAT64(lighthouse.audits.interactive.numericValue),
                      IFNULL(
                        SAFE.FLOAT64(lighthouse.audits['consistently-interactive'].rawValue),
                        SAFE.FLOAT64(lighthouse.audits.interactive.rawValue)
                      )
                    ) AS FLOAT64) AS interactive_ms
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin IS NOT NULL
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(100)], 2) AS p10,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(250)], 2) AS p25,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(500)], 2) AS p50,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(750)], 2) AS p75,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(900)], 2) AS p90
            FROM (
              SELECT
                client, lens_array, value
              FROM (
                SELECT client, ${lensArrayExpression} AS lens_array,
                  IFNULL(
                    SAFE.FLOAT64(lighthouse.audits.interactive.numericValue),
                    IFNULL(
                      SAFE.FLOAT64(lighthouse.audits.interactive.rawValue),
                      SAFE.FLOAT64(lighthouse.audits['consistently-interactive'].rawValue)
                    )
                  ) / 1000 AS value
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE date = '${params.date}' AND is_root_page
              )
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    pctHttps: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(STARTS_WITH(url, 'https'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'requests')}
            INNER JOIN (
              SELECT date, client, is_root_page, rank, page, ${lensArrayExpression} AS lens_array
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND date >= '2016-01-01'
            ) pages
            USING (date, client, is_root_page, rank, page)
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    storageEstimate: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, is_root_page, date, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '1371' OR feat.feature = 'DurableStorageEstimate')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    bootupJs: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  FLOOR(bootup_time / 100) / 10 AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(IFNULL(lighthouse.audits['bootup-time'].numericValue, lighthouse.audits['bootup-time'].rawValue)) AS bootup_time
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin IS NOT NULL
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(100)], 2) AS p10,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(250)], 2) AS p25,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(500)], 2) AS p50,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(750)], 2) AS p75,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(900)], 2) AS p90
            FROM (
              SELECT
                client, lens_array, value
              FROM (
                SELECT client, ${lensArrayExpression} AS lens_array,
                  IFNULL(
                    FLOAT64(lighthouse.audits['bootup-time'].numericValue),
                    FLOAT64(lighthouse.audits['bootup-time'].rawValue)
                  ) / 1000 AS value
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE date = '${params.date}' AND is_root_page
                  AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
              )
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    bytesVideo: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(bytesVideo / 10240) * 10 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.bytesVideo) AS bytesVideo
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(bytesVideo, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(bytesVideo, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(bytesVideo, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(bytesVideo, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(bytesVideo, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.bytesVideo) AS bytesVideo
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.bytesVideo) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    compileJs: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  compile AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    SAFE.INT64(payload['_cpu.v8.compile']) AS compile
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin >= 0
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(100)], 2) AS p10,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(250)], 2) AS p25,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(500)], 2) AS p50,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(750)], 2) AS p75,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(900)], 2) AS p90
            FROM (
              SELECT
                client, lens_array, value
              FROM (
                SELECT client, ${lensArrayExpression} AS lens_array,
                  SAFE.INT64(payload['_cpu.v8.compile']) AS value
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE date = '${params.date}' AND is_root_page
                  AND SAFE.INT64(payload['_cpu.v8.compile']) IS NOT NULL
                  AND SAFE.INT64(payload['_cpu.v8.compile']) >= 0
              )
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    dcl: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  FLOOR(onContentLoaded / 1000) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.onContentLoaded) AS onContentLoaded
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                    AND FLOAT64(summary.onContentLoaded) > 0
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(onContentLoaded, 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(onContentLoaded, 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(onContentLoaded, 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(onContentLoaded, 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(onContentLoaded, 1001)[OFFSET(901)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.onContentLoaded) AS onContentLoaded
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.onContentLoaded) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    evalJs: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOAT64(r.payload['_cpu.EvaluateScript']) / 20 AS INT64) * 20 AS bin
                FROM ${ctx.ref('crawl', 'requests')} r
                INNER JOIN (
                  SELECT date, client, is_root_page, rank, page, ${lensArrayExpression} AS lens_array
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ) pages
                USING (date, client, is_root_page, rank, page)
                , UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin >= 0
              )
            )
            ORDER BY lens, client, bin
          `)
        }
      ]
    },
    fcp: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(fcp / 1000) AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(payload['_chromeUserTiming.firstContentfulPaint']) AS fcp
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin >= 0
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(fcp, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(fcp, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(fcp, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(fcp, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(fcp, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                SAFE.FLOAT64(payload['_chromeUserTiming.firstContentfulPaint']) AS fcp
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            HAVING p50 IS NOT NULL
            ORDER BY lens, client
          `)
        }
      ]
    },
    gzipSavings: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(gzip_savings / (1024 * 2)) * 2 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    SAFE.FLOAT64(payload._gzip_savings) AS gzip_savings
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin IS NOT NULL
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(gzip_savings, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(gzip_savings, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(gzip_savings, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(gzip_savings, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(gzip_savings, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(payload._gzip_savings) AS gzip_savings
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    ol: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  FLOOR(onLoad / 1000) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.onLoad) AS onLoad
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                    AND FLOAT64(summary.onLoad) > 0
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(onLoad, 1001)[OFFSET(101)] / 1000, 2) AS p10,
              ROUND(APPROX_QUANTILES(onLoad, 1001)[OFFSET(251)] / 1000, 2) AS p25,
              ROUND(APPROX_QUANTILES(onLoad, 1001)[OFFSET(501)] / 1000, 2) AS p50,
              ROUND(APPROX_QUANTILES(onLoad, 1001)[OFFSET(751)] / 1000, 2) AS p75,
              ROUND(APPROX_QUANTILES(onLoad, 1001)[OFFSET(901)] / 1000, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.onLoad) AS onLoad
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.onLoad) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    reqCss: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  reqCss AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.reqCss) AS reqCss
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(reqCss, 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(reqCss, 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(reqCss, 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(reqCss, 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(reqCss, 1001)[OFFSET(901)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.reqCss) AS reqCss
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.reqCss) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    reqFont: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  reqFont AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.reqFont) AS reqFont
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(reqFont, 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(reqFont, 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(reqFont, 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(reqFont, 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(reqFont, 1001)[OFFSET(901)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.reqFont) AS reqFont
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.reqFont) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    reqHtml: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  reqHtml AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.reqHtml) AS reqHtml
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(reqHtml, 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(reqHtml, 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(reqHtml, 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(reqHtml, 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(reqHtml, 1001)[OFFSET(901)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.reqHtml) AS reqHtml
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.reqHtml) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    reqImg: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  reqImg AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.reqImg) AS reqImg
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(reqImg, 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(reqImg, 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(reqImg, 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(reqImg, 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(reqImg, 1001)[OFFSET(901)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.reqImg) AS reqImg
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.reqImg) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    reqJs: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  reqJS AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.reqJS) AS reqJS
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(reqJS, 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(reqJS, 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(reqJS, 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(reqJS, 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(reqJS, 1001)[OFFSET(901)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.reqJS) AS reqJS
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.reqJS) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    reqOther: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  reqOther AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.reqOther) AS reqOther
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(reqOther, 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(reqOther, 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(reqOther, 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(reqOther, 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(reqOther, 1001)[OFFSET(901)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.reqOther) AS reqOther
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.reqOther) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    reqTotal: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  FLOOR(reqTotal / 10) * 10 AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.reqTotal) AS reqTotal
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(reqTotal, 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(reqTotal, 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(reqTotal, 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(reqTotal, 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(reqTotal, 1001)[OFFSET(901)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.reqTotal) AS reqTotal
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.reqTotal) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    reqVideo: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  reqVideo AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(summary.reqVideo) AS reqVideo
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(reqVideo, 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(reqVideo, 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(reqVideo, 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(reqVideo, 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(reqVideo, 1001)[OFFSET(901)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(summary.reqVideo) AS reqVideo
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND FLOAT64(summary.reqVideo) > 0
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    imgSavings: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(image_savings / (1024 * 10)) * 10 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(payload._image_savings) AS image_savings
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin IS NOT NULL
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(image_savings, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(image_savings, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(image_savings, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(image_savings, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(image_savings, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(payload._image_savings) AS image_savings
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    offscreenImages: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(wasted_bytes / 10240) * 10 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    IFNULL(
                      INT64(lighthouse.audits['offscreen-images'].details.overallSavingsBytes),
                      INT64(lighthouse.audits['offscreen-images'].extendedInfo.value.wastedKb) * 1024
                    ) AS wasted_bytes
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin IS NOT NULL
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT
                client,
                IFNULL(INT64(lighthouse.audits['offscreen-images'].details.overallSavingsBytes),
                INT64(lighthouse.audits['offscreen-images'].extendedInfo.value.wastedKb) * 1024) AS wasted_bytes,
                ${lensArrayExpression} AS lens_array
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    optimizedImages: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(wasted_bytes / 10240) * 10 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    IFNULL(
                      INT64(lighthouse.audits['uses-optimized-images'].details.overallSavingsBytes),
                      INT64(lighthouse.audits['uses-optimized-images'].extendedInfo.value.wastedKb) * 1024
                    ) AS wasted_bytes
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin IS NOT NULL
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(wasted_bytes, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                IFNULL(
                  INT64(lighthouse.audits['uses-optimized-images'].details.overallSavingsBytes),
                  INT64(lighthouse.audits['uses-optimized-images'].extendedInfo.value.wastedKb) * 1024
                ) AS wasted_bytes
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    speedIndex: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  CAST(FLOOR(SpeedIndex / (1000)) * 1000 AS INT64) AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    FLOAT64(payload._SpeedIndex) AS SpeedIndex
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
                HAVING bin IS NOT NULL
              )
            )
            ORDER BY lens, client, bin
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(SpeedIndex, 1001)[OFFSET(101)] / 1000, 2) AS p10,
              ROUND(APPROX_QUANTILES(SpeedIndex, 1001)[OFFSET(251)] / 1000, 2) AS p25,
              ROUND(APPROX_QUANTILES(SpeedIndex, 1001)[OFFSET(501)] / 1000, 2) AS p50,
              ROUND(APPROX_QUANTILES(SpeedIndex, 1001)[OFFSET(751)] / 1000, 2) AS p75,
              ROUND(APPROX_QUANTILES(SpeedIndex, 1001)[OFFSET(901)] / 1000, 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                FLOAT64(payload._SpeedIndex) AS SpeedIndex
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    tcp: {
      SQL: [
        {
          type: 'histogram',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client, lens ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client, lens) AS pdf
              FROM (
                SELECT client, lens, COUNT(0) AS volume,
                  connections AS bin
                FROM (
                  SELECT client, ${lensArrayExpression} AS lens_array,
                    INT64(summary._connections) AS connections
                  FROM ${ctx.ref('crawl', 'pages')}
                  WHERE date = '${params.date}' AND is_root_page
                    AND INT64(summary._connections) > 0
                ), UNNEST(lens_array) AS lens
                WHERE lens IS NOT NULL
                GROUP BY client, lens, bin
              )
            )
            ORDER BY lens, client, bin
          `)
        }
      ]
    },
    imgLazy: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(COUNT(DISTINCT IF(LOWER(LAX_STRING(attr)) = 'lazy', page, NULL)) * 100 / COUNT(DISTINCT page), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                page,
                custom_metrics
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND date > '2016-01-01' AND is_root_page
            )
            LEFT JOIN UNNEST(JSON_EXTRACT_ARRAY(custom_metrics.other['img-loading-attr'])) AS attr
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    h2: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(LAX_STRING(r.summary.respHttpVersion) = 'HTTP/2', 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'requests')} r
            INNER JOIN (
              SELECT date, client, is_root_page, rank, page, ${lensArrayExpression} AS lens_array
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ) pages
            USING (date, client, is_root_page, rank, page)
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    h3: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(
                SUM(
                  IF(
                    LAX_STRING(r.summary.respHttpVersion) IN ('HTTP/3', 'h3', 'h3-29')
                    OR REGEXP_EXTRACT(REGEXP_EXTRACT(resp.value, r'(.*)'), r'(.*?)(?:, [^ ]* = .*)?$') LIKE '%h3=%'
                    OR REGEXP_EXTRACT(REGEXP_EXTRACT(resp.value, r'(.*)'), r'(.*?)(?:, [^ ]* = .*)?$') LIKE '%h3-29=%',
                    1, 0
                  )
                ) * 100 / COUNT(0), 2
              ) AS percent
            FROM ${ctx.ref('crawl', 'requests')} r
            LEFT OUTER JOIN UNNEST(response_headers) AS resp
              ON (resp.name = 'alt-svc')
            INNER JOIN (
              SELECT date, client, is_root_page, rank, page, ${lensArrayExpression} AS lens_array
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ) pages
            USING (date, client, is_root_page, rank, page)
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    fontDisplay: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits['font-display'].score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
                AND LAX_STRING(lighthouse.audits['font-display'].score) IS NOT NULL
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    canonical: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits.canonical.score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    a11yButtonName: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits['button-name'].score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    hreflang: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits.hreflang.score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
                AND LAX_STRING(lighthouse.audits.hreflang.score) IS NOT NULL
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    numUrls: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              COUNT(0) AS urls
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    contentIndex: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2983' OR feat.feature = 'ContentIndexAdd')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    legible: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits['font-size'].score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL
                AND LAX_STRING(lighthouse.audits['font-size'].score) IS NOT NULL
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    a11yColorContrast: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits['color-contrast'].score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    a11yImageAlt: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits['image-alt'].score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    a11yLabel: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits.label.score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    a11yLinkName: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits['link-name'].score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    a11yScores: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(100)], 2) AS p10,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(250)], 2) AS p25,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(500)], 2) AS p50,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(750)], 2) AS p75,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(900)], 2) AS p90
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                IFNULL(
                  LAX_FLOAT64(lighthouse.categories.accessibility.score) * 100,
                  httparchive.fn.getA11yScore(lighthouse.reportCategories)
                ) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    asyncClipboardRead: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2369' OR feat.feature = 'AsyncClipboardAPIRead')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    badgeClear: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2727' OR feat.feature = 'BadgeClear')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    badgeSet: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array, features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2726' OR feat.feature = 'BadgeSet')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    getInstalledRelatedApps: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array, features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '1870' OR feat.feature = 'V8Navigator_GetInstalledRelatedApps_Method')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    idleDetection: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2834' OR feat.feature = 'IdleDetectionStart')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    linkText: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              ROUND(SUM(IF(score IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                LAX_STRING(lighthouse.audits['link-text'].score) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
                AND lighthouse IS NOT NULL AND LAX_STRING(lighthouse.audits['link-text'].score) IS NOT NULL
            ), UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client
          `)
        }
      ]
    },
    notificationTriggers: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '3017' OR feat.feature = 'NotificationShowTrigger')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    periodicBackgroundSync: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2930' OR feat.feature = 'PeriodicBackgroundSync')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    periodicBackgroundSyncRegister: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array, features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2931' OR feat.feature = 'PeriodicBackgroundSyncRegister')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    quicTransport: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '3184' OR feat.feature = 'QuicTransport')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    screenWakeLock: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '3005' OR feat.feature = 'WakeLockAcquireScreenLock')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    storagePersist: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '3018' OR feat.feature = 'DurableStoragePersist')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    swControlledPages: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id = '990' OR feat.feature = 'ServiceWorkerControlledPage', 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id = '990' OR feat.feature = 'ServiceWorkerControlledPage', 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '990' OR feat.feature = 'ServiceWorkerControlledPage')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    },
    webSocketStream: {
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT client, lens,
              SUM(IF(feat.id = '3018' OR feat.feature = 'WebSocketStreamConstructor', 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id = '3018' OR feat.feature = 'WebSocketStreamConstructor', 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM (
              SELECT client, ${lensArrayExpression} AS lens_array,
                features
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE date = '${params.date}' AND is_root_page
            )
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '3018' OR feat.feature = 'WebSocketStreamConstructor')
            , UNNEST(lens_array) AS lens
            WHERE lens IS NOT NULL
            GROUP BY client, lens
            ORDER BY lens, client, num_urls DESC
          `)
        }
      ]
    }
  }
}

const lenses = {
  all: '',
  top1k: 'AND rank <= 1000',
  top10k: 'AND rank <= 10000',
  top100k: 'AND rank <= 100000',
  top1m: 'AND rank <= 1000000',
  drupal: 'AND \'Drupal\' IN UNNEST(technologies.technology)',
  magento: 'AND \'Magento\' IN UNNEST(technologies.technology)',
  wordpress: 'AND \'WordPress\' IN UNNEST(technologies.technology)'
}

const lensArrayExpression = `ARRAY[
  'all',
  IF(rank <= 1000, 'top1k', NULL),
  IF(rank <= 10000, 'top10k', NULL),
  IF(rank <= 100000, 'top100k', NULL),
  IF(rank <= 1000000, 'top1m', NULL),
  IF('Drupal' IN UNNEST(technologies.technology), 'drupal', NULL),
  IF('Magento' IN UNNEST(technologies.technology), 'magento', NULL),
  IF('WordPress' IN UNNEST(technologies.technology), 'wordpress', NULL)
]`;

class HTTPArchiveReports {
  constructor() {
    this.config = config
    this.lenses = lenses
    this.lensArrayExpression = lensArrayExpression
  }

  listReports() {
    const reportIds = this.config._reports

    const reports = reportIds.map(reportId => {
      const report = this.getReport(reportId)
      return report
    })

    return reports
  }

  getReport(reportId) {
    const report = this.config[reportId]
    return {
      id: reportId,
      ...report
    }
  }

  listMetrics(reportId) {
    if (reportId === undefined) {
      const metrics = Object.keys(this.config._metrics).map(metricId => {
        const metric = this.getMetric(metricId)
        return metric
      }).filter(metric => metric.SQL)

      return metrics
    } else {
      const report = this.getReport(reportId)
      const metricIds = report.metrics

      const metrics = metricIds.map(metricId => {
        const metric = this.getMetric(metricId)
        return metric
      }).filter(metric => metric.SQL)

      return metrics
    }
  }

  getMetric(metricId) {
    const metric = this.config._metrics[metricId]

    return {
      id: metricId,
      ...metric
    }
  }
}

module.exports = {
  HTTPArchiveReports,
  lenses,
  lensArrayExpression
}
