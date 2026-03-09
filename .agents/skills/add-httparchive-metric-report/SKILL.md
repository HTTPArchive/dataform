---
name: add-httparchive-metric-report
description: Add new metrics to HTTPArchive reports config. USE FOR adding performance metrics, adoption/percentage metrics, or custom metric analysis from crawl data. Chooses timeseries vs histogram based on data type.
---

# Adding Metrics to HTTPArchive Reports

## Documentation Reference

See [reports.md](../../../reports.md) for complete architecture, troubleshooting, and configuration details.

## Quick Implementation

Add metrics to `includes/reports.js` in the `config._metrics` object. The system automatically generates reports across all lenses (all, top1k, wordpress, etc.).

## Metric Type Selection

| Type | Use For | Don't Use For |
|------|---------|---------------|
| **Timeseries** | Percentiles, adoption rates, trends, **boolean/presence metrics** | N/A (most versatile) |
| **Histogram** | Continuous value distributions (page weight, load times) | Boolean/binary (only 2 states) |

**Key Rule:** Always use timeseries for boolean/adoption metrics; histogram only for continuous distributions.

## Required SQL Patterns

Every metric MUST include:
- `date = '${params.date}'`
- `AND is_root_page`
- `${params.lens.sql}`
- `${params.devRankFilter}`
- `${ctx.ref('crawl', 'pages')}`
- `GROUP BY client ORDER BY client`

## Quick Patterns

### Timeseries - Adoption/Percentage
```sql
ROUND(SAFE_DIVIDE(COUNTIF(condition), COUNT(0)) * 100, 2) AS pct_pages
```

### Timeseries - Percentiles
```sql
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(101)] / 1024, 2) AS p10,
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(251)] / 1024, 2) AS p25,
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(501)] / 1024, 2) AS p50,
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(751)] / 1024, 2) AS p75,
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(901)] / 1024, 2) AS p90
-- Add: AND FLOAT64(metric) > 0 in WHERE for continuous metrics
```

### Histogram - Distribution Bins
```sql
-- Core binning pattern in innermost subquery:
CAST(FLOOR(FLOAT64(metric) / bin_size) * bin_size AS INT64) AS bin,
COUNT(0) AS volume
-- Wrap with pdf: volume / SUM(volume) OVER (PARTITION BY client)
-- Wrap with cdf: SUM(pdf) OVER (PARTITION BY client ORDER BY bin)
```

## Examples

```javascript
llmsTxtAdoption: {
  SQL: [
    {
      type: 'timeseries',
      query: DataformTemplateBuilder.create((ctx, params) => `
        SELECT
          client,
          ROUND(SAFE_DIVIDE(
            COUNTIF(SAFE.BOOL(custom_metrics.other.llms_txt_validation.valid)),
            COUNT(0)
          ) * 100, 2) AS pct_pages
        FROM ${ctx.ref('crawl', 'pages')}
        WHERE
          date = '${params.date}'
          AND is_root_page
          ${params.lens.sql}
          ${params.devRankFilter}
        GROUP BY client
        ORDER BY client
      `)
    }
  ]
}
```

See [reports.md](../../../reports.md) for complete histogram + timeseries examples.

## Implementation

1. Open `includes/reports.js`, locate `config._metrics` (line ~42)
2. Add metric before closing `}` of `_metrics`
3. Use patterns above for timeseries/histogram structure
4. Include all required SQL patterns
5. Run `get_errors` to verify

## Key Notes

- **Continuous metrics:** Add `AND metric > 0` before percentile calculations
- **Custom metrics:** Use `SAFE.BOOL()` and `SAFE_DIVIDE()` for safety
- **Auto-processing:** Metrics run across all lenses automatically

