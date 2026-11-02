const { autoAssignActions } = require('@masthead-data/dataform-package')

const RESERVATION_CONFIG = [
  {
    tag: 'on_demand',
    reservation: 'none',
    actions: [
      'httparchive.blink_features.usage',
      'httparchive.reports.html_elements_popularity',
      'httparchive.sample_data.pages_10k',
      'httparchive.wappalyzer.tech_detections'
    ]
  }
]

autoAssignActions(RESERVATION_CONFIG)
