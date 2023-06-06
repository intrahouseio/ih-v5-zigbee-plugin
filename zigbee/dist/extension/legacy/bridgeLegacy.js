"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
            settings.addDeviceToPasslist(entity.ID.toString());
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
                this.eventBus.emitEntityRenamed({ homeAssisantRename: false, from, to, entity });
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
            logger_1.default.error(`See https://www.zigbee2mqtt.io/guide/usage/mqtt_topics_and_messages.html#zigbee2mqtt-bridge-request for more info`);
            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${lookup[action][0]}_failed`, message }));
        }
        if (action === 'ban') {
            settings.blockDevice(ieeeAddr);
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
exports.default = BridgeLegacy;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJpZGdlTGVnYWN5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vbGliL2V4dGVuc2lvbi9sZWdhY3kvYnJpZGdlTGVnYWN5LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSw4REFBZ0Q7QUFDaEQsK0RBQXVDO0FBQ3ZDLDRGQUFrRTtBQUNsRSw2REFBcUM7QUFDckMsb0RBQTRCO0FBQzVCLDZEQUFxQztBQUNyQyxrSEFBOEQ7QUFDOUQsb0VBQWtDO0FBRWxDLE1BQU0sV0FBVyxHQUNiLElBQUksTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLCtEQUErRCxDQUFDLENBQUM7QUFDakgsTUFBTSxnQkFBZ0IsR0FBRyxDQUFDLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBRTVELE1BQXFCLFlBQWEsU0FBUSxtQkFBUztJQUFuRDs7UUFDWSx5QkFBb0IsR0FBVyxJQUFJLENBQUM7SUF5YmhELENBQUM7SUF0YlksS0FBSyxDQUFDLEtBQUs7UUFDaEIsSUFBSSxDQUFDLGdCQUFnQixHQUFHO1lBQ3BCLGFBQWEsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUM5QixXQUFXLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDMUIsU0FBUyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3ZCLE9BQU8sRUFBRSxJQUFJLENBQUMsS0FBSztZQUNuQixXQUFXLEVBQUUsSUFBSSxDQUFDLFFBQVE7WUFDMUIsU0FBUyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3ZCLFFBQVEsRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNyQixhQUFhLEVBQUUsSUFBSSxDQUFDLE9BQU87WUFDM0IsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNO1lBQ3JCLGFBQWEsRUFBRSxJQUFJLENBQUMsVUFBVTtZQUM5QixRQUFRLEVBQUUsSUFBSSxD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