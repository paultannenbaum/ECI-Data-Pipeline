// Load Enviroment Variables
require('dotenv').config()

// Env variables
const MWS_ACCESS_KEY_ID = process.env.MWS_ACCESS_KEY_ID
const MWS_SECRET_KEY = process.env.MWS_SECRET_KEY
const MWS_SELLER_ID = process.env.MWS_SELLER_ID
const MWS_MARKETPLACE_ID = process.env.MWS_MARKETPLACE_ID

// Packages
const fs = require('fs');
const xml2js = require('xml2js')
const parser = xml2js.Parser({ explicitArray: false })
const util = require('util')
const amazonMws = require('amazon-mws')(MWS_ACCESS_KEY_ID, MWS_SECRET_KEY)
const moment = require('moment')

const today = moment().subtract(25, 'day').seconds(0).milliseconds(0).toISOString()
const yesterday = moment().subtract(30, 'day').seconds(0).milliseconds(0).toISOString()

console.log(yesterday, today)

amazonMws.orders.search({
    'Version': '2013-09-01',
    'Action': 'ListOrders',
    'SellerId': MWS_SELLER_ID,
    'MarketplaceId.Id.1': MWS_MARKETPLACE_ID,
    'CreatedAfter': yesterday,
    'CreatedBefore': today
}, function (error, response) {
    if (error) {
        console.log('error ', error);
        return;
    }
    console.log('response', util.inspect(response, false, null));
    console.log(response.Orders.Order.length);
});

// const sampleFile = 'sample_amazon_orders.xml'

// fs.readFile(sampleFile, (err, data) => {
//   parser.parseString(data, (err, result) => {
//     console.log(util.inspect(result, false, null))
//   })
// })
