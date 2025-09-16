const reservations = require('@masthead-data/dataform-plugin')

const RESERVATION_CONFIG = [
  {
    tag: 'high_slots',
    reservation: 'projects/httparchive/locations/US/reservations/pipeline',
    actions: [
      'httparchive.crawl.pages',
      'httparchive.crawl.requests',
      'httparchive.crawl.parsed_css',
      'httparchive.f1.pages_latest',
      'httparchive.f1.requests_latest'
    ]
  },
  {
    tag: 'low_slots',
    reservation: null,
    actions: []
  },
  {
    tag: 'on_demand',
    reservation: 'none',
    actions: [
    ]
  }
]

const reservation_setter = reservations.createReservationSetter(RESERVATION_CONFIG)

module.exports = {
  reservation_setter
}
