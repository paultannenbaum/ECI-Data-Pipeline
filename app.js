const cronJob = require('cron').CronJob
const pipeline = require('./dataPipeline')
const fiveMinutesPastTheHourEveryFourHours = '5 */4 * * *'

new cronJob(fiveMinutesPastTheHourEveryFourHours, pipeline.run, null, true, 'America/Los_Angeles')
