const debug = Debug('MEMO');

let normalizeId = (str) => (str || '').toString().toLowerCase().replace(/[^\w]/g, '');
let model = function (id, content, author) {
    return {
        name: id.trim().replace(new RegExp(':$'), ''),
        content: content,
        author: author,
        date: new Date(),
        updated: new Date()
    }
};

let reply = function (data, msg) {
    let nick = data ? data.user || data : null;
    let channel = data ? data.channel : '';
    if (nick && msg) {
        sendMessage.call(this, `/msg ${nick} ${msg}`, channel);
    }
};
let sendMessage = function (msg, channel) {
    let queue = channel ? `channel::${channel}::send` : 'mirkoczat::send';
    this.app.queue.emit(queue, msg);
};

let eventHandler;
let registerEvents = _.once(function (that) {
    that.app.bus('channel::*::command::privileged', function (command, args, data) {
        switch (command) {
            case 'memo-run':
            case 'memo-start': {
                that.privateMode = false;
                reply.call(that, data, `Memo private mode is disabled!`);
                break;
            }

            case 'memo-stop': {
                that.privateMode = true;
                reply.call(that, data, `Memo private mode is enabled!`);
                break;
            }

            case 'memo':
            case 'memo-add':
            case 'memo-set':
            case 'memo-save': {
                let id = _.first(args);
                let msg = _.tail(args).join(' ').trim();
                if (id && !_.isEqual(id, 'random') && msg) {
                    let dto = that.register(id, msg, data.user);
                    if (dto) {
                        reply.call(that, data, `Memo ${id} registered!`);
                    } else {
                        reply.call(that, data, `Failed to register a memo ${id}!`);
                    }
                } else {
                    reply.call(that, data, `No passed name or content, execute: ${command} name ...content!`);
                }
                break;
            }

            case 'memo-alias': {
                let id = _.first(args);
                let aliases = _.tail(args);
                if (id && !_.isEmpty(aliases) && that.alias(id, aliases)) {
                    reply.call(that, data, `Memo ${id} has added ${aliases.join(', ')} aliases!`);
                } else if (id && !_.isEmpty(aliases)) {
                    reply.call(that, data, `Memo ${id} not found`);
                } else {
                    reply.call(that, data, `No passed name or aliases, execute: ${command} name ...alias!`);
                }
                break;
            }

            case 'memo-push': {
                let id = _.first(args);
                let msg = _.tail(args).join(' ').trim();
                if (id && msg && that.pushContent(id, msg)) {
                    reply.call(that, data, `Memo ${id} has appended a new content!`);
                } else {
                    reply.call(that, data, `No passed name or content, execute: ${command} name ...content!`);
                }
                break;
            }

            case 'memo-pop': {
                let id = _.first(args);
                let msg = _.tail(args).join(' ').trim();
                if (id && msg) {
                    if (that.popContent(id, msg)) {
                        reply.call(that, data, `Memo ${id} has removed a content!`);
                    } else {
                        reply.call(that, data, `Memo ${id} not found`);
                    }
                } else {
                    reply.call(that, data, `No passed name or content to remove, execute: ${command} name ...content!`);
                }
                break;
            }


            case 'memo-undo': {
                let id = _.first(args);
                if (id) {
                    let status = that.undo(id)
                    if (status === true) {
                        reply.call(that, data, `Memo ${id} back to older version!`);
                    } else if (status === false) {
                        reply.call(that, data, `Memo ${id} has not older version!`);
                    } else {
                        reply.call(that, data, `Memo ${id} not found`);
                    }
                } else {
                    reply.call(that, data, `No passed name, execute: ${command} name!`);
                }
                break;
            }

            case 'memo-redo': {
                let id = _.first(args);
                if (id) {
                    let status = that.redo(id)
                    if (status === true) {
                        reply.call(that, data, `Memo ${id} back to newer version!`);
                    } else if (status === false) {
                        reply.call(that, data, `Memo ${id} has not newer version!`);
                    } else {
                        reply.call(that, data, `Memo ${id} not found`);
                    }
                } else {
                    reply.call(that, data, `No passed name, execute: ${command} name!`);
                }
                break;
            }


            case 'memo-remove':
            case 'memo-delete': {
                let id = _.first(args);
                if (that.isAlias(id)) {
                    let obj = that.get(id);
                    that.unalias(id);
                    reply.call(that, data, `Memo ${obj.name} has removed ${id} alias!`);
                } else if (that.remove(id)) {
                    reply.call(that, data, `Memo ${id} removed!`);
                } else if (id) {
                    reply.call(that, data, `Memo ${id} not found`);
                } else {
                    reply.call(that, data, `No passed name, execute: ${command} name!`);
                }
                break;
            }


            case 'memo-list': {
                let memos = _(that.list()).values().map((m) => { m.sort = normalizeId(m.name); return m; }).sortBy('sort').value();
                if (!_.isEmpty(memos)) {
                    reply.call(that, data, `Available memos: ${_(memos).map((m) => `📝 ${m.name}${_.isEmpty(m.aliases) ? '' : ` (${_(m.aliases).sort().join(', ')})`}`).join('; ')}`);
                } else {
                    reply.call(that, data, `No found any memo! Add new by executing comand: !memo id content`);
                }
                break;
            }
        }
    })
});

class Memo {
    constructor(applicationInstance) {
        this.app = applicationInstance;
        this.privateMode = false
        this.ran = false;
        this.db = null;
    }

    prepare() {
        this.app.db.defaults({memo: []}).write();
    }

    isPrepared() {
        if (!this.app.isLoadedModule('mirkoczat')) {
            debug('Failed to run Memo! Required dependency %s does not loaded!', 'mirkoczat');
            return false;
        }
    }

