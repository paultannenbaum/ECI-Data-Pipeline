// TODO: Automate deploys
// TODO: Handle name/addresses where character count > 30
// TODO: Handle Throttling
// TODO: Remove xml files after zip is created

// Load Environment Variables
require('dotenv').config()

// Env variables
const MWS_ACCESS_KEY_ID = process.env.MWS_ACCESS_KEY_ID
const MWS_SECRET_KEY = process.env.MWS_SECRET_KEY
const MWS_SELLER_ID = process.env.MWS_SELLER_ID
const MWS_MARKETPLACE_ID = process.env.MWS_MARKETPLACE_ID
const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN
const NCI_RECIPIENT_EMAIL = process.env.NCI_RECIPIENT_EMAIL
const APP_ADMIN_EMAIL = process.env.APP_ADMIN_EMAIL

// Packages
const fs = require('fs')
const util = require('util')
const amazonMws = require('amazon-mws')(MWS_ACCESS_KEY_ID, MWS_SECRET_KEY)
const moment = require('moment')
const tz = require('moment-timezone')
const builder = require('xmlbuilder')
const mkdirp = require('mkdirp')
const isEmpty = require('lodash.isempty')
const zipper = require('zip-local')
const cronJob = require('cron').CronJob
const mailgun = require('mailgun-js')({ apiKey: MAILGUN_API_KEY, domain: MAILGUN_DOMAIN })

// Business Logic
const orderRangeStart      = tz(moment(), 'America/Los_Angeles').subtract(5, 'minutes').subtract(4, 'hours')
const orderRangeEnd        = tz(moment(), 'America/Los_Angeles').subtract(5, 'minutes')
const orderRangeStartISO   = orderRangeStart.format()
const orderRangeEndISO     = orderRangeEnd.format()
const orderRangeStartHuman = orderRangeStart.format('MM_DD_YY_HH:mm')
const orderRangeEndHuman   = orderRangeEnd.format('MM_DD_YY_HH:mm')

const sendErrorReportToAppAdmin = (errorType, error) => {
  const data = {
    from: `Error Reporter <noreply@${MAILGUN_DOMAIN}>`,
    to: APP_ADMIN_EMAIL,
    subject: `NCI APP ERROR: ${errorType}`,
    text: `
      Orders created after: ${orderRangeStartHuman}
      Orders created before: ${orderRangeEndHuman}
      Error Details: ${util.inspect(error, false, null)}
    `
  }

  return mailgun.messages().send(data)
}

const sendNoNewOrdersToRecipient = () => {
  const data = {
    from: `Automated Report <noreply@${MAILGUN_DOMAIN}>`,
    to: NCI_RECIPIENT_EMAIL,
    subject: `No orders: ${orderRangeStartHuman} - ${orderRangeEndHuman}`,
    text: `There have been no newly created orders in Amazon from ${orderRangeStartHuman} to ${orderRangeEndHuman}.`
  }

  return mailgun.messages().send(data, function (error) {
    if (error) {
      sendErrorReportToAppAdmin('Failed email delivery', error)
      return Promise.reject('RESOLVED ERROR')
    }
  })
}

const handleError = (error) => {
  if (error !== 'RESOLVED ERROR') {
    sendErrorReportToAppAdmin('Unhandled Error', error)
  } else {
    console.log('error handled')
  }
}

const fetchOrders = () => {
  return new Promise((resolve, reject) => {
    amazonMws.orders.search({
        'Version': '2013-09-01',
        'Action': 'ListOrders',
        'SellerId': MWS_SELLER_ID,
        'MarketplaceId.Id.1': MWS_MARKETPLACE_ID,
        'CreatedAfter': orderRangeStartISO,
        'CreatedBefore': orderRangeEndISO
    }, (error, response) => {
      if (error) {
        sendErrorReportToAppAdmin('Failed to MWS GET Orders request', error)
        return reject('RESOLVED ERROR')
      }

      // No new orders received
      if (isEmpty(response.Orders.Order)) {
        sendNoNewOrdersToRecipient()
        return reject('RESOLVED ERROR')
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
  console.log('***************************************************************************')
  console.log('Orders Created After:', orderRangeStartHuman)
  console.log('Orders Created Before:', orderRangeEndHuman)
  console.log('***************************************************************************')

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
            sendErrorReportToAppAdmin('Failed to MWS GET OrderItems request', error)
            return reject('RESOLVED ERROR')
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
      const archiveDirName = `${orderRangeStartHuman}__${orderRangeEndHuman}`
      const archiveDirPath = `${baseDirectoryPath}/${archiveDirName}`
      let generatedFiles = 0

      mkdirp(archiveDirPath, (error) => {
        if (error) {
          sendErrorReportToAppAdmin('Failed to make archive directory', error)
          return reject('RESOLVED ERROR')
        }

        orders.forEach(order => {
          const fileName = order.AmazonOrderId
          const filePath = `${archiveDirPath}/${fileName}.xml`
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
                          Street: order.ShippingAddress.AddressLine2 || '',
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
              if (error) {
                sendErrorReportToAppAdmin('Failed to create xml file', error)
                return reject('RESOLVED ERROR')
              }

              generatedFiles++
              // Should resolve with directory path
              if (orders.length === generatedFiles) { resolve({ archiveDirName, archiveDirPath }) }
          })
        })
      })
    } catch(e){reject(e)}
  })
}

const compressFiles = ({ archiveDirName, archiveDirPath }) => {
  const zipFileName = `${archiveDirPath}/${archiveDirName}.zip`

  zipper.sync.zip(archiveDirPath).compress().save(zipFileName, (error) => {
    if (error) {
      sendErrorReportToAppAdmin('Failed to zip order xml files', error)
      return Promise.reject('RESOLVED ERROR')
    }
  })

  return Promise.resolve(zipFileName)
}

const sendFileToRecipient = (zipFile) => {
  const data = {
    from: `Automated Report <noreply@${MAILGUN_DOMAIN}>`,
    to: NCI_RECIPIENT_EMAIL,
    subject: 'New Amazon XML file ready to upload',
    text:
      `
      Attached is an zip file for all new orders for the time period:
      
      start: ${orderRangeStartHuman}
      end: ${orderRangeEndHuman}
      `,
    attachment: zipFile
  }

  return mailgun.messages().send(data, function (error) {
    if (error) {
      sendErrorReportToAppAdmin('Failed email delivery', error)
      return Promise.reject('RESOLVED ERROR')
    }

    console.log('***************************************************************************')
    console.log('PROCESS COMPLETED: Zip file emailed to recipient')
    console.log('***************************************************************************')
  })
}

const init = () => {
  const fiveMinutesPastTheHourEveryFourHours = '5 */4 * * *'

  new cronJob(fiveMinutesPastTheHourEveryFourHours, () => {
    return fetchOrders()
      .then(fetchOrderItems)
      .then(buildXMLFiles)
      .then(compressFiles)
      .then(sendFileToRecipient)
      .catch(handleError)
  }, null, true, 'America/Los_Angeles')
}

init()
