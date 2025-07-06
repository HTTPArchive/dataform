# Dataform Service

A unified Cloud Run service that combines the functionality of both dataform-trigger and dataform-export services. This service provides two main endpoints for different operations:

## Endpoints

### `/trigger`

Handles Dataform workflow triggers based on events or polling conditions.

**Example Request:**

```json
{
  "message": {
    "name": "crux_ready"
  }
}
```

### `/export`

Handles BigQuery export job initialization.

**Example Request:**

```json
{
  "calls": [[{
    "destination": "...",
    "config": "...",
    "query": "..."
  }]]
}
```

## Supported Triggers

- `crux_ready`: Polls for Chrome UX Report data availability and triggers processing when conditions are met
- `crawl_complete`: Event-based trigger for when crawl data processing is complete

## Environment Variables

- `PORT`: Port number for the service (default: 8080)

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run start_dev

# Build Docker image
npm run build
```

## Deployment

The service is deployed to Google Cloud Run using Cloud Build:

```bash
gcloud builds submit --config cloudbuild.yaml
```

## Migration from Separate Services

This service replaces the following separate services:

- `dataform-trigger`: Now accessible via `/trigger` endpoint
- `dataform-export`: Now accessible via `/export` endpoint

Update your service calls to use the new endpoint paths when migrating.

```js
// Example usage of the merged dataform-service

// Trigger example
const triggerPayload = {
  message: {
    name: "crux_ready"
  }
}

// Export example
const exportPayload = {
  calls: [[{
    destination: "gs://httparchive-reports/tech-report-2024",
    config: {
      format: "PARQUET",
      compression: "SNAPPY"
    },
    query: "SELECT * FROM httparchive.reports.tech_report_categories WHERE _TABLE_SUFFIX = '2024_01_01'"
  }]]
}

// Usage examples:

// POST to /trigger endpoint
fetch('https://dataform-service-url/trigger', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(triggerPayload)
})

// POST to /export endpoint
fetch('https://dataform-service-url/export', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(exportPayload)
})
```
