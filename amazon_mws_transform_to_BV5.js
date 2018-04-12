const fs = require('fs');
const xml2js = require('xml2js')
const parser = xml2js.Parser({ explicitArray: false })
const util = require('util')

const sampleFile = 'sample_amazon_orders.xml'

fs.readFile(sampleFile, (err, data) => {
  parser.parseString(data, (err, result) => {
    console.log(util.inspect(result, false, null))
  })
})
