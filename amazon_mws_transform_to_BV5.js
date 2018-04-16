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
const builder = require('xmlbuilder');

// Logic
const today = moment().subtract(25, 'day').seconds(0).milliseconds(0).toISOString()

const yesterday = moment().subtract(30, 'day').seconds(0).milliseconds(0).toISOString()

const logError = (error) => console.log('error:', error);

const logResponse = (response) => console.log('response', util.inspect(response, false, null));

const fetchOrders = () => amazonMws.orders.search({
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

const buildXML = (orders) => {
  const template = {
    cXML: {
      '@xmllang': 'en_US',
      '@version': '1.0',
      Header: {
        From: null,
        To: null,
        Sender: {
          UserAgent: 'default'
        }
      },
      Request: {
        OrderRequest: {
          OrderRequestHeader: {
            '@agreementID': '',
            '@type': 'new',
            '@orderID': 1234,
            Total: null,
            ShipTo: {
              Address: {
                '@addressID': 01,
                '@isoCountryCode': 'US',
                Name: {
                  '@xmllang': 'en',
                  '#text': 'var - Address line 1'
                },
                PostalAddress: {
                  '@name': 'default',
                  DeliverTo: 'var - Address line 2',
                  Street: 'var - Address line 3',
                  Street: 'var - Address line 4',
                  City: 'var - City',
                  State: 'CA',
                  PostalCode: 'Postal Code',
                  Country: {
                    '@isoCountryCode': 'US'
                  }
                }
              }
            },
            Payment: null,
            Contact: {
              Name: {
                '@xmllang': 'en',
                '#text': 'Amazon Buyers Name'
              }
            },
            Comments: 'Phone Number: phone number goes here',
            Extrinsic: {
              '@name': 'Issuing Office',
              '#text': 'Amazon'
            },
            Extrinsic: {
              '@name': 'Requisition Office',
              '#text': 'Sales Order'
            },
            Extrinsic: {
              '@name': 'Accounting and Appropriation'
            },
            Extrinsic: {
              '@name': 'Note'
            }
          },
          ItemOut: {
            '@lineNumber': 1,
            '@quantity': 1,
            ItemID: {
              SupplierPartID: 'HEWCF340A'
            },
            ItemDetail: {
              UnitPrice: {
                Money: {
                  '@currency': 'USD',
                  '#text': 'line item sell price'
                }
              },
              Description: {
                '@xmllang': 'en'
              },
              UnitOfMeasure: null,
              ManufacturerPartID: null,
              ManufacturerName
            }
          }
        }
      }
    }
  }

  const feed = builder.create(template, { encoding: 'utf-8' })
  //console.log(feed.end({ pretty: true }))
}

const init = () => fetchOrders().then((ordersData) => {
  const _orders = ordersData.Orders.Order
  let orders = [] // Amazon doesn't give us detailed order info, so we must make individual requests for each order

  _orders.forEach((order) => fetchOrderItems(order.AmazonOrderId).then((orderData) => {
      orders.push(orderData)
      // Once all orders have been recieved, go ahead and create XML
      if (orders.length === _orders.length) { buildXML(orders) }
  })).catch((e) => logResponse(e))
}).catch((e) => logResponse(e))

buildXML()

// TODO: Error handling
// TODO: Throttling
// TODO: Handle non arrays
