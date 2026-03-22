# HTTP Archive Reports

This document describes the HTTP Archive reports system, which automatically generates standardized reports from HTTP Archive crawl data.

## Overview

The reports system generates Dataform operations that:

1. Calculate metrics from HTTP Archive crawl data
2. Store results in BigQuery tables partitioned by date and clustered by metric/lens/client
3. Export data to Cloud Storage as JSON files for consumption by external systems

## Architecture

### Core Components

- **`includes/reports.js`** - Defines metrics and lenses
- **`definitions/output/reports/reports_dynamic.js`** - Generates Dataform operations
- **`includes/constants.js`** - Provides shared constants and the `DataformTemplateBuilder`

## Supported Features

### SQL Types

The system supports two types of SQL queries:

#### 1. Histogram

- **Purpose**: Distribution analysis with binned data
- **Output**: Contains `bin`, `volume`, `pdf`, `cdf` columns
- **Use case**: Page weight distributions, performance metric distributions
- **Export path**: `reports/{date_folder}/{metric_id}_test.json`
- **⚠️ Do NOT use for**: Boolean/binary metrics (present/not present) - only two states don't create meaningful distributions

#### 2. Timeseries

- **Purpose**: Trend analysis over time
- **Output**: Contains percentile data (p10, p25, p50, p75, p90) with timestamps
- **Use case**: Performance trends, adoption over time, **boolean/adoption metrics**
- **Export path**: `reports/{metric_id}_test.json`

### Quick Decision Guide

| Metric Type                            | Use Timeseries     | Use Histogram       | Use Both  |
| -------------------------------------- | ------------------ | ------------------- | --------- |
| Boolean/Adoption (present/not present) | ✅ Always          | ❌ Never            | ❌        |
| Percentage/Rate                        | ✅ Yes             | ❌ Rarely useful    | ❌        |
| Continuous values (bytes, time, count) | ✅ For percentiles | ✅ For distribution | ✅ Often  |

**Key Rule**: Always use timeseries for boolean/adoption metrics; histogram only for continuous distributions.

### Lenses (Data Filters)

Lenses allow filtering data by different criteria:

- **`all`** - No filter, all pages
- **`top1k`** - Top 1,000 ranked sites
- **`top10k`** - Top 10,000 ranked sites
- **`top100k`** - Top 100,000 ranked sites
- **`top1m`** - Top 1,000,000 ranked sites
- **`drupal`** - Sites using Drupal
- **`magento`** - Sites using Magento
- **`wordpress`** - Sites using WordPress

### Date Range Processing

- Configurable start and end dates
- Processes data month by month using `constants.fnPastMonth()`
- Supports retrospective report generation

## How to Add a New Report

### Step 1: Choose Your Metric Type

Determine which SQL type(s) to use based on your metric:

- **Boolean/Adoption metrics** (e.g., feature presence, file exists): Use timeseries only
- **Continuous metrics** (e.g., page weight, load time): Use both histogram and timeseries
- **Percentages/Rates**: Use timeseries only

### Step 2: Define Your Metric

Add your metric to the `_metrics` object in `includes/reports.js`:

```javascript
const config = {
  _metrics: {
    // Existing metrics...

    myNewMetric: {
      SQL: [
        {
          type: 'histogram', // or 'timeseries'
          query: DataformTemplateBuilder.create((ctx, params) => `
            WITH pages AS (
              SELECT
                date,
                client,
                -- Your binning logic for histogram
                CAST(FLOOR(your_metric_value / bin_size) * bin_size AS INT64) AS bin
              FROM ${ctx.ref('crawl', 'pages')}
              WHERE
                date = '${params.date}'
                ${params.devRankFilter}
                ${params.lens.sql}
                AND is_root_page
                AND your_metric_value > 0
            )

            -- Your aggregation logic here
            SELECT
              *,
              SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
            FROM (
              -- Calculate probability density function
              SELECT
                *,
                volume / SUM(volume) OVER (PARTITION BY client) AS pdf
              FROM (
                SELECT
                  *,
                  COUNT(0) AS volume
                FROM pages
                WHERE bin IS NOT NULL
                GROUP BY date, client, bin
              )
            )
            ORDER BY bin, client
          `)
        }
      ]
    }
  }
}
```

### Step 2: Test Your Metric

