const debug = Debug('LOGGER');
const fs = require('fs-extra');

let prepareBindings = function(data) {
    return {
        channel: data.channel,
        mine: data.myMessage,
        nick: `${data.permission === 'privileged' ? '@' : (data.permissions === 'voiced' ? '+' : ' ')}${data.user}`,
        login: data.user,
        status: data.permission,
        message: data.body,
        date: {
            iso8601: data.date.toISOString(),
            years: _.padStart(data.date.getUTCFullYear(), 4, '0'),
            months: _.padStart(data.date.getUTCMonth() + 1, 2, '0'),
            weekdays: data.date.getUTCDay(),
            days: _.padStart(data.date.getUTCDate(), 2, '0'),
            hours: _.padStart(data.date.getUTCHours(), 2, '0'),
            minutes: _.padStart(data.date.getUTCMinutes(), 2, '0'),
            seconds: _.padStart(data.date.getUTCSeconds(), 2, '0'),
            miliseconds: _.padStart(data.date.getUTCMilliseconds(), 3, '0'),
            timezone: 'UTC',
            timezoneOffset: 0
        }
    }
}

let eventHandler = function(msg, data) {
    let binding = prepareBindings(data)
    let path = this.templates.path(binding)
    let logmessage = this.templates[data.type || 'message'](binding)

    if (logmessage) {
        fs.outputFileSync(path, logmessage, {'flag': 'a+'});
    }
}

class Logger {
    constructor(applicationInstance) {
        this.app = applicationInstance

        this.templates = {
            path: _.template(this.app.property('logger:path', 'logs/${channel}/${date.years}-${date.months}-${date.days}.log')),
            action: _.template(this.app.property('logger:action', '${date.hours}:${date.minutes}:${date.seconds} * ${login} ${message}\n')),
            message: _.template(this.app.property('logger:message', '${date.hours}:${date.minutes}:${date.seconds} <${nick}> ${message}\n'))
        }
    }

    dependency() {
        return ['mirkoczat']
    }

    run() {
        this.app.bus('channel::*::action::*', eventHandler.bind(this))
        this.app.bus('channel::*::message::*', eventHandler.bind(this))
    }

    stop() {
        this.app.bus().offAny(eventHandler)
    }

}

module.exports = Logger