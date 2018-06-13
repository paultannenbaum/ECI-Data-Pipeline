const pipeline = require('./dataPipeline')
const moment   = require('moment')
const tz       = require('moment-timezone')

const start = tz(moment(), 'America/Los_Angeles').subtract(60, 'days')
const end   = tz(moment(), 'America/Los_Angeles').subtract(1, 'hour')

pipeline.run(start, end)