The metric will be automatically included in the next run of `reports_dynamic.js`. The system will generate operations for all combinations of:

- Your new metric
- All available lenses
- All SQL types you defined
- The configured date range

### Step 3: Verify Output

Check that the generated operations:

1. Create the expected BigQuery tables
2. Populate data correctly
3. Export to Cloud Storage in the expected format

## Metric SQL Requirements

### Template Parameters

Your SQL template receives these parameters:

```javascript
{
  date: '2025-07-01',           // Current processing date
  devRankFilter: 'AND rank <= 10000', // Development filter
  lens: {
    name: 'top1k',              // Lens name
    sql: 'AND rank <= 1000'     // Lens SQL filter
  },
  metric: { id: 'myMetric', ... }, // Metric configuration
  sql: { type: 'histogram', ... }   // SQL type configuration
}
```

### Required Columns

#### For Histogram Type

- `date` - Processing date
- `client` - 'desktop' or 'mobile'
- `bin` - Numeric bin value
- `volume` - Count of pages in this bin
- `pdf` - Probability density function value
- `cdf` - Cumulative distribution function value

#### For Timeseries Type

- `date` - Processing date
- `client` - 'desktop' or 'mobile'
- `timestamp` - Unix timestamp in milliseconds
- `p10`, `p25`, `p50`, `p75`, `p90` - Percentile values

### Required SQL Patterns

Every metric query **MUST** include these patterns:

```sql
WHERE
  date = '${params.date}'           -- Date filter
  AND is_root_page                  -- Root page filter
  ${params.lens.sql}                -- Lens filtering
  ${params.devRankFilter}           -- Dev environment sampling
-- Use:
${ctx.ref('crawl', 'pages')}        -- Proper table reference
GROUP BY client
ORDER BY client
```

### SQL Pattern Reference

#### Adoption/Percentage Metrics (Timeseries)

```sql
ROUND(SAFE_DIVIDE(
  COUNTIF(condition),
  COUNT(0)
) * 100, 2) AS pct_pages
```

#### Percentile Distributions (Timeseries)

```sql
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(101)] / 1024, 2) AS p10,
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(251)] / 1024, 2) AS p25,
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(501)] / 1024, 2) AS p50,
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(751)] / 1024, 2) AS p75,
ROUND(APPROX_QUANTILES(FLOAT64(metric), 1001)[OFFSET(901)] / 1024, 2) AS p90
-- Important: Add WHERE condition: AND FLOAT64(metric) > 0 for continuous metrics
```

#### Distribution Binning (Histogram)

```sql
-- Innermost subquery:
CAST(FLOOR(FLOAT64(metric) / bin_size) * bin_size AS INT64) AS bin,
COUNT(0) AS volume
-- Wrap with: volume / SUM(volume) OVER (PARTITION BY client) AS pdf
-- Wrap with: SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
```

### Best Practices

1. **Filter root pages**: Always include `AND is_root_page` unless you specifically need all pages
2. **Handle null values**: Use appropriate null checks and filtering
3. **Use consistent binning**: For histograms, use logical bin sizes (e.g., 100KB increments for page weight)
4. **Optimize performance**: Use appropriate WHERE clauses and avoid expensive operations
5. **Test with dev filters**: Your queries should work with the development rank filter
6. **Use safe functions**: `SAFE.BOOL()` for custom metrics, `SAFE_DIVIDE()` for percentages

## Lenses

Lenses SQL are a valid BigQuery WHERE clause conditions that can be appended to the main query.

## Processing Details

### Operation Generation

For each combination of date, metric, SQL type, and lens, the system:

1. **Creates a unique operation name**: `{metricId}_{sqlType}_{date}_{lensName}`
2. **Generates BigQuery SQL** that:
    - Deletes existing data for the date/metric/lens combination
    - Inserts new calculated data
    - Exports results to Cloud Storage
3. **Tags operations** with `crawl_complete` tags to be triggered on crawl completion.

### Table Structure

Reports are stored in BigQuery tables with this structure:

- **Partitioned by**: `date`
- **Clustered by**: `metric`, `lens`, `client`
- **Dataset**: `reports`
- **Naming**: `{metricId}_{sqlType}` (e.g., `bytesTotal_histogram`)

### Export Process

