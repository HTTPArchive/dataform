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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(summary.bytesCss) / 10240) * 10 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
        },
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesCss), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesCss), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesCss), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesCss), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesCss), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.bytesCss) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
        }
      ]
    },
    llmsTxt: {
      enabled: true,
      SQL: [
        {
          type: 'timeseries',
          query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SAFE_DIVIDE(
                COUNTIF(SAFE.BOOL(custom_metrics.other.llms_txt_validation.valid)),
                COUNT(0)
              ) * 100, 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
        }
      ]
    }
  },
  ttci: {
    SQL: [
      {
        type: 'histogram',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(CAST(IFNULL(
                    FLOAT64(lighthouse.audits.interactive.numericValue),
                    IFNULL(
                      FLOAT64(lighthouse.audits['consistently-interactive'].rawValue),
                      FLOAT64(lighthouse.audits.interactive.rawValue)
                    )
                  ) AS FLOAT64) / 1000) AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin IS NOT NULL
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(100)], 2) AS p10,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(250)], 2) AS p25,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(500)], 2) AS p50,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(750)], 2) AS p75,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(900)], 2) AS p90
            FROM (
              SELECT
                client,
                IFNULL(
                  FLOAT64(lighthouse.audits.interactive.numericValue),
                  IFNULL(
                    FLOAT64(lighthouse.audits.interactive.rawValue),
                    FLOAT64(lighthouse.audits['consistently-interactive'].rawValue)
                  )
                ) / 1000 AS value
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE
                date = '${params.date}'
                AND is_root_page
                ${params.lens.sql}
                ${params.devRankFilter}
            )
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  pctHttps: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(STARTS_WITH(url, 'https'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'requests')}
            INNER JOIN ${ctx.ref('crawl', 'pages')}
            USING (date, client, is_root_page, rank, page)
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  storageEstimate: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '1371' OR feat.feature = 'DurableStorageEstimate')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOOR(FLOAT64(IFNULL(lighthouse.audits['bootup-time'].numericValue, lighthouse.audits['bootup-time'].rawValue)) / 100) / 10 AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin IS NOT NULL
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(100)], 2) AS p10,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(250)], 2) AS p25,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(500)], 2) AS p50,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(750)], 2) AS p75,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(900)], 2) AS p90
            FROM (
              SELECT
                client,
                IFNULL(
                  FLOAT64(lighthouse.audits['bootup-time'].numericValue),
                  FLOAT64(lighthouse.audits['bootup-time'].rawValue)
                ) / 1000 AS value
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE
                date = '${params.date}'
                AND is_root_page
                ${params.lens.sql}
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
                ${params.devRankFilter}
            )
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(summary.bytesFont) / 10240) * 10 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesFont), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesFont), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesFont), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesFont), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesFont), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.bytesFont) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  bytesHtml: {
    SQL: [
      {
        type: 'histogram',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(summary.bytesHtml) / 10240) * 10 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesHtml), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesHtml), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesHtml), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesHtml), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesHtml), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.bytesHtml) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(summary.bytesImg) / 102400) * 100 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesImg), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesImg), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesImg), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesImg), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesImg), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.bytesImg) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(summary.bytesJS) / 10240) * 10 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesJS), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesJS), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesJS), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesJS), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesJS), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.bytesJS) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  bytesOther: {
    SQL: [
      {
        type: 'histogram',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(summary.bytesOther) / 10240) * 10 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesOther), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesOther), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesOther), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesOther), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesOther), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.bytesOther) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(summary.bytesTotal) / 1024 / 100) * 100 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND INT64(summary.bytesTotal) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(summary.bytesVideo) / 10240) * 10 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesVideo), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesVideo), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesVideo), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesVideo), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.bytesVideo), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.bytesVideo) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  INT64(payload['_cpu.v8.compile']) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin >= 0
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(100)], 2) AS p10,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(250)], 2) AS p25,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(500)], 2) AS p50,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(750)], 2) AS p75,
              ROUND(APPROX_QUANTILES(value, 1000)[OFFSET(900)], 2) AS p90
            FROM (
              SELECT
                client,
                INT64(payload['_cpu.v8.compile']) AS value
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE
                date = '${params.date}'
                AND is_root_page
                ${params.lens.sql}
                AND INT64(payload['_cpu.v8.compile']) IS NOT NULL AND INT64(payload['_cpu.v8.compile']) >= 0
                ${params.devRankFilter}
            )
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOOR(FLOAT64(summary.onContentLoaded) / 1000) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  AND FLOAT64(summary.onContentLoaded) > 0
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onContentLoaded), 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onContentLoaded), 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onContentLoaded), 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onContentLoaded), 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onContentLoaded), 1001)[OFFSET(901)], 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.onContentLoaded) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOAT64(r.payload['_cpu.EvaluateScript']) / 20 AS INT64) * 20 AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'requests')} r
                INNER JOIN ${ctx.ref('crawl', 'pages')}
                USING (date, client, is_root_page, rank, page)
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin >= 0
              )
            )
            ORDER BY
              bin,
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(payload['_chromeUserTiming.firstContentfulPaint']) / 1000) AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin >= 0
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(payload['_chromeUserTiming.firstContentfulPaint']), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(payload['_chromeUserTiming.firstContentfulPaint']), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(payload['_chromeUserTiming.firstContentfulPaint']), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(payload['_chromeUserTiming.firstContentfulPaint']), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(payload['_chromeUserTiming.firstContentfulPaint']), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            HAVING
              p50 IS NOT NULL
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(payload._gzip_savings) / (1024 * 2)) * 2 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin IS NOT NULL
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._gzip_savings), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._gzip_savings), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._gzip_savings), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._gzip_savings), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._gzip_savings), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOOR(FLOAT64(summary.onLoad) / 1000) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  AND FLOAT64(summary.onLoad) > 0
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onLoad), 1001)[OFFSET(101)] / 1000, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onLoad), 1001)[OFFSET(251)] / 1000, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onLoad), 1001)[OFFSET(501)] / 1000, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onLoad), 1001)[OFFSET(751)] / 1000, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.onLoad), 1001)[OFFSET(901)] / 1000, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.onLoad) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOAT64(summary.reqCss) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqCss), 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqCss), 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqCss), 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqCss), 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqCss), 1001)[OFFSET(901)], 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.reqCss) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOAT64(summary.reqFont) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqFont), 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqFont), 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqFont), 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqFont), 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqFont), 1001)[OFFSET(901)], 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.reqFont) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOAT64(summary.reqHtml) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqHtml), 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqHtml), 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqHtml), 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqHtml), 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqHtml), 1001)[OFFSET(901)], 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.reqHtml) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOAT64(summary.reqImg) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqImg), 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqImg), 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqImg), 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqImg), 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqImg), 1001)[OFFSET(901)], 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.reqImg) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOAT64(summary.reqJS) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqJS), 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqJS), 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqJS), 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqJS), 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqJS), 1001)[OFFSET(901)], 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.reqJS) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOAT64(summary.reqOther) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqOther), 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqOther), 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqOther), 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqOther), 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqOther), 1001)[OFFSET(901)], 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.reqOther) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOOR(FLOAT64(summary.reqTotal) / 10) * 10 AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqTotal), 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqTotal), 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqTotal), 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqTotal), 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqTotal), 1001)[OFFSET(901)], 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.reqTotal) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  FLOAT64(summary.reqVideo) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqVideo), 1001)[OFFSET(101)], 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqVideo), 1001)[OFFSET(251)], 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqVideo), 1001)[OFFSET(501)], 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqVideo), 1001)[OFFSET(751)], 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(summary.reqVideo), 1001)[OFFSET(901)], 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND FLOAT64(summary.reqVideo) > 0
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(payload._image_savings) / (1024 * 10)) * 10 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin IS NOT NULL
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._image_savings), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._image_savings), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._image_savings), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._image_savings), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._image_savings), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(IFNULL(
                    INT64(lighthouse.audits['offscreen-images'].details.overallSavingsBytes),
                    INT64(lighthouse.audits['offscreen-images'].extendedInfo.value.wastedKb) * 1024
                  ) / 10240) * 10 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin IS NOT NULL
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['offscreen-images'].details.overallSavingsBytes), INT64(lighthouse.audits['offscreen-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['offscreen-images'].details.overallSavingsBytes), INT64(lighthouse.audits['offscreen-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['offscreen-images'].details.overallSavingsBytes), INT64(lighthouse.audits['offscreen-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['offscreen-images'].details.overallSavingsBytes), INT64(lighthouse.audits['offscreen-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['offscreen-images'].details.overallSavingsBytes), INT64(lighthouse.audits['offscreen-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(IFNULL(
                    INT64(lighthouse.audits['uses-optimized-images'].details.overallSavingsBytes),
                    INT64(lighthouse.audits['uses-optimized-images'].extendedInfo.value.wastedKb) * 1024
                  ) / 10240) * 10 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin IS NOT NULL
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['uses-optimized-images'].details.overallSavingsBytes), INT64(lighthouse.audits['uses-optimized-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(101)] / 1024, 2) AS p10,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['uses-optimized-images'].details.overallSavingsBytes), INT64(lighthouse.audits['uses-optimized-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(251)] / 1024, 2) AS p25,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['uses-optimized-images'].details.overallSavingsBytes), INT64(lighthouse.audits['uses-optimized-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(501)] / 1024, 2) AS p50,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['uses-optimized-images'].details.overallSavingsBytes), INT64(lighthouse.audits['uses-optimized-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(751)] / 1024, 2) AS p75,
              ROUND(APPROX_QUANTILES(IFNULL(INT64(lighthouse.audits['uses-optimized-images'].details.overallSavingsBytes), INT64(lighthouse.audits['uses-optimized-images'].extendedInfo.value.wastedKb) * 1024), 1001)[OFFSET(901)] / 1024, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  CAST(FLOOR(FLOAT64(payload._SpeedIndex) / (1000)) * 1000 AS INT64) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
                HAVING
                  bin IS NOT NULL
              )
            )
            ORDER BY
              bin,
              client
          `)
      },
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._SpeedIndex), 1001)[OFFSET(101)] / 1000, 2) AS p10,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._SpeedIndex), 1001)[OFFSET(251)] / 1000, 2) AS p25,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._SpeedIndex), 1001)[OFFSET(501)] / 1000, 2) AS p50,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._SpeedIndex), 1001)[OFFSET(751)] / 1000, 2) AS p75,
              ROUND(APPROX_QUANTILES(FLOAT64(payload._SpeedIndex), 1001)[OFFSET(901)] / 1000, 2) AS p90
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
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
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  client,
                  INT64(summary._connections) AS bin,
                  COUNT(0) AS volume
                FROM ${ctx.ref('crawl', 'pages')}
                WHERE
                  date = '${params.date}'
                  AND is_root_page
                  ${params.lens.sql}
                  AND INT64(summary._connections) > 0
                  ${params.devRankFilter}
                GROUP BY
                  bin,
                  client
              )
            )
            ORDER BY
              bin,
              client
          `)
      }
    ]
  },
  imgLazy: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(COUNT(DISTINCT IF(LOWER(LAX_STRING(attr)) = 'lazy', page, NULL)) * 100 / COUNT(DISTINCT page), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT JOIN
              UNNEST(JSON_EXTRACT_ARRAY(custom_metrics.other['img-loading-attr'])) AS attr
            WHERE
              date = '${params.date}' AND date > '2016-01-01'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  h2: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(r.summary.respHttpVersion) = 'HTTP/2', 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'requests')} r
            INNER JOIN ${ctx.ref('crawl', 'pages')}
            USING (date, client, is_root_page, rank, page)
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  h3: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(
                SUM(
                  IF(
                    LAX_STRING(r.summary.respHttpVersion) IN ('HTTP/3', 'h3', 'h3-29') OR
                    REGEXP_EXTRACT(REGEXP_EXTRACT(resp.value, r'(.*)'), r'(.*?)(?:, [^ ]* = .*)?$') LIKE '%h3=%' OR
                    REGEXP_EXTRACT(REGEXP_EXTRACT(resp.value, r'(.*)'), r'(.*?)(?:, [^ ]* = .*)?$') LIKE '%h3-29=%',
                    1, 0
                  )
                ) * 100 / COUNT(0), 2
              ) AS percent
            FROM ${ctx.ref('crawl', 'requests')} r
            LEFT OUTER JOIN
            UNNEST(response_headers) AS resp
            ON (resp.name = 'alt-svc')
            INNER JOIN ${ctx.ref('crawl', 'pages')}
            USING (date, client, is_root_page, rank, page)
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  fontDisplay: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits['font-display'].score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
              AND LAX_STRING(lighthouse.audits['font-display'].score) IS NOT NULL
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  canonical: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits.canonical.score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}' AND
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  a11yButtonName: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits['button-name'].score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  hreflang: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits.hreflang.score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}' AND LAX_STRING(lighthouse.audits.hreflang.score) IS NOT NULL
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  numUrls: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              COUNT(0) AS urls
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  contentIndex: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2983' OR feat.feature = 'ContentIndexAdd')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  legible: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits['font-size'].score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND LAX_STRING(lighthouse.audits['font-size'].score) IS NOT NULL
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  a11yColorContrast: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits['color-contrast'].score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  a11yImageAlt: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits['image-alt'].score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  a11yLabel: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits.label.score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  a11yLinkName: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits['link-name'].score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  a11yScores: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(100)], 2) AS p10,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(250)], 2) AS p25,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(500)], 2) AS p50,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(750)], 2) AS p75,
              ROUND(APPROX_QUANTILES(score, 1000)[OFFSET(900)], 2) AS p90
            FROM (
              SELECT
                client,
                IFNULL(LAX_FLOAT64(lighthouse.categories.accessibility.score) * 100, httparchive.fn.getA11yScore(lighthouse.reportCategories)) AS score
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE
                date = '${params.date}'
                AND is_root_page
                ${params.lens.sql}
                AND lighthouse IS NOT NULL AND TO_JSON_STRING(lighthouse) != '{}'
                ${params.devRankFilter}
            )
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  asyncClipboardRead: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2369' OR feat.feature = 'AsyncClipboardAPIRead')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  badgeClear: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2727' OR feat.feature = 'BadgeClear')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  badgeSet: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2726' OR feat.feature = 'BadgeSet')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  getInstalledRelatedApps: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '1870' OR feat.feature = 'V8Navigator_GetInstalledRelatedApps_Method')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  idleDetection: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2834' OR feat.feature = 'IdleDetectionStart')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  linkText: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              ROUND(SUM(IF(LAX_STRING(lighthouse.audits['link-text'].score) IN ('true', '1'), 1, 0)) * 100 / COUNT(0), 2) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              AND lighthouse IS NOT NULL AND LAX_STRING(lighthouse.audits['link-text'].score) IS NOT NULL
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client
          `)
      }
    ]
  },
  notificationTriggers: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '3017' OR feat.feature = 'NotificationShowTrigger')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  periodicBackgroundSync: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2930' OR feat.feature = 'PeriodicBackgroundSync')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  periodicBackgroundSyncRegister: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '2931' OR feat.feature = 'PeriodicBackgroundSyncRegister')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  quicTransport: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '3184' OR feat.feature = 'QuicTransport')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  screenWakeLock: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN UNNEST(features) AS feat
            ON (feat.id = '3005' OR feat.feature = 'WakeLockAcquireScreenLock')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  storagePersist: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id IS NOT NULL, 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id IS NOT NULL, 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN
              UNNEST(features) AS feat
            ON (feat.id = '3018' OR feat.feature = 'DurableStoragePersist')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  swControlledPages: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id = '990' OR feat.feature = 'ServiceWorkerControlledPage', 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id = '990' OR feat.feature = 'ServiceWorkerControlledPage', 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN
              UNNEST(features) AS feat
            ON (feat.id = '990' OR feat.feature = 'ServiceWorkerControlledPage')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
  },
  webSocketStream: {
    SQL: [
      {
        type: 'timeseries',
        query: DataformTemplateBuilder.create((ctx, params) => `
            SELECT
              client,
              SUM(IF(feat.id = '3018' OR feat.feature = 'WebSocketStreamConstructor', 1, 0)) AS num_urls,
              ROUND(SUM(IF(feat.id = '3018' OR feat.feature = 'WebSocketStreamConstructor', 1, 0)) / COUNT(0) * 100, 5) AS percent
            FROM ${ctx.ref('crawl', 'pages')}
            LEFT OUTER JOIN
              UNNEST(features) AS feat
            ON (feat.id = '3018' OR feat.feature = 'WebSocketStreamConstructor')
            WHERE
              date = '${params.date}'
              AND is_root_page
              ${params.lens.sql}
              ${params.devRankFilter}
            GROUP BY
              client
            ORDER BY
              client,
              num_urls DESC
          `)
      }
    ]
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

class HTTPArchiveReports {
  constructor() {
    this.config = config
    this.lenses = lenses
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
  HTTPArchiveReports
}
