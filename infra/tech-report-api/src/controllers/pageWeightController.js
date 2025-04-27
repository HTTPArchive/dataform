const firestore = require('../utils/db');
const { convertToArray, createSuccessResponse, createErrorResponse } = require('../utils/helpers');

const TABLE = 'page_weight';

/**
 * Get the latest date in the collection
 */
const getLatestDate = async () => {
  const query = firestore.collection(TABLE).orderBy('date', 'desc').limit(1);
  const snapshot = await query.get();
  if (!snapshot.empty) {
    return snapshot.docs[0].data().date;
  }
  return null;
};

/**
 * List Page Weight data with filtering
 */
const listPageWeightData = async (req, res) => {
  try {
    const params = req.query;
    const data = [];

    // Required parameters check
    if (!params.technology) {
      return res.status(400).send(createErrorResponse([
        ['technology', 'missing technology parameter']
      ]));
    }

    // Convert technology parameter to array
    const techArray = convertToArray(params.technology);

    // Handle 'latest' special value for start parameter
    if (params.start && params.start === 'latest') {
      params.start = await getLatestDate();
    }

    // Query for each technology
    for (const technology of techArray) {
      let query = firestore.collection(TABLE);

      // Apply filters
      if (params.start) {
        query = query.where('date', '>=', params.start);
      }

      if (params.end) {
        query = query.where('date', '<=', params.end);
      }

      if (params.geo) {
        query = query.where('geo', '==', params.geo);
      }

      if (params.rank) {
        query = query.where('rank', '==', params.rank);
      }

      // Always filter by technology
      query = query.where('technology', '==', technology);

      // Execute query
      const snapshot = await query.get();
      snapshot.forEach(doc => {
        data.push(doc.data());
      });
    }

    // Send response
    res.status(200).send(createSuccessResponse(data));
  } catch (error) {
    console.error('Error fetching Page Weight data:', error);
    res.status(400).send(createErrorResponse([['query', error.message]]));
  }
};

module.exports = {
  listPageWeightData
};
