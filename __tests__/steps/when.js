const APP_ROOT = '../../'
const AWS = require('aws-sdk')
const ApiGateway = new AWS.APIGateway()
const aws4 = require('aws4')
const URL = require('url')
const http = require('axios')

const { TEST_MODE } = process.env

const getApiKey = async () => {
  const result = await ApiGateway.getApiKey({
    apiKey: process.env.DefaultApiKeyId,
    includeValue: true
  }).promise()

  return result.value
}

const signHttpRequest = (url, method, headers, body) => {
  const urlData = URL.parse(url)
  const opts = {
    host: urlData.hostname,
    path: urlData.pathname,
    method,
    headers,
    body,
  }

  aws4.sign(opts)
  return opts.headers
}

const viaHttp = async (relPath, method, opts) => {
  const url = `${process.env.ApiUrl}/${relPath}`
  console.info(`invoking via HTTP ${method} ${url}`)
  console.info(`with options ${opts}`)

  try {
    let headers = {}
    const data = opts?.body
    if (data) {
      headers['Content-Type'] = 'application/json'
    }

    if ((opts?.iam_auth || false) === true) {
      headers = signHttpRequest(url, method, headers, data)
    }

    const authHeader = opts?.auth
    if (authHeader) {
      headers.Authorization = authHeader
    }

    if ((opts?.api_key || false) == true) {
      headers['x-api-key'] = await getApiKey()
    }

    const httpReq = http.request({
      method, url, headers, data
    })

    const res = await httpReq
    return {
      statusCode: res.status,
      body: res.data,
      headers: res.headers
    }
  } catch (err) {
    if (err.response?.status) {
      return {
        statusCode: err.response.status,
        headers: err.response.headers
      }
    } else {
      throw err
    }
  }
}

const viaHandler = async (event, functionName) => {
  const handler = require(`${APP_ROOT}/functions/${functionName}`).handler

  const context = {}
  const response = await handler(event, context)
  const headers = response?.headers || {}
  const contentType = headers['content-type'] || 'application/json'
  if (response?.body && contentType === 'application/json') {
    response.body = JSON.parse(response.body)
  }
  return response
}

const we_invoke_add_todo = async (todo, user) => {
  const body = JSON.stringify(todo)
  switch (TEST_MODE) {
    case 'integration':
      return await viaHandler({ body }, 'add-todo')
    case 'e2e':
      const auth = user.idToken
      return await viaHttp('todos', 'POST', { body, auth })

    default:
      throw new Error(`TEST_MODE [${TEST_MODE}] is not supported`)
  }
}

const we_invoke_list_todos = async (count, nextToken, user) => {
  switch (TEST_MODE) {
    case 'integration':
      const queryStringParameters = {
        count: count ? count.toString() : undefined,
        nextToken
      }
      return await viaHandler({ queryStringParameters }, 'list-todos')
    case 'e2e':
      const auth = user.idToken
      let url = 'todos'
      if (count || nextToken) {
        // '' is required here, otherwise, it prints 'undefined'
        url += `?count=${count || ''}&nextToken=${nextToken || ''}`
      }

      return await viaHttp(url, 'GET', { auth })
    default:
      throw new Error(`TEST_MODE [${TEST_MODE}] is not supported`)
  }
}



module.exports = {
  we_invoke_add_todo,
  we_invoke_list_todos
}
