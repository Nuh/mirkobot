global._ = require('lodash')
global.Debug = _.noop() || global.Debug

const debug = Debug('CORE')
const db = require('./api/db')
const queue = require('./api/queue')

let getModuleName = (filename) => (filename || '').replace(new RegExp('^\.\/modules\/'), '').replace(new RegExp('.js$'), '').toLowerCase()
let getModulePath = (moduleName) => getAvailableModules()[getModuleName(moduleName)]
let getAvailableModules = () => {
    let normalizedPath = require("path").join(__dirname, "modules");
    return _(require("fs").readdirSync(normalizedPath))
                .values().map((filename) => `./modules/${filename}`)
                .keyBy((n) => n).mapKeys(getModuleName).value()
}

class Mirkobot {
    constructor(config) {
        this.db = db
        this.queue = queue
        this.config = config
        this.modules = {}
        this.isRan = false

        this.loadModules()
    }

    bus(/*...*/) {
        if (arguments.length > 0) {
            queue.on.apply(queue, arguments)
        }
        return queue
    }

    property(/*...*/) {
        let args = _.toArray(arguments)
        if (args.length > 0) {
            return this.config.get.apply(this.config, args)
        }
        return this.config
    }

    isPrepared() {
        return !_.some(this.execute('isPrepared'), function(value) { return value === false })
    }

    isInitialized() {
        return !_.some(this.execute('isInitialized'), function(value) { return value === false })
    }

    isReady() {
        if (!this.isRan) {
            return !_.some(this.execute('isReady'), function(value) { return value === false })
        }
        return true
    }

    isLoadedModule(name) {
        return getModuleName(name) in this.modules
    }

    getModule(name) {
        let module = this.getModuleDescription(name) || {}
        return !_.isNil(module.instance) ? module.instance : module.file
    }

    getModuleDescription(name) {
        if (this.isLoadedModule(name)) {
            return this.modules[getModuleName(name)]
        }
    }

    hasModule(name) {
        try {
            require.resolve(getModulePath(name))
            return true
        } catch(e) {
            debug('No found module: %s', name)
        }
        return false
    }

    initModule(module) {
        if (module instanceof Function) {
            if (module.constructor instanceof Function) {
                return new module(this)
            } else {
                return module(this)
            }
        }
        return module
    }

    loadModule(name) {
        let moduleName = getModuleName(name)
        if (this.hasModule(name)) {
            if (this.isLoadedModule(moduleName)) {
                return this.getModule(moduleName)
            }

            try {
                let path = getModulePath(getModulePath(name))
                let file = require(path)
                let module = {
                    name: moduleName,
                    instance: this.initModule(file),
                    path: path,
                    file: file
                }

                this.modules[moduleName] = module

                queue.emit('core::modules::register', module)
                debug('Loaded module: %o', moduleName)
                return module
            } catch (e) {
                console.error(`Failed load module: ${moduleName}!`)
                if (e.message) {
                    console.error(e.message)
                }
                debug(e)
            }
        }
        return null
    }

    loadModules() {
        let modules = this.config.get('modules', ['all'])

        // Loading modules
        let availableModules = _.keys(getAvailableModules())
        let enabledModules = _(_.toLower(_.first(_.castArray(modules))) === 'all' ? availableModules : _.castArray(modules))
                                .map(getModuleName).value()
        enabledModules.forEach((name) => this.loadModule.call(this, name))

        // Debug info
        let diff = _.without.apply(_, [availableModules].concat(enabledModules))
        if (_.size(diff)) {
            debug('Disabled modules: %o', diff)
        }
    }

    execute(methodName) {
        let args = _.toArray(arguments).splice(1)
        let ret = {}
        for (let name in this.modules) {
            let info = this.getModuleDescription(name)
            let module = this.getModule(name)
            let method = (module || {})[methodName]
            let value

            if (method && method instanceof Function) {
                value = method.apply(module, args)
                debug('Executed method %s on %s', methodName, info.name)
            }

            ret[name] = value
        }
        return ret
    }

    run() {
        if (!this.isRan) {
            this.execute('prepare')
            if (!this.isPrepared()) {
                console.error('Application does not prepared!')
                return false
            }

            this.execute('init')
            if (!this.isInitialized()) {
                console.error('Application does not initialized!')
                return false
            }

            while (!this.isReady()) {
                debug('Waiting on modules readiness')
                sleep(1000)
            }

            this.execute('run')

            console.log('Application successfully started!')
            this.isRan = true
        }
        return this.isRan
    }
}

module.exports = Mirkobot

