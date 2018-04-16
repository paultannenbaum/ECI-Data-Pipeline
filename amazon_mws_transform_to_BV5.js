// Load Enviroment Variables
require('dotenv').config()

// Env variables
const MWS_ACCESS_KEY_ID = process.env.MWS_ACCESS_KEY_ID
const MWS_SECRET_KEY = process.env.MWS_SECRET_KEY
const MWS_SELLER_ID = process.env.MWS_SELLER_ID
const MWS_MARKETPLACE_ID = process.env.MWS_MARKETPLACE_ID

// Packages
const fs = require('fs');
const util = require('util')
const amazonMws = require('amazon-mws')(MWS_ACCESS_KEY_ID, MWS_SECRET_KEY)
const moment = require('moment')

// Variables
const today = moment().subtract(25, 'day').seconds(0).milliseconds(0).toISOString()
const yesterday = moment().subtract(30, 'day').seconds(0).milliseconds(0).toISOString()

// Functions
const logError = (error) => console.log('error:', error);

const logResponse = (response) => console.log('response', util.inspect(response, false, null));

const fetchYesterdaysOrders = () => amazonMws.orders.search({
    'Version': '2013-09-01',
    'Action': 'ListOrders',
    'SellerId': MWS_SELLER_ID,
    'MarketplaceId.Id.1': MWS_MARKETPLACE_ID,
    'CreatedAfter': yesterday,
    'CreatedBefore': today
})

const fetchOrderItems = (orderId) => amazonMws.orders.search({
    'Version': '2013-09-01',
    'Action': 'ListOrderItems',
    'SellerId': MWS_SELLER_ID,
    'MarketplaceId.Id.1': MWS_MARKETPLACE_ID,
    'AmazonOrderId': orderId
})


const testem = () => fetchYesterdaysOrders().then((response) => {
  console.log(response.Orders.Order.length)

  const orders = response.Orders.Order

  console.log(orders)

  orders.forEach((order) => fetchOrderItems(order.AmazonOrderId).then((result) => {
      console.log(util.inspect(result, false, null))
  }))
}).catch((e) => logResponse(e));

testem()


// TODO: Error handling
// TODO: Throttling
// TODO: Handle non arrays
