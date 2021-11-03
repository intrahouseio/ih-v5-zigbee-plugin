"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const settings = __importStar(require("../../util/settings"));
const logger_1 = __importDefault(require("../../util/logger"));
const zigbee_herdsman_converters_1 = __importDefault(require("zigbee-herdsman-converters"));
const utils_1 = __importDefault(require("../../util/utils"));
const assert_1 = __importDefault(require("assert"));
const extension_1 = __importDefault(require("../extension"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const configRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/config/((?:\\w+/get)|(?:\\w+/factory_reset)|(?:\\w+))`);
const allowedLogLevels = ['error', 'warn', 'info', 'debug'];
class BridgeLegacy extends extension_1.default {
    constructor() {
        super(...arguments);
        this.lastJoinedDeviceName = null;
    }
    async start() {
        this.supportedOptions = {
            'permit_join': this.permitJoin,
            'last_seen': this.lastSeen,
            'elapsed': this.elapsed,
            'reset': this.reset,
            'log_level': this.logLevel,
            'devices': this.devices,
            'groups': this.groups,
            'devices/get': this.devices,
            'rename': this.rename,
            'rename_last': this.renameLast,
            'remove': this.remove,
            'force_remove': this.forceRemove,
            'ban': this.ban,
            'device_options': this.deviceOptions,
            'add_group': this.addGroup,
            'remove_group': this.removeGroup,
            'force_remove_group': this.removeGroup,
            'whitelist': this.whitelist,
            'touchlink/factory_reset': this.touchlinkFactoryReset,
        };
        this.eventBus.onDeviceJoined(this, (data) => this.onZigbeeEvent_('deviceJoined', data, data.device));
        this.eventBus.onDeviceInterview(this, (data) => this.onZigbeeEvent_('deviceInterview', data, data.device));
        this.eventBus.onDeviceAnnounce(this, (data) => this.onZigbeeEvent_('deviceAnnounce', data, data.device));
        this.eventBus.onDeviceLeave(this, (data) => this.onZigbeeEvent_('deviceLeave', data, null));
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        await this.publish();
    }
    whitelist(topic, message) {
        try {
            const entity = settings.getDevice(message);
            (0, assert_1.default)(entity, `Entity '${message}' does not exist`);
            settings.whitelistDevice(entity.ID.toString());
            logger_1.default.info(`Whitelisted '${entity.friendly_name}'`);
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: 'device_whitelisted', message: { friendly_name: entity.friendly_name } }));
        }
        catch (error) {
            logger_1.default.error(`Failed to whitelist '${message}' '${error}'`);
        }
    }
    deviceOptions(topic, message) {
        let json = null;
        try {
            json = JSON.parse(message);
        }
        catch (e) {
            logger_1.default.error('Failed to parse message as JSON');
            return;
        }
        if (!json.hasOwnProperty('friendly_name') || !json.hasOwnProperty('options')) {
            logger_1.default.error('Invalid JSON message, should contain "friendly_name" and "options"');
            return;
        }
        const entity = settings.getDevice(json.friendly_name);
        (0, assert_1.default)(entity, `Entity '${json.friendly_name}' does not exist`);
        settings.changeEntityOptions(entity.ID.toString(), json.options);
        logger_1.default.info(`Changed device specific options of '${json.friendly_name}' (${(0, json_stable_stringify_without_jsonify_1.default)(json.options)})`);
    }
    async permitJoin(topic, message) {
        await this.zigbee.permitJoin(message.toLowerCase() === 'true');
        this.publish();
    }
    async reset() {
        try {
            await this.zigbee.reset('soft');
            logger_1.default.info('Soft resetted ZNP');
        }
        catch (error) {
            logger_1.default.error('Soft reset failed');
        }
    }
    lastSeen(topic, message) {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        if (!allowed.includes(message)) {
            logger_1.default.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }
        settings.set(['advanced', 'last_seen'], message);
        logger_1.default.info(`Set last_seen to ${message}`);
    }
    elapsed(topic, message) {
        const allowed = ['true', 'false'];
        if (!allowed.includes(message)) {
            logger_1.default.error(`${message} is not an allowed value, possible: ${allowed}`);
            return;
        }
        settings.set(['advanced', 'elapsed'], message === 'true');
        logger_1.default.info(`Set elapsed to ${message}`);
    }
    logLevel(topic, message) {
        const level = message.toLowerCase();
        if (allowedLogLevels.includes(level)) {
            logger_1.default.info(`Switching log level to '${level}'`);
            logger_1.default.setLevel(level);
        }
        else {
            logger_1.default.error(`Could not set log level to '${level}'. Allowed level: '${allowedLogLevels.join(',')}'`);
        }
        this.publish();
    }
    async devices(topic) {
        const coordinator = await this.zigbee.getCoordinatorVersion();
        const devices = this.zigbee.devices().map((device) => {
            const payload = {
                ieeeAddr: device.ieeeAddr,
                type: device.zh.type,
                networkAddress: device.zh.networkAddress,
            };
            if (device.zh.type !== 'Coordinator') {
                const definition = zigbee_herdsman_converters_1.default.findByDevice(device.zh);
                payload.model = definition ? definition.model : device.zh.modelID;
                payload.vendor = definition ? definition.vendor : '-';
                payload.description = definition ? definition.description : '-';
                payload.friendly_name = device.name;
                payload.manufacturerID = device.zh.manufacturerID;
                payload.manufacturerName = device.zh.manufacturerName;
                payload.powerSource = device.zh.powerSource;
                payload.modelID = device.zh.modelID;
                payload.hardwareVersion = device.zh.hardwareVersion;
                payload.softwareBuildID = device.zh.softwareBuildID;
                payload.dateCode = device.zh.dateCode;
                payload.lastSeen = device.zh.lastSeen;
            }
            else {
                payload.friendly_name = 'Coordinator';
                payload.softwareBuildID = coordinator.type;
                payload.dateCode = coordinator.meta.revision.toString();
                payload.lastSeen = Date.now();
            }
            return payload;
        });
        if (topic.split('/').pop() == 'get') {
            this.mqtt.publish(`bridge/config/devices`, (0, json_stable_stringify_without_jsonify_1.default)(devices), {}, settings.get().mqtt.base_topic, false, false);
        }
        else {
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: 'devices', message: devices }));
        }
    }
    groups() {
        const payload = settings.getGroups().map((g) => {
            return { ...g, ID: Number(g.ID) };
        });
        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: 'groups', message: payload }));
    }
    rename(topic, message) {
        const invalid = `Invalid rename message format expected {"old": "friendly_name", "new": "new_name"} got ${message}`;
        let json = null;
        try {
            json = JSON.parse(message);
        }
        catch (e) {
            logger_1.default.error(invalid);
            return;
        }
        // Validate message
        if (!json.new || !json.old) {
            logger_1.default.error(invalid);
            return;
        }
        this._renameInternal(json.old, json.new);
    }
    renameLast(topic, message) {
        if (!this.lastJoinedDeviceName) {
            logger_1.default.error(`Cannot rename last joined device, no device has joined during this session`);
            return;
        }
        this._renameInternal(this.lastJoinedDeviceName, message);
    }
    _renameInternal(from, to) {
        try {
            const isGroup = settings.getGroup(from) !== null;
            settings.changeFriendlyName(from, to);
            logger_1.default.info(`Successfully renamed - ${from} to ${to} `);
            const entity = this.zigbee.resolveEntity(to);
            if (entity.isDevice()) {
                this.eventBus.emitDeviceRenamed({ homeAssisantRename: false, from, to, device: entity });
            }
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `${isGroup ? 'group' : 'device'}_renamed`, message: { from, to } }));
        }
        catch (error) {
            logger_1.default.error(`Failed to rename - ${from} to ${to}`);
        }
    }
    addGroup(topic, message) {
        let id = null;
        let name = null;
        try {
            // json payload with id and friendly_name
            const json = JSON.parse(message);
            if (json.hasOwnProperty('id')) {
                id = json.id;
                name = `group_${id}`;
            }
            if (json.hasOwnProperty('friendly_name')) {
                name = json.friendly_name;
            }
        }
        catch (e) {
            // just friendly_name
            name = message;
        }
        if (name == null) {
            logger_1.default.error('Failed to add group, missing friendly_name!');
            return;
        }
        const group = settings.addGroup(name, id);
        this.zigbee.createGroup(group.ID);
        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `group_added`, message: name }));
        logger_1.default.info(`Added group '${name}'`);
    }
    removeGroup(topic, message) {
        const name = message;
        const entity = this.zigbee.resolveEntity(message);
        (0, assert_1.default)(entity && entity.isGroup(), `Group '${message}' does not exist`);
        if (topic.includes('force')) {
            entity.zh.removeFromDatabase();
        }
        else {
            entity.zh.removeFromNetwork();
        }
        settings.removeGroup(message);
        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `group_removed`, message }));
        logger_1.default.info(`Removed group '${name}'`);
    }
    async forceRemove(topic, message) {
        await this.removeForceRemoveOrBan('force_remove', message);
    }
    async remove(topic, message) {
        await this.removeForceRemoveOrBan('remove', message);
    }
    async ban(topic, message) {
        await this.removeForceRemoveOrBan('ban', message);
    }
    async removeForceRemoveOrBan(action, message) {
        const entity = this.zigbee.resolveEntity(message.trim());
        const lookup = {
            ban: ['banned', 'Banning', 'ban'],
            force_remove: ['force_removed', 'Force removing', 'force remove'],
            remove: ['removed', 'Removing', 'remove'],
        };
        if (!entity) {
            logger_1.default.error(`Cannot ${lookup[action][2]}, device '${message}' does not exist`);
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}_failed`, message }));
            return;
        }
        const ieeeAddr = entity.ieeeAddr;
        const name = entity.name;
        const cleanup = () => {
            // Fire event
            this.eventBus.emitDeviceRemoved({ ieeeAddr, name });
            // Remove from configuration.yaml
            settings.removeDevice(entity.ieeeAddr);
            // Remove from state
            this.state.remove(ieeeAddr);
            logger_1.default.info(`Successfully ${lookup[action][0]} ${entity.name}`);
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}`, message }));
        };
        try {
            logger_1.default.info(`${lookup[action][1]} '${entity.name}'`);
            if (action === 'force_remove') {
                await entity.zh.removeFromDatabase();
            }
            else {
                await entity.zh.removeFromNetwork();
            }
            cleanup();
        }
        catch (error) {
            logger_1.default.error(`Failed to ${lookup[action][2]} ${entity.name} (${error})`);
            // eslint-disable-next-line
            logger_1.default.error(`See https://www.zigbee2mqtt.io/information/mqtt_topics_and_message_structure.html#zigbee2mqttbridgeconfigremove for more info`);
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}_failed`, message }));
        }
        if (action === 'ban') {
            settings.banDevice(ieeeAddr);
        }
    }
    async onMQTTMessage(data) {
        const { topic, message } = data;
        if (!topic.match(configRegex)) {
            return;
        }
        const option = topic.match(configRegex)[1];
        if (!this.supportedOptions.hasOwnProperty(option)) {
            return;
        }
        await this.supportedOptions[option](topic, message);
        return;
    }
    async publish() {
        const info = await utils_1.default.getZigbee2MQTTVersion();
        const coordinator = await this.zigbee.getCoordinatorVersion();
        const topic = `bridge/config`;
        const payload = {
            version: info.version,
            commit: info.commitHash,
            coordinator,
            network: await this.zigbee.getNetworkParameters(),
            log_level: logger_1.default.getLevel(),
            permit_join: this.zigbee.getPermitJoin(),
        };
        await this.mqtt.publish(topic, (0, json_stable_stringify_without_jsonify_1.default)(payload), { retain: true, qos: 0 });
    }
    onZigbeeEvent_(type, data, resolvedEntity) {
        if (type === 'deviceJoined' && resolvedEntity) {
            this.lastJoinedDeviceName = resolvedEntity.name;
        }
        if (type === 'deviceJoined') {
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_connected`, message: { friendly_name: resolvedEntity.name } }));
        }
        else if (type === 'deviceInterview') {
            if (data.status === 'successful') {
                if (resolvedEntity.definition) {
                    const { vendor, description, model } = resolvedEntity.definition;
                    const log = { friendly_name: resolvedEntity.name, model, vendor, description, supported: true };
                    this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_successful', meta: log }));
                }
                else {
                    const meta = { friendly_name: resolvedEntity.name, supported: false };
                    this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_successful', meta }));
                }
            }
            else if (data.status === 'failed') {
                const meta = { friendly_name: resolvedEntity.name };
                this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_failed', meta }));
            }
            else {
                /* istanbul ignore else */
                if (data.status === 'started') {
                    const meta = { friendly_name: resolvedEntity.name };
                    this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `pairing`, message: 'interview_started', meta }));
                }
            }
        }
        else if (type === 'deviceAnnounce') {
            const meta = { friendly_name: resolvedEntity.name };
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_announced`, message: 'announce', meta }));
        }
        else {
            /* istanbul ignore else */
            if (type === 'deviceLeave') {
                const name = data.ieeeAddr;
                const meta = { friendly_name: name };
                this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_removed`, message: 'left_network', meta }));
            }
        }
    }
    async touchlinkFactoryReset() {
        logger_1.default.info('Starting touchlink factory reset...');
        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `touchlink`, message: 'reset_started', meta: { status: 'started' } }));
        const result = await this.zigbee.touchlinkFactoryResetFirst();
        if (result) {
            logger_1.default.info('Successfully factory reset device through Touchlink');
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `touchlink`, message: 'reset_success', meta: { status: 'success' } }));
        }
        else {
            logger_1.default.warn('Failed to factory reset device through Touchlink');
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `touchlink`, message: 'reset_failed', meta: { status: 'failed' } }));
        }
    }
}
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "whitelist", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "deviceOptions", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "permitJoin", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "reset", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "lastSeen", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "elapsed", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "logLevel", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "devices", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "groups", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "rename", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "renameLast", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "addGroup", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "removeGroup", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "forceRemove", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "remove", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "ban", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "removeForceRemoveOrBan", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], BridgeLegacy.prototype, "touchlinkFactoryReset", null);
exports.default = BridgeLegacy;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJpZGdlTGVnYWN5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2V4dGVuc2lvbi9sZWdhY3kvYnJpZGdlTGVnYWN5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUFnRDtBQUNoRCwrREFBdUM7QUFDdkMsNEZBQWtFO0FBQ2xFLDZEQUFxQztBQUNyQyxvREFBNEI7QUFDNUIsNkRBQXFDO0FBQ3JDLGtIQUE4RDtBQUM5RCxvRUFBa0M7QUFFbEMsTUFBTSxXQUFXLEdBQ2IsSUFBSSxNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsK0RBQStELENBQUMsQ0FBQztBQUNqSCxNQUFNLGdCQUFnQixHQUFHLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFFNUQsTUFBcUIsWUFBYSxTQUFRLG1CQUFTO0lBQW5EOztRQUNZLHlCQUFvQixHQUFXLElBQUksQ0FBQztJQXliaEQsQ0FBQztJQXRiWSxLQUFLLENBQUMsS0FBSztRQUNoQixJQUFJLENBQUMsZ0JBQWdCLEdBQUc7WUFDcEIsYUFBYSxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzlCLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUMxQixTQUFTLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDdkIsT0FBTyxFQUFFLElBQUksQ0FBQyxLQUFLO1lBQ25CLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUMxQixTQUFTLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDdkIsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ3JCLGFBQWEsRUFBRSxJQUFJLENBQUMsT0FBTztZQUMzQixRQUFRLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDckIsYUFBYSxFQUFFLElBQUksQ0FBQyxVQUFVO1lBQzlCLFFBQVEsRUFBRSxJQUFJLENBQUMs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