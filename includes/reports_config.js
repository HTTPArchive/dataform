const config = {
  _reports: [
    'state-of-the-web',
    'state-of-javascript',
    'state-of-images',
    'loading-speed',
    'progressive-web-apps',
    'accessibility',
    'search-engine-optimization',
    'page-weight',
    'chrome-ux-report',
    'project-fugu',
    'cwv-tech',
    'cwv-tech-new'
  ],
  _featured: [
    'state-of-the-web'
  ],
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
    bootupJs: {
      id: 'bootupJs',
      name: 'JavaScript Boot-up Time',
      type: 'seconds',
      singular: 'second',
      description: 'The amount of CPU time each script consumes per page. This metric comes from [Lighthouse](https://web.dev/bootup-time/).'
    },
    speedIndex: {
      name: 'Speed Index',
      type: 'seconds',
      singular: 'second',
      description: 'How quickly the contents of a page are visibly populated. This metric comes from [WebPageTest](https://github.com/WPO-Foundation/webpagetest-docs/blob/main/src/metrics/SpeedIndex.md) and differs slightly from the [Lighthouse version](https://web.dev/speed-index/) (which was based on this).'
    },
    bytesCss: {
      name: 'CSS Bytes',
      type: 'KB',
      description: 'The sum of transfer size kilobytes of all external stylesheets requested by the page. An external stylesheets is identified as a resource with the `css` file extension or a MIME type containing `css`.',
      wpt: {
        path: 'median$firstView$breakdown$css$bytes',
        scale: 0.0009765625
      }
    },
    bytesFont: {
      name: 'Font Bytes',
      type: 'KB',
      description: 'The sum of transfer size kilobytes of all fonts requested by the page. A font is identified as a resource with the `eot`, `ttf`, `woff`, `woff2`, or `otf` file extensions or a MIME type containing `font`.',
      wpt: {
        path: 'median$firstView$breakdown$font$bytes',
        scale: 0.0009765625
      }
    },
    bytesHtml: {
      name: 'HTML Bytes',
      type: 'KB',
      description: 'The sum of transfer size kilobytes of all HTML documents requested by the page. An HTML document is identified as a resource with the `html` or `html` file extensions or a MIME type containing `html`.',
      wpt: {
        path: 'median$firstView$breakdown$html$bytes',
        scale: 0.0009765625
      }
    },
    bytesImg: {
      name: 'Image Bytes',
      type: 'KB',
      description: 'The sum of transfer size kilobytes of all external images requested by the page. An external image is identified as a resource with the `png`, `gif`, `jpg`, `jpeg`, `webp`, `ico`, or `svg` file extensions or a MIME type containing `image`.',
      wpt: {
        path: 'median$firstView$breakdown$image$bytes',
        scale: 0.0009765625
      }
    },
    bytesJs: {
      name: 'JavaScript Bytes',
      type: 'KB',
      description: 'The sum of transfer size kilobytes of all external scripts requested by the page. An external script is identified as a resource with the `js` or `json` file extensions or a MIME type containing `script` or `json`.',
      wpt: {
        path: 'median$firstView$breakdown$js$bytes',
        scale: 0.0009765625
      }
    },
    bytesOther: {
      name: 'Other Bytes',
      type: 'KB',
      description: 'The sum of transfer size kilobytes of all unidentified resources requested by the page. An unidentified resource is one that does not match a known script, font, image, stylesheet, XML file, video, HTML document, or plaintext file.',
      wpt: {
        path: 'median$firstView$breakdown$other$bytes',
        scale: 0.0009765625
      }
    },
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
    },
    dcl: {
      name: 'DOMContentLoaded',
      type: 'seconds',
      singular: 'second',
      description: 'The number of seconds from the time the navigation started until the initial HTML document has been completely loaded and parsed. See the [DOMContentLoaded event on MDN](https://developer.mozilla.org/en-US/docs/Web/Events/DOMContentLoaded) for more info.',
      histogram: {
        minDate: '2013_08_01'
      },
      wpt: {
        path: 'median$firstView$domContentLoadedEventStart',
        scale: 0.001
      }
    },
    evalJs: {
      name: 'JS Evaluation Time',
      type: 'ms',
      description: 'The number of milliseconds spent evaluating each JavaScript resource.',
      histogram: {
        minDate: '2017_09_01'
      },
      timeseries: {
        enabled: false
      }
    },
    fcp: {
      name: 'First Contentful Paint',
      type: 'seconds',
      singular: 'second',
      description: "The number of seconds from the time the navigation started until the page's primary content appears on the screen.",
      histogram: {
        minDate: '2016_12_15'
      },
      wpt: {
        path: 'median$firstView$firstContentfulPaint',
        scale: 0.001
      }
    },
    hreflang: {
      name: 'hreflang',
      type: '%',
      description: 'The percent of pages with a valid `hreflang` attribute, which allows crawlers to discover alternate translations of the page content. Validity is measured by Lighthouse.',
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
    fontDisplay: {
      name: 'Font Display',
      type: '%',
      description: 'The percent of pages that avoid the flash of invisible text (FOIT) during web font loading by using the `font-display` CSS property. This metric is measured by [Lighthouse](https://web.dev/font-display/).',
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
    legible: {
      name: 'Legible Text',
      type: '%',
      description: 'The percent of pages with legible text. Legibility is measured by [Lighthouse](https://web.dev/font-size/).',
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
    linkText: {
      name: 'Descriptive Link Text',
      type: '%',
      description: 'The percent of pages with descriptive link text. Descriptiveness is measured by [Lighthouse](https://web.dev/link-text/).',
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
    ol: {
      name: 'onLoad',
      type: 'seconds',
      singular: 'second',
      description: 'The number of seconds from the time the navigation started until the document and all of its dependent resources have finished loading. See the [load event on MDN](https://developer.mozilla.org/en-US/docs/Web/Events/load) for more info.',
      wpt: {
        path: 'median$firstView$loadTime',
        scale: 0.001
      }
    },
    numUrls: {
      name: 'Sample Size',
      type: 'URLs',
      singular: 'URL',
      description: 'The number of URLs analyzed in this report.',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'urls'
        ]
      }
    },
    pctHttps: {
      name: 'HTTPS Requests',
      type: '%',
      description: 'The percent of all requests in the crawl whose URLs are prefixed with `https`.',
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
    tcp: {
      name: 'TCP Connections Per Page',
      type: '',
      singular: '',
      description: 'The number of TCP connections per page.',
      histogram: {
        minDate: '2014_05_15'
      },
      wpt: {
        path: 'median$firstView$connections'
      }
    },
    h2: {
      name: 'HTTP/2 Requests',
      type: '%',
      description: 'The percent of all requests in the crawl using HTTP/2. Note that servers supporting HTTP/2 and HTTP/3 may use HTTP/2 initially due to the way the HTTP Archive starts with a fresh Chrome instance each time, but may use HTTP/3 on subsequent requests.',
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
    h3: {
      name: 'HTTP/3 Support',
      type: '%',
      description: 'The percent of all requests in the crawl which support HTTP/3. Note that, due to the way the HTTP Archive starts with a fresh Chrome instance each time, HTTP/3 will often not be used for initial connections until the browser is aware the server supports HTTP/3, which is why we measure support, rather than actual usage like we do for HTTP/2.',
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
    ttci: {
      name: 'Time to Interactive',
      type: 'seconds',
      singular: 'second',
      description: 'The number of seconds from the time the navigation started until the CPU had at least 5 seconds of quiescence. This metric comes from [Lighthouse](https://web.dev/interactive/). [Read more about First Interactive and First Consistently Interactive](https://docs.google.com/document/d/1GGiI9-7KeY3TPqS3YT271upUVimo-XiL5mwWorDUD4c/edit#heading=h.iqlwzaf6lqrh).',
      histogram: {
        minDate: '2017_06_01'
      }
    },
    reqCss: {
      name: 'CSS Requests',
      type: 'Requests',
      singular: 'Request',
      description: 'The number of external stylesheets requested by the page. An external stylesheets is identified as a resource with the `css` file extension or a MIME type containing `css`.',
      redundant: true,
      wpt: {
        path: 'median$firstView$breakdown$css$requests',
        scale: 0.0009765625
      }
    },
    offscreenImages: {
      name: 'Offscreen Image Savings',
      type: 'KB',
      description: 'The number of kilobytes that could be saved per page by lazy-loading offscreen and hidden images. This metric comes from [Lighthouse](https://web.dev/offscreen-images/).'
    },
    optimizedImages: {
      name: 'Optimized Image Savings',
      type: 'KB',
      description: 'The number of kilobytes that could be saved per page by setting JPEG compression levels to 85 or lower. This metric comes from [Lighthouse](https://web.dev/uses-optimized-images/).'
    },
    imgLazy: {
      name: 'Native Image Lazy Loading',
      type: '%',
      description: 'The percent of pages that have the `loading=lazy` attribute on `img` elements.',
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
    reqFont: {
      name: 'Font Requests',
      type: 'Requests',
      singular: 'Request',
      description: 'The number of fonts requested by the page. A font is identified as a resource with the `eot`, `ttf`, `woff`, `woff2`, or `otf` file extensions or a MIME type containing `font`.',
      redundant: true,
      wpt: {
        path: 'median$firstView$breakdown$font$requests',
        scale: 0.0009765625
      }
    },
    reqHtml: {
      name: 'HTML Requests',
      type: 'Requests',
      singular: 'Request',
      description: 'The number of HTML documents requested by the page. An HTML document is identified as a resource with the `html` or `html` file extensions or a MIME type containing `html`.',
      redundant: true,
      wpt: {
        path: 'median$firstView$breakdown$html$requests',
        scale: 0.0009765625
      }
    },
    reqImg: {
      name: 'Image Requests',
      type: 'Requests',
      singular: 'Request',
      description: 'The number of external images requested by the page. An external image is identified as a resource with the `png`, `gif`, `jpg`, `jpeg`, `webp`, `ico`, or `svg` file extensions or a MIME type containing `image`.',
      redundant: true,
      wpt: {
        path: 'median$firstView$breakdown$image$requests',
        scale: 0.0009765625
      }
    },
    reqJs: {
      name: 'JavaScript Requests',
      type: 'Requests',
      singular: 'Request',
      description: 'The number of external scripts requested by the page. An external script is identified as a resource with the `js` or `json` file extensions or a MIME type containing `script` or `json`.',
      redundant: true,
      wpt: {
        path: 'median$firstView$breakdown$js$requests',
        scale: 0.0009765625
      }
    },
    reqOther: {
      name: 'Other Requests',
      type: 'Requests',
      singular: 'Request',
      description: 'The number of all unidentified resources requested by the page. An unidentified resource is one that does not match a known script, font, image, stylesheet, XML file, video, HTML document, or plaintext file.',
      redundant: true,
      wpt: {
        path: 'median$firstView$breakdown$other$requests',
        scale: 0.0009765625
      }
    },
    reqTotal: {
      name: 'Total Requests',
      type: 'Requests',
      singular: 'Request',
      description: 'The number of resources requested by the page.',
      redundant: true,
      wpt: {
        path: 'median$firstView$requests$length'
      }
    },
    reqVideo: {
      name: 'Video Requests',
      type: 'Requests',
      singular: 'Request',
      description: 'The number of videos requested by the page. A video is identified as a resource with the `mp4`, `swf`, `f4v`, or `flv` file extensions or a MIME type containing `flash`.',
      redundant: true,
      histogram: {
        minDate: '2015_05_01'
      }
    },
    cruxFp: {
      name: 'First Paint',
      type: 'seconds',
      singular: 'second',
      description: 'The number of seconds from the time the navigation started until the browser first renders. See the [Paint Timing API](https://w3c.github.io/paint-timing/#first-paint) for more info.',
      timeseries: {
        enabled: false
      },
      wpt: {
        path: 'median$firstView$firstPaint',
        scale: 0.001
      }
    },
    cruxLcp: {
      name: 'Largest Contentful Paint',
      type: 'seconds',
      singular: 'second',
      description: 'The number of seconds from the time the navigation started until the browser first renders the largest image or text block visible within the viewport. See the [LargestContentfulPaint API](https://wicg.github.io/largest-contentful-paint/) for more info.',
      timeseries: {
        enabled: false
      },
      wpt: {
        path: 'median$firstView$largestContentfulPaint',
        scale: 0.001
      }
    },
    cruxCls: {
      name: 'Cumulative Layout Shift',
      type: '',
      singular: '',
      description: 'The layout shift scores for every unexpected layout shift that occurs during the entire lifespan of the page. See the [Cumulative Layout Shift (CLS)](https://web.dev/articles/cls) for more info.',
      timeseries: {
        enabled: false
      },
      wpt: {
        path: 'median$firstView$cumulativeLayoutshift',
        scale: 1
      }
    },
    cruxFcp: {
      name: 'First Contentful Paint',
      type: 'seconds',
      singular: 'second',
      description: 'The number of seconds from the time the navigation started until the browser first renders. See the [Paint Timing API](https://w3c.github.io/paint-timing/#first-paint) for more info.',
      timeseries: {
        enabled: false
      },
      wpt: {
        path: 'median$firstView$firstContentfulPaint',
        scale: 0.001
      }
    },
    cruxDcl: {
      name: 'DOMContentLoaded',
      type: 'seconds',
      singular: 'second',
      description: 'The number of seconds from the time the navigation started until the browser first renders any text or graphics.',
      timeseries: {
        enabled: false
      },
      wpt: {
        path: 'median$firstView$domContentLoadedEventStart',
        scale: 0.001
      }
    },
    cruxOl: {
      name: 'Onload',
      type: 'seconds',
      singular: 'second',
      description: 'The number of seconds from the time the navigation started until the document and all of its dependent resources have finished loading.',
      timeseries: {
        enabled: false
      },
      wpt: {
        path: 'median$firstView$loadTime',
        scale: 0.001
      }
    },
    cruxInp: {
      name: 'Interaction to Next Paint',
      type: 'ms',
      description: 'The number of milliseconds from the time the user initiates an interaction to the time the page responds. See [Interaction to Next Paint (INP)](https://web.dev/articles/inp).',
      timeseries: {
        enabled: false
      },
      histogram: {
        minDate: '2022_04_01'
      }
    },
    cruxTtfb: {
      name: 'Time to First Byte',
      type: 'ms',
      description: 'The number of milliseconds from the time the user initiates a navigation until the first bytes are received. See [Time to First Byte (TTFB)](https://web.dev/articles/ttfb).',
      timeseries: {
        enabled: false
      },
      histogram: {
        minDate: '2019_07_01'
      }
    },
    cruxPassesCWV: {
      name: 'Passes Core Web Vitals',
      type: '%',
      description: "The percentage of origins passing all three [Core Web Vitals](https://web.dev/articles/vitals#core-web-vitals) (LCP, INP, CLS) with a \"good\" experience. Note that if an origin is missing INP data, it's assessed based on the performance of the remaining metrics. Also note that prior to March 2024, this metric used FID instead of INP.",
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
    cruxFastFcp: {
      name: 'Good First Contentful Paint',
      type: '%',
      description: 'The percentage of origins with "good" FCP experiences, less than or equal to 1.8 seconds.',
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
    cruxFastFp: {
      name: 'Good First Paint',
      type: '%',
      description: 'The percentage of origins with "good" FP experiences, less than or equal to 1 second.',
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
    cruxFastDcl: {
      name: 'Good DOM Content Loaded',
      type: '%',
      description: 'The percentage of origins with "good" DCL experiences, less than or equal to 1 second.',
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
    cruxFastOl: {
      name: 'Good Onload',
      type: '%',
      description: 'The percentage of origins with "good" OL experiences, less than or equal to 1 second.',
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
    cruxFastInp: {
      name: 'Good Interaction to Next Paint',
      type: '%',
      description: 'The percentage of origins with "good" INP experiences, less than or equal to 200 ms. See [Interaction to Next Paint (INP)](https://web.dev/articles/inp).',
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
    cruxFastLcp: {
      name: 'Good Largest Contentful Paint',
      type: '%',
      description: 'The percentage of origins with "good" LCP experiences, less than or equal to 2.5 seconds.',
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
    cruxFastTtfb: {
      name: 'Good Time to First Byte',
      type: '%',
      description: 'The percentage of origins with "good" TTFB experiences, less than or equal to 800ms. See [Time to First Byte (TTFB)](https://web.dev/articles/ttfb).',
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
    cruxLargeCls: {
      name: 'Poor Cumulative Layout Shift',
      type: '%',
      description: 'The percentage of origins with "poor" CLS experiences, greater than 0.25.',
      downIsBad: false,
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    cruxSlowFcp: {
      name: 'Poor First Contentful Paint',
      type: '%',
      description: 'The percentage of origins with "poor" FCP experiences, greater than 3 seconds.',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    cruxSlowInp: {
      name: 'Poor Interaction to Next Paint',
      type: '%',
      description: 'The percentage of origins with "poor" INP experiences, greater than 500 ms. See [Interaction to Next Paint (INP)](https://web.dev/articles/inp).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    cruxSlowLcp: {
      name: 'Poor Largest Contentful Paint',
      type: '%',
      description: 'The percentage of origins with "poor" LCP experiences, greater than 4.0 seconds.',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    cruxSlowTtfb: {
      name: 'Poor Time to First Byte',
      type: '%',
      description: 'The percentage of origins with "poor" TTFB experiences, greater than 1800ms. See [Time to First Byte (TTFB)](https://web.dev/articles/ttfb).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    cruxSmallCls: {
      name: 'Good Cumulative Layout Shift',
      type: '%',
      description: 'The percentage of origins with "good" CLS experiences, less and or equal to 0.1.',
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
    pwaScores: {
      name: 'PWA Scores',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the median [PWA score](https://developers.google.com/web/tools/lighthouse/v3/scoring#pwa) in [Lighthouse](https://developers.google.com/web/tools/lighthouse/). Lighthouse is popular automated tool for improving the quality of web pages.',
      histogram: {
        enabled: false
      }
    },
    swControlledPages: {
      name: 'Service Worker Controlled Pages',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that have triggered the ```ServiceWorkerControlledPage``` [use counter](https://source.chromium.org/chromium/chromium/src/+/master:third_party/blink/public/mojom/web_feature/web_feature.mojom) that fires whenever a page is controlled by a service worker.',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    a11yScores: {
      name: 'Accessibility Scores',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the distribution of [Accessibility category scores in Lighthouse](https://web.dev/accessibility-scoring/).',
      histogram: {
        enabled: false
      }
    },
    a11yButtonName: {
      name: 'Button Name',
      type: '%',
      downIsBad: true,
      description: 'The percent of pages that pass the [Lighthouse audit](https://web.dev/button-name/) that checks if buttons have an accessible name.',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    a11yColorContrast: {
      name: 'Color Contrast',
      type: '%',
      downIsBad: true,
      description: 'The percent of pages that pass the [Lighthouse color-contrast audit](https://web.dev/color-contrast/) that checks if pages background and foreground colors do not have a sufficient contrast ratio.',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    a11yImageAlt: {
      name: 'Image Alt',
      type: '%',
      downIsBad: true,
      description: 'The percent of pages that pass the [Lighthouse image-alt audit](https://web.dev/image-alt/) that checks if all images have alternate text.',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    a11yLabel: {
      name: 'Label',
      type: '%',
      downIsBad: true,
      description: 'The percent of pages that pass the [Lighthouse label audit](https://web.dev/label/) that checks if all form elements have associated labels.',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    a11yLinkName: {
      name: 'Link Name',
      type: '%',
      downIsBad: true,
      description: 'The percent of pages that pass the [Lighthouse link-name audit](https://web.dev/link-name/) that checks if all links have discernable text.',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    asyncClipboardRead: {
      name: 'Async Clipboard Read',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that *read* data from the system clipboard via the [Async Clipboard API](https://web.dev/image-support-for-async-clipboard/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    badgeSet: {
      name: 'Badge Set',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that *set* a badge via the [Badging API](https://web.dev/badging-api/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    badgeClear: {
      name: 'Badge Clear',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that *clear* a badge via the [Badging API](https://web.dev/badging-api/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    getInstalledRelatedApps: {
      name: 'Get Installed Related Apps',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that get the installed related apps via the [Get Installed Related Apps API](https://web.dev/get-installed-related-apps/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    periodicBackgroundSync: {
      name: 'Periodic Background Sync',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that observe a `periodicsync` event that was registered via the [Periodic Background Sync API](https://web.dev/periodic-background-sync/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    periodicBackgroundSyncRegister: {
      name: 'Periodic Background Sync Register',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that register a `periodicsync` event via the [Periodic Background Sync API](https://web.dev/periodic-background-sync/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    storageEstimate: {
      name: 'Storage Estimation',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that estimate available storage via the [Storage API](https://web.dev/persistent-storage/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    storagePersist: {
      name: 'Persistent Storage',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that ask for their data to be stored in persisted storage via the [Storage API](https://web.dev/persistent-storage/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    notificationTriggers: {
      name: 'Notification Triggers',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that use scheduled notifications via the [Notification Triggers API](https://web.dev/notification-triggers/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    screenWakeLock: {
      name: 'Screen Wake Lock',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that acquire a screen wake lock via the [Screen Wake Lock API](https://web.dev/wakelock/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    contentIndex: {
      name: 'Content Indexing',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that add content to the content index via the [Content Indexing API](https://web.dev/content-indexing-api/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    quicTransport: {
      name: 'QuicTransport',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that add transmit messages via the [QuicTransport API](https://web.dev/quictransport/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    },
    idleDetection: {
      name: 'Idle Detection',
      type: '%',
      downIsBad: true,
      description: 'This metric tracks the percentage of pages that detect when the user is idle via the [Idle Detection API](https://web.dev/idle-detection/).',
      histogram: {
        enabled: false
      },
      timeseries: {
        fields: [
          'percent'
        ]
      }
    }
  },
  'state-of-images': {
    name: 'State of Images',
    summary: 'Images are the most popular resource type on the web. In this report we analyze how images are being used across the web.',
    metrics: [
      'bytesImg',
      'reqImg',
      'offscreenImages',
      'optimizedImages',
      'imgLazy'
    ],
    graphic: {
      bgcolor: '#97b5b9',
      primary: {
        color: '#eee',
        icon: 'fa-file-image',
        width: 'fa-w-12'
      }
    }
  },
  'state-of-javascript': {
    name: 'State of JavaScript',
    summary: 'JavaScript powers the modern web, enabling rich and interactive web applications. In this report we dive into how JavaScript is used on the web, and its adoption and trends both for mobile and desktop experiences.',
    image: '/static/img/reports/state-of-javascript-report.png',
    metrics: [
      'bytesJs',
      'reqJs',
      'evalJs',
      'compileJs',
      'bootupJs'
    ],
    graphic: {
      bgcolor: '#f7df1e',
      primary: {
        text: 'JS',
        color: '#444'
      },
      secondary: {
        text: ')};'
      }
    }
  },
  'loading-speed': {
    name: 'Loading Speed',
    summary: 'Web performance can directly impact business metrics like conversion and user happiness. This report analyzes various performance metrics in the lifecycle of a loading page including those used by many modern progressive web apps.',
    image: '/static/img/reports/loading-speed-report.png',
    metrics: [
      'fcp',
      'ttci',
      'dcl',
      'ol',
      'bootupJs',
      'speedIndex'
    ],
    graphic: {
      bgcolor: '#97b5b9',
      primary: {
        color: '#eee',
        icon: 'fa-stopwatch',
        width: 'fa-w-14'
      }
    }
  },
  'state-of-the-web': {
    name: 'State of the Web',
    summary: 'This report captures a long view of the web, including the adoption of techniques for efficient network utilization and usage of web standards like HTTPS.',
    image: '/static/img/reports/state-of-the-web-report.png',
    metrics: [
      'numUrls',
      'bytesTotal',
      'reqTotal',
      'pctHttps',
      'tcp',
      'h2',
      'h3',
      'fontDisplay'
    ],
    graphic: {
      bgcolor: '#97b5b9',
      primary: {
        color: '#eee',
        icon: 'fa-connectdevelop',
        width: 'fa-w-18'
      }
    }
  },
  'search-engine-optimization': {
    name: 'SEO',
    summary: 'How websites are built can affect their ranking in search results. This report tracks the adoption of several key Search Engine Optimization (SEO) techniques.',
    image: '/static/img/reports/search-engine-optimization-report.png',
    metrics: [
      'canonical',
      'hreflang',
      'legible',
      'linkText'
    ],
    graphic: {
      bgcolor: '#97b5b9',
      primary: {
        color: '#eee',
        icon: 'fa-searchengin',
        width: 'fa-w-15'
      },
      secondary: {
        color: 'rgba(255, 255, 255, 0.3)',
        text: 'SEO'
      }
    }
  },
  'page-weight': {
    name: 'Page Weight',
    summary: 'This report tracks the size and quantity of many popular web page resources. Sizes represent the number of bytes sent over the network, which may be compressed.',
    image: '/static/img/reports/page-weight-report.png',
    metrics: [
      'bytesTotal',
      'reqTotal',
      'bytesCss',
      'reqCss',
      'bytesFont',
      'reqFont',
      'bytesHtml',
      'reqHtml',
      'bytesImg',
      'reqImg',
      'bytesJs',
      'reqJs',
      'bytesOther',
      'reqOther',
      'bytesVideo',
      'reqVideo'
    ],
    graphic: {
      bgcolor: '#97b5b9',
      primary: {
        color: '#eee',
        icon: 'fa-weight',
        width: 'fa-w-16'
      }
    }
  },
  'chrome-ux-report': {
    name: 'CrUX',
    summary: 'Loading and interactivity performance as experienced by real-world Chrome users across a diverse set of hardware and network conditions, powered by the [Chrome User Experience Report](https://developers.google.com/web/tools/chrome-user-experience-report/).',
    image: '/static/img/reports/chrome-user-experience-report.png',
    metrics: [
      'cruxPassesCWV',
      'cruxFastFcp',
      'cruxSlowFcp',
      'cruxFastLcp',
      'cruxSlowLcp',
      'cruxSmallCls',
      'cruxLargeCls',
      'cruxFastInp',
      'cruxSlowInp',
      'cruxFastTtfb',
      'cruxSlowTtfb',
      'cruxFastFp',
      'cruxFastDcl',
      'cruxFastOl',
      'cruxFcp',
      'cruxLcp',
      'cruxCls',
      'cruxInp',
      'cruxTtfb',
      'cruxFp',
      'cruxDcl',
      'cruxOl'
    ],
    minDate: '2017_10_01',
    datePattern: '.*_01$',
    maxDateMetric: 'cruxFcp',
    graphic: {
      bgcolor: '#97b5b9',
      primary: {
        color: '#eee',
        icon: 'fa-users',
        width: 'fa-w-20'
      },
      secondary: {
        color: 'rgba(255, 255, 255, 0.3)',
        icon: 'fa-stopwatch',
        width: 'fa-w-14'
      }
    }
  },
  'progressive-web-apps': {
    name: 'Progressive Web Apps',
    summary: 'This report examines the state of [Progressive Web Apps (PWAs)](https://developers.google.com/web/progressive-web-apps/). PWAs are a new class of web applications, enabled by the [Service Worker APIs](https://developer.mozilla.org/en/docs/Web/API/Service_Worker_API). Service workers allow apps to support network-independent loading, to receive push notifications as well as to synchronize data in the background, and — together with [Web App Manifests](https://developer.mozilla.org/en-US/docs/Web/Manifest) — allow users to install PWAs.',
    image: '/static/img/reports/progressive-web-apps-report.png',
    metrics: [
      'pwaScores',
      'swControlledPages'
    ],
    graphic: {
      bgcolor: '#97b5b9',
      primary: {
        text: 'PWA',
        color: '#eee'
      },
      secondary: {
        color: 'rgba(255, 255, 255, 0.3)',
        icon: 'fa-cogs',
        width: 'fa-w-20'
      }
    }
  },
  accessibility: {
    name: 'Accessibility',
    summary: 'This report tracks accessibility of pages as measured by [Lighthouse](https://web.dev/lighthouse-accessibility/).',
    image: '/static/img/reports/accessibility-report.png',
    metrics: [
      'a11yScores',
      'a11yButtonName',
      'a11yColorContrast',
      'a11yImageAlt',
      'a11yLabel',
      'a11yLinkName'
    ],
    graphic: {
      bgcolor: '#97b5b9',
      primary: {
        color: '#eee',
        icon: 'fa-users',
        width: 'fa-w-20'
      },
      secondary: {
        color: 'rgba(255, 255, 255, 0.3)',
        text: 'A11Y'
      }
    }
  },
  'project-fugu': {
    name: 'Capabilities',
    summary: 'The [Capabilities Project](https://web.dev/fugu-status/) (aka. Project Fugu&nbsp;🐡) is a cross-company effort at Google to make it possible for web apps to do anything native apps can, by exposing the capabilities of the operating system platform to the web platform, while maintaining user security, privacy, trust, and other core tenets of the web.',
    image: '/static/img/reports/capabilities-report.png',
    metrics: [
      'asyncClipboardRead',
      'badgeSet',
      'badgeClear',
      'getInstalledRelatedApps',
      'periodicBackgroundSyncRegister',
      'periodicBackgroundSync',
      'storageEstimate',
      'storagePersist',
      'screenWakeLock',
      'contentIndex',
      'notificationTriggers',
      'quicTransport',
      'idleDetection'
    ],
    graphic: {
      bgcolor: '#97b5b9',
      primary: {
        color: '#eee',
        text: '🐡'
      },
      secondary: {
        color: 'rgba(255, 255, 255, 0.3)',
        text: 'Fugu'
      }
    }
  },
  'cwv-tech': {
    name: 'Core Web Vitals Technology Report',
    summary: 'The Core Web Vitals Technology Report is a dashboard combining the powers of real-user experiences in the [Chrome User Experience Report (CrUX)](https://developers.google.com/web/tools/chrome-user-experience-report/) dataset with web technology detections available in HTTP Archive, to allow analysis of the way websites are both built and experienced.',
    url: 'https://datastudio.google.com/u/0/reporting/55bc8fad-44c2-4280-aa0b-5f3f0cd3d2be/page/M6ZPC',
    metrics: [],
    graphic: {
      bgcolor: '#fff',
      primary: {
        color: '#444',
        icon: 'fa-wrench',
        width: 'fa-w-16'
      },
      secondary: {
        color: 'rgba(0, 0, 0, 0.3)',
        icon: 'fa-tachometer-alt',
        width: 'fa-w-18'
      }
    }
  },
  'cwv-tech-new': {
    name: 'BETA: Core Web Vitals Technology Report',
    summary: 'The Core Web Vitals Technology Report is a dashboard combining the powers of real-user experiences in the [Chrome User Experience Report (CrUX)](https://developers.google.com/web/tools/chrome-user-experience-report/) dataset with web technology detections available in HTTP Archive, to allow analysis of the way websites are both built and experienced.',
    url: '/reports/techreport/landing',
    metrics: [],
    graphic: {
      bgcolor: '#fff',
      primary: {
        color: '#444',
        icon: 'fas fa-wrench'
      },
      secondary: {
        color: 'rgba(0, 0, 0, 0.3)',
        icon: 'fas fa-tachometer-alt'
      }
    }
  }
}

module.exports = {
  config
}