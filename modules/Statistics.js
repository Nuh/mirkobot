const Promise = require('bluebird');
const RequestPromise = require('request-promise');
const debug = Debug('STATISTICS');
const moment = require('moment-timezone');
const cheerio = require('cheerio');
const exec = require('child_process').execSync;
const path = require('path');
const fs = require('fs-extra');

let uploadHtml = function(html) {
    return !html ? Promise.reject() : RequestPromise({ method: 'POST', uri: 'https://pste.eu/', form: { 'html-text': html } })
        .then(function(body) {
            var $ = cheerio.load(body)
            var url = $('a').attr('href')
            return url ? Promise.resolve(url) : Promise.reject()
        })
}

let registerMemo = function(channel, url) {
    let memo = this.app.getModule('memo')
    if (memo && url) {
        let name = this.app.property('statistics:memo:name', 'Statistics')
        let aliases = _.castArray(this.app.property('statistics:memo:aliases', ['stat', 'stats', 'top', 'top10']))
        if (memo.register(name, url, 'SYSTEM') && (!_.size(aliases) || memo.alias(name, aliases))) {
            debug('Registered a new memo of statistics for %o channel: %s', channel, name)
            return true
        }
    }
}

class Statistics {
    constructor(applicationInstance) {
        this.app = applicationInstance
        this.cron = null
    }

    dependency() {
        return ['mirkoczat', 'logger']
    }

    prepare() {
        if (this.cron) {
            return;
        }

        this.cron = new CronJob({
          cronTime: this.app.property('statistics:cron', '0 */5 * * * *'),
          onTick: () => this.generate(),
          start: false,
          timeZone: this.app.property('timezone', 'UTC')
        });
    }

    run() {
        if (this.cron) {
            this.cron.start()
        }
        this.generate()
    }

    stop() {
        if (this.cron) {
            this.cron.stop()
        }
    }

    generate() {
        let logpathTemplate = this.app.property('logger:path')
        let channels = this.app.property('channels')
        let lang = this.app.property('statistics:lang', 'EN')
        let timeOffset = moment.tz(this.app.property('timezone')).format('Z').replace(new RegExp(':.*'), '')
        channels.forEach((channel) => {
            debug('Start generating statistics for %o channel', channel)

            let logpath = _.template(path.dirname(logpathTemplate))({channel: channel})
            let cmd = `${path.normalize(`${__dirname}/../lib/pisg/pisg`)} --channel=${channel} --dir=${logpath} --network=MirkoCzat.pl --format=irssi --maintainer=MirkoBot --cfg LANG=${lang} --cfg TimeOffset=${timeOffset} -s -o -`
            let html

            try {
                html = exec(cmd, {stdio: [0,2], timeout: 60 * 1000, windowsHide: true}).toString()
                this.count = Math.max(0, (this.count || 0) - 1)
            } catch (e) {
                debug('Failed generate of statistics page for %o channel:\nReason: %s', channel, e.message || 'unknown');
                debug('Are you sure you have installed perl and executable perl scripts?');

                if((this.count = (this.count || 0) + 1) >= 5) {
                    debug('Disabling module because catch 5 failures in a row!')
                    this.stop()
                }
            }

            if (html) {
                debug('Generated statistics page of %o channel', channel)
                uploadHtml(html)
                    .then((url) => {
                        debug('Uploaded statistics page of %s channel: %s', channel, url)

                        this.lastUrl = url || this.lastUrl
                        if (!registerMemo.call(this, channel, url)) {
                            this.app.bus().emit('channel::${channel}}::send',
                                `${this.app.property('statistics:notify:message', '/me Generated statistics:')} ${url}`)
                        }
                    }).error((reason) => {
                        debug('Failed uploading a statistic page for %o channel: %s', channel, reason || 'no reason')
                    })
            }
        })
    }

}

module.exports = Statistics