    init() {
        this.db = this.app.db.get('memo');
    }

    isInitialized() {
        return !!this.db;
    }

    run() {
        if (!eventHandler) {
            eventHandler = (command, args, data) => {
                if (_.isEqual(normalizeId(command), 'random')) {
                    command = _(this.list()).castArray().flattenDeep().map('name').sample();
                }
                this.send.call(this, command, data.channel, data.user, this.privateMode || data.private);
            };
        }
        if (!this.ran) {
            this.ran = true;

            registerEvents(this);
            this.app.bus('channel::*::command::*', eventHandler);
        }
    }

    stop() {
        this.ran = false;
        this.app.bus().off('channel::*::command::*', eventHandler);
    }

    has(id) {
        return !!this.get(id);
    }

    list() {
        return this.db.map(function (m) {
            return {
                name: m.name,
                aliases: m.aliases,
                date: m.updated || m.date || m.created,
                created: m.created || m.date,
                updated: m.updated || m.date
            }
        }).value();
    }

    get(id) {
        return this.db.find((obj) => _([obj.name, obj.aliases]).castArray().flattenDeep().compact().map(normalizeId).includes(normalizeId(id))).value();
    }

    register(id, content, nick) {
        // Redo to the newest version
        while (this.redo(id));

        let obj = this.get(id);
        let newObj = model(id, content, nick);
        let oldObj = obj ? _.cloneDeep(obj) : null;
        if (obj) {
            // Modify old memo
            if (!_.isEqual(obj.name.toLowerCase(), newObj.name.toLowerCase())) {
                obj.aliases = obj.aliases || [];
                obj.aliases.push(obj.name);
                debug('Updated and renamed memo %o <- %o: %s [by %s] (old: %s [by %s])', id, oldObj.name, content, nick, oldObj.content, oldObj.author);
            } else {
                debug('Updated memo %o: %s [by %s] (old: %s [by %s])', id, content, nick, oldObj.content, oldObj.author);
            }
            _.extend(obj, newObj);
        } else {
            obj = this.db.insert(newObj).write();
            debug('Added memo %o: %s [by %s]', id, content, nick);
        }
        // Archive historical data
        if (oldObj) {
            _.extend(obj, {previous: oldObj});
        }
        return !!this.db.write();
    }

    undo(id) {
        let obj = this.get(id)
        let oldObj = obj ? _.cloneDeep(obj) : null;
        let newObj = obj && obj.previous ? _.cloneDeep(obj.previous) : null;
        if (obj) {
            if (newObj) {
                delete oldObj.previous
                if (!newObj.previous) {
                    delete obj.previous
                }
                newObj.next = oldObj
                newObj.updated = new Date()
                _.extend(obj, newObj);
                return !!this.db.write();
            }

            return false
        }
    }

    redo(id) {
        let obj = this.get(id)
        let oldObj = obj ? _.cloneDeep(obj) : null;
        let newObj = obj && obj.next ? _.cloneDeep(obj.next) : null
        if (obj) {
            if (newObj) {
                delete oldObj.next
                if (!newObj.next) {
                    delete obj.next
                }
                newObj.previous = oldObj
                newObj.updated = new Date()
                _.extend(obj, newObj);
                return !!this.db.write();
            }

            return false
        }
    }

    remove(id) {
        let obj = this.get(id)
        if (obj) {
            this.db
                .remove(obj)
                .write()
            debug('Removed memo %o', id)
            return obj
        }
    }

    isAlias(alias) {
        let obj = this.get(alias)
        return obj && !_.isEqual(normalizeId(obj.name), normalizeId(alias))
    }

    alias(id, aliases) {
        let entity = this.get(id)
        if (entity) {
            entity.aliases = entity.aliases || []

            debug('Added aliases %o for %o memo', _.without(aliases, entity.aliases), entity.name)
            aliases.forEach((alias) => {
                // Unalias other memo
                if (this.isAlias(alias)) {
                    this.unalias(alias)
                }
                // Alias memo
                if (!this.has(alias)) {
                    entity.aliases.push(alias)
                    entity.updated = new Date()
                }
            })

            return !!this.db.write()
        }
    }

    unalias(alias) {
        if (this.isAlias(alias)) {
            let entity = this.get(alias)
            if (entity) {
                _.remove(entity.aliases, (a) => _.isEqual(normalizeId(a), normalizeId(alias)))
                entity.updated = new Date()
                debug('Removed alias %o for %o memo', alias, entity.name)
                return !!this.db.write()
            }
        }
        return false
    }

    pushContent(id, content) {
        let entity = this.get(id)
        if (entity) {
            if (!_.isArray(entity.content)) {
                entity.content = [entity.content]
            }
            entity.content.push(content)

            debug('Append a new content to %o memo: %s', entity.name, content)
            return !!this.db.write()
        }
        return false
    }

    popContent(id, content) {
        let entity = this.get(id)
        if (entity && _.isArray(entity.content)) {
            if (_.remove(entity.content, (msg) => _.isEqual(msg.toLowerCase(), content.toLowerCase()))) {
                debug('Memo %o has removed a content: %s', entity.name, content)
                return !!this.db.write()
            }
        }
        return false
    }

    send(id, channel, nick = '', sendPrivate = true) {
        if (channel && id && (!sendPrivate || nick)) {
            let dto = this.get(id)
            if (dto) {
                let msg = `📝 ${dto.name || id}: ${_(dto.content).castArray().flattenDeep().sample()}`
                sendMessage.call(this, sendPrivate ? `/msg ${nick} ${msg}` : `/me ${msg}`, channel)
            }
        }
        return this
    }
}

module.exports = Memo