1. Data is calculated and stored in BigQuery
2. A `run_export_job` function exports filtered data to Cloud Storage
3. Export paths follow the pattern:
    - Histogram: `reports/[{lens}/]{date_underscore}/{metric_id}.json`
    - Timeseries: `reports/[{lens}/]{metric_id}.json`

### Development vs Production

- **Development**: Uses `TABLESAMPLE` and rank filters for faster processing
- **Production**: Processes full datasets
- **Environment detection**: Automatic based on `dataform.projectConfig.vars.environment`

## Configuration

### Date Range

Modify the `DATE_RANGE` object in `reports_dynamic.js`:

```javascript
const DATE_RANGE = {
  startDate: '2025-01-01',  // Start processing from this date
  endDate: '2025-07-01'     // Process up to this date
}
```

### Export Configuration

Modify the `EXPORT_CONFIG` object:

```javascript
const EXPORT_CONFIG = {
  bucket: 'your-storage-bucket',
  storagePath: 'reports/',
  dataset: 'reports',
  testSuffix: '.json'
}
```

## Troubleshooting

### Debugging

1. **Check operation logs** in Dataform for SQL errors
2. **Verify table creation** in BigQuery console
3. **Check export logs** in Cloud Run for export errors
4. **Verify Cloud Storage paths** for exported files
5. **Test SQL templates** individually before adding
6. **Use development environment** with smaller datasets for testing

## Examples

### Example 1: Adding an Adoption Metric (Boolean/Presence)

For metrics that track whether a feature/file exists (present or not present), use **timeseries only**:

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

**Key points:**

- Uses `SAFE_DIVIDE()` to avoid division by zero
- Uses `SAFE.BOOL()` for accessing custom_metrics that may not exist
- Returns `pct_pages` as the adoption percentage
- No histogram - boolean metrics don't have meaningful distributions

### Example 2: Adding a Continuous Metric (Histogram + Timeseries)

For metrics with continuous values (bytes, time, count), use both histogram and timeseries:

```javascript
jsBytes: {
  SQL: [
    {
      type: 'histogram',
      query: DataformTemplateBuilder.create((ctx, params) => `
        WITH pages AS (
          SELECT
            date,
            client,
            CAST(FLOOR(FLOAT64(summary.bytesJS) / 1024 / 50) * 50 AS INT64) AS bin
          FROM ${ctx.ref('crawl', 'pages')}
          WHERE
            date = '${params.date}'
            ${params.devRankFilter}
            ${params.lens.sql}
            AND is_root_page
            AND INT64(summary.bytesJS) > 0
        )

        SELECT
          *,
          SUM(pdf) OVER (PARTITION BY client ORDER BY bin) AS cdf
        FROM (
          SELECT
            *,
            volume / SUM(volume) OVER (PARTITION BY client) AS pdf
          FROM (
            SELECT
              *,
              COUNT(0) AS volume
            FROM pages
            WHERE bin IS NOT NULL
            GROUP BY date, client, bin
          )
        )
        ORDER BY bin, client
      `)
    },
    {
      type: 'timeseries',
      query: DataformTemplateBuilder.create((ctx, params) => `
        WITH pages AS (
          SELECT
            date,
            client,
            FLOAT64(summary.bytesJS) AS bytesJS
          FROM ${ctx.ref('crawl', 'pages')}
          WHERE
            date = '${params.date}'
            ${params.devRankFilter}
            ${params.lens.sql}
            AND is_root_page
            AND INT64(summary.bytesJS) > 0
        )

        SELECT
          date,
          client,
          UNIX_DATE(date) * 1000 * 60 * 60 * 24 AS timestamp,
          ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(101)] / 1024, 2) AS p10,
          ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(251)] / 1024, 2) AS p25,
          ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(501)] / 1024, 2) AS p50,
          ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(751)] / 1024, 2) AS p75,
          ROUND(APPROX_QUANTILES(bytesJS, 1001)[OFFSET(901)] / 1024, 2) AS p90
        FROM pages
        GROUP BY date, client, timestamp
        ORDER BY date, client
      `)
    }
  ]
}
```

**Key points:**

- Histogram shows distribution across bins (50KB increments)
- Timeseries shows percentiles over time (p10, p25, p50, p75, p90)
- Both queries filter out zero values: `AND INT64(summary.bytesJS) > 0`
- Uses nested CTEs for clear structure
- Automatically generates reports for JavaScript bundle sizes across all lenses and the configured date range
