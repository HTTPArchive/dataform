const config = {
  _lens: {
    drupal: {
      name: 'Drupal'
    },
    magento: {
      name: 'Magento'
    },
    wordpress: {
      name: 'WordPress'
    },
    top1k: {
      name: 'Top 1,000'
    },
    top10k: {
      name: 'Top 10,000'
    },
    top100k: {
      name: 'Top 100,000'
    },
    top1m: {
      name: 'Top 1,000,000'
    }
  },
  _metrics: {
    bytesTotal: {
      name: 'Total Kilobytes',
      type: 'KB',
      description: 'The sum of [transfer size](https://www.w3.org/TR/resource-timing-2/#dom-performanceresourcetiming-transfersize) kilobytes of all resources requested by the page.',
      redundant: true,
      wpt: {
        path: 'median$firstView$bytesIn',
        scale: 0.0009765625
      },
      SQL: [{
        type: 'histogram',
        query: `
SELECT
  *,
  SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
FROM (
  SELECT
    *,
    volume / SUM(volume) OVER (PARTITION BY client) AS pdf
  FROM (
    SELECT
      date,
      client,
      CAST(FLOOR(INT64(summary.bytesTotal) / 1024 / 100) * 100 AS INT64) AS bin,
      COUNT(0) AS volume
    FROM httparchive.crawl.pages
    WHERE
      date = '{{date}}'
      {{rankFilter}}
    GROUP BY
      date,
      client,
      bin
    HAVING bin IS NOT NULL
  )
)
`
      },
      {
        type: 'timeseries',
        query: `
SELECT
  date,
  client,
  UNIX_SECONDS(TIMESTAMP(date)) AS timestamp,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(101)] / 1024, 2) AS p10,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(251)] / 1024, 2) AS p25,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(501)] / 1024, 2) AS p50,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(751)] / 1024, 2) AS p75,
  ROUND(APPROX_QUANTILES(bytesTotal, 1001)[OFFSET(901)] / 1024, 2) AS p90
FROM (
  SELECT
    date,
    client,
    INT64(summary.bytesTotal) AS bytesTotal
  FROM httparchive.crawl.pages
  WHERE
    date = '{{date}}' AND
    INT64(summary.bytesTotal) > 0
    {{rankFilter}}
)
GROUP BY
  date,
  client,
  timestamp
`
      }]
    },
    bytesVideo: {
      name: 'Video Bytes',
      type: 'KB',
      description: 'The sum of transfer size kilobytes of all videos requested by the page. A video is identified as a resource with the `mp4`, `swf`, `f4v`, or `flv` file extensions or a MIME type containing `flash`.',
      histogram: {
        minDate: '2015_05_01'
      }
    },
    canonical: {
      name: 'rel=canonical',
      type: '%',
      description: 'The percent of pages with a valid canonical link. Canonical pages are detected by [Lighthouse](https://web.dev/canonical/).',
      downIsBad: true,
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    compileJs: {
      name: 'JS Compile Time',
      type: 'ms',
      description: 'The number of milliseconds spent compiling each JavaScript resource.',
      histogram: {
        minDate: '2017_09_01',
        maxDate: '2018_01_15'
      },
      timeseries: {
        enabled: false
      }
    }
  }
}

module.exports = {
  config
}
