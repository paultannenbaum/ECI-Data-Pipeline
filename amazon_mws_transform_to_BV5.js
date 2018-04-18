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
const tz = require('moment-timezone')
const builder = require('xmlbuilder')
const mkdirp = require('mkdirp')
const isEmpty = require('lodash.isempty');
const zipper = require('zip-local');

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
        
      console.log('TOTAL ORDERS:', orders.length)  
      
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
  return new Promise((resolve, reject) => {
    try {
      const baseDirectoryPath = './files'
      const archiveDirectoryPath = `${baseDirectoryPath}/${moment().format('MM_DD_YY')}`
      let generatedFiles = 0
      
      mkdirp(archiveDirectoryPath, (e) => {
        if (e) { throw(e) }
        
        orders.forEach(order => {
          const fileName = order.AmazonOrderId
          const filePath = `${archiveDirectoryPath}/${order.AmazonOrderId}.xml`
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
                      ManufacturerName: null
                    }
                  }
                }
              }
            }
          }
          const feed = builder.create(template, { encoding })
          const xmlContent = feed.end({ pretty: true })

          fs.writeFile(archiveDirectoryPath, xmlContent, encoding, (err) => {
              if (e) { throw(e) }
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

const init = () => {
  const today     = tz(moment(), 'America/Los_Angeles').subtract(5, 'minutes')
  const yesterday = tz(moment(), 'America/Los_Angeles').subtract(5, 'minutes').subtract(1, 'day')
  
  return fetchOrders(yesterday.format(), today.format())
    .then(fetchOrderItems)
    .then(buildXMLFiles)
    .then(compressFiles)
    // .then(emailToRecipient)
}

init()

// TODO: Handle zero orders
// TODO: Error handling/Reporting
// TODO: Throttling
