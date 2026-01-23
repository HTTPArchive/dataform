const { autoAssignActions } = require('@masthead-data/dataform-package')

const RESERVATION_CONFIG = [
  {
    tag: 'reservation',
    reservation: 'projects/httparchive/locations/US/reservations/pipeline',
    actions: [
      'httparchive.crawl.pages',
      'httparchive.crawl.requests',
      'httparchive.crawl.parsed_css',
      'httparchive.f1.pages_latest',
      'httparchive.f1.requests_latest'
    ]
  }
]

autoAssignActions(RESERVATION_CONFIG)
