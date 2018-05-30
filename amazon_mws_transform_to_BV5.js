// Load Environment Variables
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
const tz = require('moment-timezone')
const builder = require('xmlbuilder')
const mkdirp = require('mkdirp')
const isEmpty = require('lodash.isempty');
const zipper = require('zip-local');
const CronJob = require('cron').CronJob;

// Business Logic
const fetchOrders = (createdAfter, createdBefore) => {
  return new Promise((resolve, reject) => {
    amazonMws.orders.search({
        'Version': '2013-09-01',
        'Action': 'ListOrders',
        'SellerId': MWS_SELLER_ID,
        'MarketplaceId.Id.1': MWS_MARKETPLACE_ID,
        'CreatedAfter': createdAfter,
        'CreatedBefore': createdBefore
    }, (error, response) => {
      if (error) {
        console.log('error:', error)
        return reject(error)
      }

      // TODO: Handle zero orders
      if (isEmpty(response.Orders.Order)) {
        console.log('no orders')
      }

      // Make sure orders is an array
      const orders = util.isArray(response.Orders.Order)
        ? response.Orders.Order
        : [response.Orders.Order]

      return resolve(orders)
    })
  })
}

const fetchOrderItems = (orders) => {
  return new Promise((resolve, reject) => {
    const orderWithItems = []

    orders.forEach((order) => {
      return amazonMws.orders.search({
          'Version': '2013-09-01',
          'Action': 'ListOrderItems',
          'SellerId': MWS_SELLER_ID,
          'MarketplaceId.Id.1': MWS_MARKETPLACE_ID,
          'AmazonOrderId': order.AmazonOrderId
        }, (error, response) => {
          if (error) {
            console.log('error:', error)
            return reject(error)
          }

          // Make sure OrderItems is an array (Amazon capitalizes properties, stay consistent)
          const OrderItems = util.isArray(response.OrderItems.OrderItem)
            ? response.OrderItems.OrderItem
            : [response.OrderItems.OrderItem]
          orderWithItems.push({...order, OrderItems})

          if (orders.length === orderWithItems.length) {
            return resolve(orderWithItems)
          }
        })
    })
  })
}

const buildXMLFiles = (orders) => {
  console.log('***************************************************************************')
  console.log('Orders Total:', orders.length)
  console.log('***************************************************************************')

  return new Promise((resolve, reject) => {
    try {
      const baseDirectoryPath = './files'
      const archiveDirectoryPath = `${baseDirectoryPath}/${moment().format('MM_DD_YY')}`
      let generatedFiles = 0

      mkdirp(archiveDirectoryPath, (e) => {
        if (e) { throw(e) }

        orders.forEach(order => {
          const fileName = order.AmazonOrderId
          const filePath = `${archiveDirectoryPath}/${fileName}.xml`
          const encoding = 'utf-8'
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
                    '@orderID': order.AmazonOrderId,
                    Total: null,
                    ShipTo: {
                      Address: {
                        '@addressID': '01',
                        '@isoCountryCode': 'US',
                        Name: {
                          '@xmllang': 'en',
                          '#text': order.ShippingAddress.Name || ''
                        },
                        PostalAddress: {
                          '@name': 'default',
                          DeliverTo: order.ShippingAddress.AddressLine1 || '',
                          Street: order.ShippingAddress.AddressLine2 || '', // TODO: Break up if char count is > 30
                          City: order.ShippingAddress.City || '',
                          State: order.ShippingAddress.StateOrRegion || '',
                          PostalCode: order.ShippingAddress.PostalCode || '',
                          Country: {
                            '@isoCountryCode': order.ShippingAddress.CountryCode || ''
                          }
                        }
                      }
                    },
                    Payment: {
                      Extrinsic: {
                        '@name': 'Card Type',
                        '#text': 'X'
                      },
                      PCard: {
                        '@name': 'X',
                        '@expiration': 'XXXX-01-01',
                        '@number': 'X'
                      }
                    },
                    Contact: {
                      Name: {
                        '@xmllang': 'en',
                        '#text': order.BuyerName || ''
                      }
                    },
                    Comments: order.ShippingAddress.Phone || '',
                    Extrinsic: [
                      {
                        '@name': 'Issuing Office',
                        '#text': 'Amazon'
                      },
                      {
                        '@name': 'Requisition Office',
                        '#text': 'Sales Order'
                      },
                      {
                        '@name': 'Accounting and Appropriation'
                      },
                      {
                        '@name': 'Note'
                      }
                    ]
                  },
                  ItemOut: order.OrderItems.map((item, index) => {
                    return {
                      '@lineNumber': `${index + 1}`,
                      '@quantity': item.QuantityOrdered,
                      ItemID: {
                        SupplierPartID: item.SellerSKU
                      },
                      ItemDetail: {
                        UnitPrice: {
                          Money: {
                            '@currency': item.ItemPrice.CurrencyCode,
                            '#text': item.ItemPrice.Amount
                          }
                        },
                        Description: {
                          '@xmllang': 'en',
                          '#text': item.Title
                        },
                        UnitOfMeasure: 'EA',
                        ManufacturerPartID: null,
                        ManufacturerName: null
                      }
                    }
                  })
                }
              }
            }
          }

          const feed = builder.create(template, { encoding })
          const xmlContent = feed.end({ pretty: true })

          fs.writeFile(filePath, xmlContent, encoding, (error) => {
              if (error) { console.log(error) }
              generatedFiles++
              // Should resolve with directory path
              if (orders.length === generatedFiles) { resolve(archiveDirectoryPath) }
          });
        })
      });
    } catch(e){reject(e)}
  })
}

const compressFiles = (directoryPath) => {
  const archiveName = directoryPath.split('/').slice(-1)
  const destinationPath = `${directoryPath}/${archiveName}.zip`

  zipper.sync.zip(directoryPath).compress().save(destinationPath);
}

const init = (start, end) => {
  return fetchOrders(start, end)
    .then(fetchOrderItems)
    .then(buildXMLFiles)
    .catch((e) => console.log(e))
    .then(compressFiles)
    // .then(emailToRecipient)
}

// init()
const start = tz(moment(), 'America/Los_Angeles').subtract(5, 'minutes').subtract(43, 'day').format()
const end   = tz(moment(), 'America/Los_Angeles').subtract(5, 'minutes').subtract(1, 'day').format()

init(start, end)

new CronJob('* * * * * *', function() {
  console.log('You will see this message every second')
  console.log(tz(moment(), 'America/Los_Angeles').format())
}, null, true, 'America/Los_Angeles')

// Two line names,
// TODO: Handle zero orders
// TODO: Do dupe checking
// TODO: Error handling/Reporting
// TODO: Throttling
// Cron should run every four hours, go to louis email
