import test, { mock } from 'node:test'
import assert from 'node:assert'
import { internals, handleExport } from './index.js'

test('handleExport handles export job error', async () => {
  const req = {
    body: {
      calls: [[{
        destination: 'firestore',
        config: {},
        query: 'SELECT 1'
      }]]
    }
  }

  let statusCode = null
  let responseData = null

  const res = {
    status: (code) => {
      statusCode = code
      return {
        json: (data) => {
          responseData = data
        }
      }
    }
  }

  const expectedError = new Error('Mocked error')
  mock.method(internals, 'callRunJob', async () => {
    throw expectedError
  })

  await handleExport(req, res)

  assert.strictEqual(statusCode, 400)
  assert.deepStrictEqual(responseData.replies, [400])
  assert.strictEqual(responseData.errorMessage, expectedError)

  mock.restoreAll()
})

test('handleExport handles missing payload error', async () => {
  const req = {
    body: {
      calls: [[null]]
    }
  }

  let statusCode = null
  let responseData = null

  const res = {
    status: (code) => {
      statusCode = code
      return {
        json: (data) => {
          responseData = data
        }
      }
    }
  }

  await handleExport(req, res)

  assert.strictEqual(statusCode, 400)
  assert.deepStrictEqual(responseData.replies, [400])
  assert.strictEqual(responseData.errorMessage, 'Bad Request: no payload received, expected JSON object')
})

test('handleExport handles missing required keys error', async () => {
  const req = {
    body: {
      calls: [[{
        destination: 'firestore'
        // missing config and query
      }]]
    }
  }

  let statusCode = null
  let responseData = null

  const res = {
    status: (code) => {
      statusCode = code
      return {
        json: (data) => {
          responseData = data
        }
      }
    }
  }

  await handleExport(req, res)

  assert.strictEqual(statusCode, 400)
  assert.deepStrictEqual(responseData.replies, [400])
  assert.strictEqual(responseData.errorMessage, 'Bad Request: unexpected payload structure, required keys: destination, config, query')
})

test('handleExport handles unknown destination error', async () => {
  const req = {
    body: {
      calls: [[{
        destination: 'unknown',
        config: {},
        query: 'SELECT 1'
      }]]
    }
  }

  let statusCode = null
  let responseData = null

  const res = {
    status: (code) => {
      statusCode = code
      return {
        json: (data) => {
          responseData = data
        }
      }
    }
  }

  await handleExport(req, res)

  assert.strictEqual(statusCode, 400)
  assert.deepStrictEqual(responseData.replies, [400])
  assert.ok(responseData.errorMessage instanceof Error)
  assert.strictEqual(responseData.errorMessage.message, 'Bad Request: destination unknown')
})
