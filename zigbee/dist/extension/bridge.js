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
/* eslint-disable camelcase */
const logger_1 = __importDefault(require("../util/logger"));
const utils_1 = __importDefault(require("../util/utils"));
const settings = __importStar(require("../util/settings"));
const winston_transport_1 = __importDefault(require("winston-transport"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const object_assign_deep_1 = __importDefault(require("object-assign-deep"));
const deep_object_diff_1 = require("deep-object-diff");
const extension_1 = __importDefault(require("./extension"));
const device_1 = __importDefault(require("../model/device"));
const requestRegex = new RegExp(`${settings.get().mqtt.base_topic}/bridge/request/(.*)`);
class Bridge extends extension_1.default {
    constructor() {
        super(...arguments);
        this.restartRequired = false;
    }
    async start() {
        this.requestLookup = {
            'device/options': this.deviceOptions,
            'device/configure_reporting': this.deviceConfigureReporting,
            'device/remove': this.deviceRemove,
            'device/rename': this.deviceRename,
            'group/add': this.groupAdd,
            'group/options': this.groupOptions,
            'group/remove': this.groupRemove,
            'group/rename': this.groupRename,
            'permit_join': this.permitJoin,
            'restart': this.restart,
            'touchlink/factory_reset': this.touchlinkFactoryReset,
            'touchlink/identify': this.touchlinkIdentify,
            'touchlink/scan': this.touchlinkScan,
            'health_check': this.healthCheck,
            'options': this.bridgeOptions,
            // Below are deprecated
            'config/last_seen': this.configLastSeen,
            'config/homeassistant': this.configHomeAssistant,
            'config/elapsed': this.configElapsed,
            'config/log_level': this.configLogLevel,
        };
        const mqtt = this.mqtt;
        class EventTransport extends winston_transport_1.default {
            log(info, callback) {
                const payload = (0, json_stable_stringify_without_jsonify_1.default)({ message: info.message, level: info.level });
                mqtt.publish(`bridge/logging`, payload, {}, settings.get().mqtt.base_topic, true);
                callback();
            }
        }
        logger_1.default.addTransport(new EventTransport());
        this.zigbee2mqttVersion = await utils_1.default.getZigbee2MQTTVersion();
        this.coordinatorVersion = await this.zigbee.getCoordinatorVersion();
        this.eventBus.onDeviceRenamed(this, () => this.publishInfo());
        this.eventBus.onGroupMembersChanged(this, () => this.publishGroups());
        this.eventBus.onDevicesChanged(this, () => this.publishDevices() && this.publishInfo());
        this.eventBus.onPermitJoinChanged(this, () => !this.zigbee.isStopping() && this.publishInfo());
        this.eventBus.onScenesChanged(this, () => {
            this.publishDevices();
            this.publishGroups();
        });
        // Zigbee events
        const publishEvent = (type, data) => this.mqtt.publish('bridge/event', (0, json_stable_stringify_without_jsonify_1.default)({ type, data }), { retain: false, qos: 0 });
        this.eventBus.onDeviceJoined(this, (data) => {
            this.lastJoinedDeviceIeeeAddr = data.device.ieeeAddr;
            this.publishDevices();
            publishEvent('device_joined', { friendly_name: data.device.name, ieee_address: data.device.ieeeAddr });
        });
        this.eventBus.onDeviceLeave(this, (data) => {
            this.publishDevices();
            publishEvent('device_leave', { ieee_address: data.ieeeAddr, friendly_name: data.name });
        });
        this.eventBus.onDeviceNetworkAddressChanged(this, () => this.publishDevices());
        this.eventBus.onDeviceInterview(this, (data) => {
            this.publishDevices();
            const payload = { friendly_name: data.device.name, status: data.status, ieee_address: data.device.ieeeAddr };
            if (data.status === 'successful') {
                payload.supported = !!data.device.definition;
                payload.definition = this.getDefinitionPayload(data.device);
            }
            publishEvent('device_interview', payload);
        });
        this.eventBus.onDeviceAnnounce(this, (data) => {
            this.publishDevices();
            publishEvent('device_announce', { friendly_name: data.device.name, ieee_address: data.device.ieeeAddr });
        });
        await this.publishInfo();
        await this.publishDevices();
        await this.publishGroups();
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
    }
    async onMQTTMessage(data) {
        var _a;
        const match = data.topic.match(requestRegex);
        const key = (_a = match === null || match === void 0 ? void 0 : match[1]) === null || _a === void 0 ? void 0 : _a.toLowerCase();
        if (key in this.requestLookup) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            try {
                const response = await this.requestLookup[key](message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
            catch (error) {
                logger_1.default.error(`Request '${data.topic}' failed with error: '${error.message}'`);
                logger_1.default.debug(error.stack);
                const response = utils_1.default.getResponse(message, {}, error.message);
                await this.mqtt.publish(`bridge/response/${match[1]}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
            }
        }
    }
    /**
     * Requests
     */
    async deviceOptions(message) {
        return this.changeEntityOptions('device', message);
    }
    async groupOptions(message) {
        return this.changeEntityOptions('group', message);
    }
    async bridgeOptions(message) {
        if (typeof message !== 'object' || typeof message.options !== 'object') {
            throw new Error(`Invalid payload`);
        }
        const diff = (0, deep_object_diff_1.detailedDiff)(settings.get(), message.options);
        // Remove any settings that are in the deleted.diff but not in the passed options
        const cleanupDeleted = (options, deleted) => {
            for (const key of Object.keys(deleted)) {
                if (!(key in options)) {
                    delete deleted[key];
                }
                else if (!Array.isArray(options[key])) {
                    cleanupDeleted(options[key], deleted[key]);
                }
            }
        };
        cleanupDeleted(message.options, diff.deleted);
        const newSettings = (0, object_assign_deep_1.default)({}, diff.added, diff.updated, diff.deleted);
        // deep-object-diff converts arrays to objects, set original array back here
        const convertBackArray = (before, after) => {
            for (const [key, afterValue] of Object.entries(after)) {
                const beforeValue = before[key];
                if (Array.isArray(beforeValue)) {
                    after[key] = beforeValue;
                }
                else if (afterValue && typeof beforeValue === 'object') {
                    convertBackArray(beforeValue, afterValue);
                }
            }
        };
        convertBackArray(message.options, newSettings);
        const restartRequired = settings.apply(newSettings);
        if (restartRequired)
            this.restartRequired = true;
        // Apply some settings on-the-fly.
        if (newSettings.hasOwnProperty('permit_join')) {
            await this.zigbee.permitJoin(newSettings.permit_join);
        }
        if (newSettings.hasOwnProperty('homeassistant')) {
            await this.enableDisableExtension(newSettings.homeassistant, 'HomeAssistant');
        }
        if (newSettings.hasOwnProperty('advanced') && newSettings.advanced.hasOwnProperty('log_level')) {
            logger_1.default.setLevel(newSettings.advanced.log_level);
        }
        logger_1.default.info('Succesfully changed options');
        this.publishInfo();
        return utils_1.default.getResponse(message, { restart_required: this.restartRequired }, null);
    }
    async deviceRemove(message) {
        return this.removeEntity('device', message);
    }
    async groupRemove(message) {
        return this.removeEntity('group', message);
    }
    async healthCheck(message) {
        return utils_1.default.getResponse(message, { healthy: true }, null);
    }
    async groupAdd(message) {
        if (typeof message === 'object' && !message.hasOwnProperty('friendly_name')) {
            throw new Error(`Invalid payload`);
        }
        const friendlyName = typeof message === 'object' ? message.friendly_name : message;
        const ID = typeof message === 'object' && message.hasOwnProperty('id') ? message.id : null;
        const group = settings.addGroup(friendlyName, ID);
        this.zigbee.createGroup(group.ID);
        this.publishGroups();
        return utils_1.default.getResponse(message, { friendly_name: group.friendly_name, id: group.ID }, null);
    }
    async deviceRename(message) {
        return this.renameEntity('device', message);
    }
    async groupRename(message) {
        return this.renameEntity('group', message);
    }
    async restart(message) {
        // Wait 500 ms before restarting so response can be send.
        setTimeout(this.restartCallback, 500);
        logger_1.default.info('Restarting Zigbee2MQTT');
        return utils_1.default.getResponse(message, {}, null);
    }
    async permitJoin(message) {
        if (typeof message === 'object' && !message.hasOwnProperty('value')) {
            throw new Error('Invalid payload');
        }
        let value;
        let time;
        let device = null;
        if (typeof message === 'object') {
            value = message.value;
            time = message.time;
            if (message.device) {
                const resolved = this.zigbee.resolveEntity(message.device);
                if (resolved instanceof device_1.default) {
                    device = resolved;
                }
                else {
                    throw new Error(`Device '${message.device}' does not exist`);
                }
            }
        }
        else {
            value = message;
        }
        if (typeof value === 'string') {
            value = value.toLowerCase() === 'true';
        }
        await this.zigbee.permitJoin(value, device, time);
        const response = { value };
        if (device && typeof message === 'object')
            response.device = message.device;
        if (time && typeof message === 'object')
            response.time = message.time;
        return utils_1.default.getResponse(message, response, null);
    }
    // Deprecated
    async configLastSeen(message) {
        const allowed = ['disable', 'ISO_8601', 'epoch', 'ISO_8601_local'];
        const value = this.getValue(message);
        if (typeof value !== 'string' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }
        settings.set(['advanced', 'last_seen'], value);
        this.publishInfo();
        return utils_1.default.getResponse(message, { value }, null);
    }
    // Deprecated
    async configHomeAssistant(message) {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (typeof value !== 'boolean' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }
        await this.enableDisableExtension(value, 'HomeAssistant');
        settings.set(['homeassistant'], value);
        this.publishInfo();
        return utils_1.default.getResponse(message, { value }, null);
    }
    // Deprecated
    async configElapsed(message) {
        const allowed = [true, false];
        const value = this.getValue(message);
        if (typeof value !== 'boolean' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }
        settings.set(['advanced', 'elapsed'], value);
        this.publishInfo();
        return utils_1.default.getResponse(message, { value }, null);
    }
    // Deprecated
    async configLogLevel(message) {
        const allowed = ['error', 'warn', 'info', 'debug'];
        const value = this.getValue(message);
        if (typeof value !== 'string' || !allowed.includes(value)) {
            throw new Error(`'${value}' is not an allowed value, allowed: ${allowed}`);
        }
        logger_1.default.setLevel(value);
        this.publishInfo();
        return utils_1.default.getResponse(message, { value }, null);
    }
    async touchlinkIdentify(message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('ieee_address') ||
            !message.hasOwnProperty('channel')) {
            throw new Error('Invalid payload');
        }
        logger_1.default.info(`Start Touchlink identify of '${message.ieee_address}' on channel ${message.channel}`);
        await this.zigbee.touchlinkIdentify(message.ieee_address, message.channel);
        return utils_1.default.getResponse(message, { ieee_address: message.ieee_address, channel: message.channel }, null);
    }
    async touchlinkFactoryReset(message) {
        let result = false;
        const payload = {};
        if (typeof message === 'object' && message.hasOwnProperty('ieee_address') &&
            message.hasOwnProperty('channel')) {
            logger_1.default.info(`Start Touchlink factory reset of '${message.ieee_address}' on channel ${message.channel}`);
            result = await this.zigbee.touchlinkFactoryReset(message.ieee_address, message.channel);
            payload.ieee_address = message.ieee_address;
            payload.channel = message.channel;
        }
        else {
            logger_1.default.info('Start Touchlink factory reset of first found device');
            result = await this.zigbee.touchlinkFactoryResetFirst();
        }
        if (result) {
            logger_1.default.info('Successfully factory reset device through Touchlink');
            return utils_1.default.getResponse(message, payload, null);
        }
        else {
            logger_1.default.error('Failed to factory reset device through Touchlink');
            throw new Error('Failed to factory reset device through Touchlink');
        }
    }
    async touchlinkScan(message) {
        logger_1.default.info('Start Touchlink scan');
        const result = await this.zigbee.touchlinkScan();
        const found = result.map((r) => {
            return { ieee_address: r.ieeeAddr, channel: r.channel };
        });
        logger_1.default.info('Finished Touchlink scan');
        return utils_1.default.getResponse(message, { found }, null);
    }
    /**
     * Utils
     */
    getValue(message) {
        if (typeof message === 'object') {
            if (!message.hasOwnProperty('value')) {
                throw new Error('No value given');
            }
            return message.value;
        }
        else {
            return message;
        }
    }
    async changeEntityOptions(entityType, message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('id') || !message.hasOwnProperty('options')) {
            throw new Error(`Invalid payload`);
        }
        const cleanup = (o) => {
            delete o.friendlyName;
            delete o.friendly_name;
            delete o.ID;
            delete o.type;
            delete o.devices;
            return o;
        };
        const ID = message.id;
        const entity = this.getEntity(entityType, ID);
        const oldOptions = (0, object_assign_deep_1.default)({}, cleanup(entity.settings));
        settings.changeEntityOptions(ID, message.options);
        const newOptions = cleanup(entity.settings);
        await this.publishInfo();
        logger_1.default.info(`Changed config for ${entityType} ${ID}`);
        return utils_1.default.getResponse(message, { from: oldOptions, to: newOptions, id: ID }, null);
    }
    async deviceConfigureReporting(message) {
        if (typeof message !== 'object' || !message.hasOwnProperty('id') || !message.hasOwnProperty('cluster') ||
            !message.hasOwnProperty('maximum_report_interval') || !message.hasOwnProperty('minimum_report_interval') ||
            !message.hasOwnProperty('reportable_change') || !message.hasOwnProperty('attribute')) {
            throw new Error(`Invalid payload`);
        }
        const parsedID = utils_1.default.parseEntityID(message.id);
        const endpoint = this.getEntity('device', parsedID.ID).endpoint(parsedID.endpoint);
        const coordinatorEndpoint = this.zigbee.firstCoordinatorEndpoint();
        await endpoint.bind(message.cluster, coordinatorEndpoint);
        await endpoint.configureReporting(message.cluster, [{
                attribute: message.attribute, minimumReportInterval: message.minimum_report_interval,
                maximumReportInterval: message.maximum_report_interval, reportableChange: message.reportable_change,
            }]);
        this.publishDevices();
        logger_1.default.info(`Configured reporting for '${message.id}', '${message.cluster}.${message.attribute}'`);
        return utils_1.default.getResponse(message, {
            id: message.id, cluster: message.cluster, maximum_report_interval: message.maximum_report_interval,
            minimum_report_interval: message.minimum_report_interval, reportable_change: message.reportable_change,
            attribute: message.attribute,
        }, null);
    }
    async renameEntity(entityType, message) {
        const deviceAndHasLast = entityType === 'device' && typeof message === 'object' && message.last === true;
        if (typeof message !== 'object' || (!message.hasOwnProperty('from') && !deviceAndHasLast) ||
            !message.hasOwnProperty('to')) {
            throw new Error(`Invalid payload`);
        }
        if (deviceAndHasLast && !this.lastJoinedDeviceIeeeAddr) {
            throw new Error('No device has joined since start');
        }
        const from = deviceAndHasLast ? this.lastJoinedDeviceIeeeAddr : message.from;
        const to = message.to;
        const homeAssisantRename = message.hasOwnProperty('homeassistant_rename') ?
            message.homeassistant_rename : false;
        const entity = this.getEntity(entityType, from);
        const oldFriendlyName = entity.settings.friendly_name;
        settings.changeFriendlyName(from, to);
        // Clear retained messages
        this.mqtt.publish(oldFriendlyName, '', { retain: true });
        if (entity instanceof device_1.default) {
            this.publishDevices();
            this.eventBus.emitDeviceRenamed({ device: entity, homeAssisantRename, from: oldFriendlyName, to });
        }
        else {
            this.publishGroups();
            this.publishInfo();
        }
        // Repulish entity state
        this.publishEntityState(entity, {});
        return utils_1.default.getResponse(message, { from: oldFriendlyName, to, homeassistant_rename: homeAssisantRename }, null);
    }
    async removeEntity(entityType, message) {
        const ID = typeof message === 'object' ? message.id : message.trim();
        const entity = this.getEntity(entityType, ID);
        const friendlyName = entity.name;
        const entityID = entity.ID;
        let block = false;
        let force = false;
        let blockForceLog = '';
        if (entityType === 'device' && typeof message === 'object') {
            block = !!message.block;
            force = !!message.force;
            blockForceLog = ` (block: ${block}, force: ${force})`;
        }
        else if (entityType === 'group' && typeof message === 'object') {
            force = !!message.force;
            blockForceLog = ` (force: ${force})`;
        }
        try {
            logger_1.default.info(`Removing ${entityType} '${entity.name}'${blockForceLog}`);
            const ieeeAddr = entity.isDevice() && entity.ieeeAddr;
            const name = entity.name;
            if (entity instanceof device_1.default) {
                if (block) {
                    settings.blockDevice(entity.ieeeAddr);
                }
                if (force) {
                    await entity.zh.removeFromDatabase();
                }
                else {
                    await entity.zh.removeFromNetwork();
                }
            }
            else {
                if (force) {
                    entity.zh.removeFromDatabase();
                }
                else {
                    await entity.zh.removeFromNetwork();
                }
            }
            // Fire event
            if (entity instanceof device_1.default) {
                this.eventBus.emitDeviceRemoved({ ieeeAddr, name });
            }
            // Remove from configuration.yaml
            if (entity instanceof device_1.default) {
                settings.removeDevice(entityID);
            }
            else {
                settings.removeGroup(entityID);
            }
            // Remove from state
            this.state.remove(entityID);
            // Clear any retained messages
            this.mqtt.publish(friendlyName, '', { retain: true });
            logger_1.default.info(`Successfully removed ${entityType} '${friendlyName}'${blockForceLog}`);
            if (entity instanceof device_1.default) {
                this.publishGroups();
                this.publishDevices();
                return utils_1.default.getResponse(message, { id: ID, block, force }, null);
            }
            else {
                this.publishGroups();
                return utils_1.default.getResponse(message, { id: ID, force: force }, null);
            }
        }
        catch (error) {
            throw new Error(`Failed to remove ${entityType} '${friendlyName}'${blockForceLog} (${error})`);
        }
    }
    getEntity(type, ID) {
        const entity = this.zigbee.resolveEntity(ID);
        if (!entity || entity.constructor.name.toLowerCase() !== type) {
            throw new Error(`${utils_1.default.capitalize(type)} '${ID}' does not exist`);
        }
        return entity;
    }
    async publishInfo() {
        const config = (0, object_assign_deep_1.default)({}, settings.get());
        delete config.advanced.network_key;
        delete config.mqtt.password;
        config.frontend && delete config.frontend.auth_token;
        const payload = {
            version: this.zigbee2mqttVersion.version,
            commit: this.zigbee2mqttVersion.commitHash,
            coordinator: this.coordinatorVersion,
            network: utils_1.default.toSnakeCase(await this.zigbee.getNetworkParameters()),
            log_level: logger_1.default.getLevel(),
            permit_join: this.zigbee.getPermitJoin(),
            permit_join_timeout: this.zigbee.getPermitJoinTimeout(),
            restart_required: this.restartRequired,
            config,
            config_schema: settings.schema,
        };
        await this.mqtt.publish('bridge/info', (0, json_stable_stringify_without_jsonify_1.default)(payload), { retain: true, qos: 0 }, settings.get().mqtt.base_topic, true);
    }
    getScenes(entity) {
        var _a;
        const scenes = {};
        const endpoints = utils_1.default.isEndpoint(entity) ? [entity] : entity.members;
        const groupID = utils_1.default.isEndpoint(entity) ? 0 : entity.groupID;
        for (const endpoint of endpoints) {
            for (const [key, data] of Object.entries(((_a = endpoint.meta) === null || _a === void 0 ? void 0 : _a.scenes) || {})) {
                const split = key.split('_');
                const sceneID = parseInt(split[0], 10);
                const sceneGroupID = parseInt(split[1], 10);
                if (sceneGroupID === groupID) {
                    scenes[sceneID] = { id: sceneID, name: data.name || `Scene ${sceneID}` };
                }
            }
        }
        return Object.values(scenes);
    }
    async publishDevices() {
        const devices = this.zigbee.devices().map((device) => {
            const endpoints = {};
            for (const endpoint of device.zh.endpoints) {
                const data = {
                    scenes: this.getScenes(endpoint),
                    bindings: [],
                    configured_reportings: [],
                    clusters: {
                        input: endpoint.getInputClusters().map((c) => c.name),
                        output: endpoint.getOutputClusters().map((c) => c.name),
                    },
                };
                for (const bind of endpoint.binds) {
                    const target = utils_1.default.isEndpoint(bind.target) ?
                        { type: 'endpoint', ieee_address: bind.target.getDevice().ieeeAddr, endpoint: bind.target.ID } :
                        { type: 'group', id: bind.target.groupID };
                    data.bindings.push({ cluster: bind.cluster.name, target });
                }
                for (const configuredReporting of endpoint.configuredReportings) {
                    data.configured_reportings.push({
                        cluster: configuredReporting.cluster.name,
                        attribute: configuredReporting.attribute.name || configuredReporting.attribute.ID,
                        minimum_report_interval: configuredReporting.minimumReportInterval,
                        maximum_report_interval: configuredReporting.maximumReportInterval,
                        reportable_change: configuredReporting.reportableChange,
                    });
                }
                endpoints[endpoint.ID] = data;
            }
            return {
                ieee_address: device.ieeeAddr,
                type: device.zh.type,
                network_address: device.zh.networkAddress,
                supported: !!device.definition,
                friendly_name: device.name,
                definition: this.getDefinitionPayload(device),
                power_source: device.zh.powerSource,
                software_build_id: device.zh.softwareBuildID,
                date_code: device.zh.dateCode,
                model_id: device.zh.modelID,
                interviewing: device.zh.interviewing,
                interview_completed: device.zh.interviewCompleted,
                manufacturer: device.zh.manufacturerName,
                endpoints,
            };
        });
        await this.mqtt.publish('bridge/devices', (0, json_stable_stringify_without_jsonify_1.default)(devices), { retain: true, qos: 0 }, settings.get().mqtt.base_topic, true);
    }
    async publishGroups() {
        const groups = this.zigbee.groups().map((g) => {
            return {
                id: g.ID,
                friendly_name: g.ID === 901 ? 'default_bind_group' : g.name,
                scenes: this.getScenes(g.zh),
                members: g.zh.members.map((e) => {
                    return { ieee_address: e.getDevice().ieeeAddr, endpoint: e.ID };
                }),
            };
        });
        await this.mqtt.publish('bridge/groups', (0, json_stable_stringify_without_jsonify_1.default)(groups), { retain: true, qos: 0 }, settings.get().mqtt.base_topic, true);
    }
    getDefinitionPayload(device) {
        if (!device.definition)
            return null;
        let icon = device.settings.icon ? device.settings.icon : device.definition.icon;
        if (icon) {
            icon = icon.replace('${zigbeeModel}', utils_1.default.sanitizeImageParameter(device.zh.modelID));
            icon = icon.replace('${model}', utils_1.default.sanitizeImageParameter(device.definition.model));
        }
        return {
            model: device.definition.model,
            vendor: device.definition.vendor,
            description: device.definition.description,
            exposes: device.definition.exposes,
            supports_ota: !!device.definition.ota,
            options: device.definition.options,
            icon,
        };
    }
}
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceOptions", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "groupOptions", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "bridgeOptions", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceRemove", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "groupRemove", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "healthCheck", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "groupAdd", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceRename", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "groupRename", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "restart", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "permitJoin", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "configLastSeen", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "configHomeAssistant", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "configElapsed", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "configLogLevel", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "touchlinkIdentify", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "touchlinkFactoryReset", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "touchlinkScan", null);
__decorate([
    bind_decorator_1.default
], Bridge.prototype, "deviceConfigureReporting", null);
exports.default = Bridge;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnJpZGdlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9icmlkZ2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsOEJBQThCO0FBQzlCLDREQUFvQztBQUNwQywwREFBa0M7QUFDbEMsMkRBQTZDO0FBQzdDLDBFQUEwQztBQUMxQyxvRUFBa0M7QUFDbEMsa0hBQThEO0FBQzlELDRFQUFrRDtBQUNsRCx1REFBOEM7QUFDOUMsNERBQW9DO0FBQ3BDLDZEQUFxQztBQUdyQyxNQUFNLFlBQVksR0FBRyxJQUFJLE1BQU0sQ0FBQyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxzQkFBc0IsQ0FBQyxDQUFDO0FBUXpGLE1BQXFCLE1BQU8sU0FBUSxtQkFBUztJQUE3Qzs7UUFHWSxvQkFBZSxHQUFHLEtBQUssQ0FBQztJQWdxQnBDLENBQUM7SUE1cEJZLEtBQUssQ0FBQyxLQUFLO1FBQ2hCLElBQUksQ0FBQyxhQUFhLEdBQUc7WUFDakIsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLGFBQWE7WUFDcEMsNEJBQTRCLEVBQUUsSUFBSSxDQUFDLHdCQUF3QjtZQUMzRCxlQUFlLEVBQUUsSUFBSSxDQUFDLFlBQVk7WUFDbEMsZUFBZSxFQUFFLElBQUksQ0FBQyxZQUFZO1lBQ2xDLFdBQVcsRUFBRSxJQUFJLENBQUMsUUFBUTtZQUMxQixlQUFlLEVBQUUsSUFBSSxDQUFDLFlBQVk7WUFDbEMsY0FBYyxFQUFFLElBQUksQ0FBQyxXQUFXO1lBQ2hDLGNBQWMsRUFBRSxJQUFJLENBQUMsV0FBVztZQUNoQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFVBQVU7WUFDOUIsU0FBUyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3ZCLHlCQUF5QixFQUFFLElBQUksQ0FBQyxxQkFBcUI7WUFDckQsb0JBQW9CLEVBQUUsSUFBSSxDQUFDLGlCQUFpQjtZQUM1QyxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsYUFBYTtZQUNwQyxjQUFjLEVBQUUsSUFBSSxDQUFDLFdBQVc7WUFDaEMsU0FBUyxFQUFFLElBQUksQ0FBQyxhQUFhO1lBQzdCLHVCQUF1QjtZQUN2QixrQkFBa0IsRUFBRSxJQUFJLENBQUMsY0FBYztZQUN2QyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsbUJBQW1CO1lBQ2hELGdCQUFnQixFQUFFLElBQUksQ0FBQyxhQUFhO1lBQ3BDLGtCQUFrQixFQUFFLElBQUksQ0FBQyxjQUFjO1NBQzFDLENBQUM7UUFFRixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDO1FBQ3ZCLE1BQU0sY0FBZSxTQUFRLDJCQUFTO1lBQ2xDLEdBQUcsQ0FBQyxJQUFzQyxFQUFFLFFBQW9CO2dCQUM1RCxNQUFNLE9BQU8sR0FBRyxJQUFBLCtDQUFTLEVBQUMsRUFBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLEtBQUssRUFBQyxDQUFDLENBQUM7Z0JBQ3RFLElBQUksQ0FBQyxPQUFPLENBQUMsZ0JBQWdCLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDbEYsUUFBUSxFQUFFLENBQUM7WUFDZixDQUFDO1NBQ0o7UUFFRCxnQkFBTSxDQUFDLFlBQVksQ0FBQyxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFFMUMsSUFBSSxDQUFDLGtCQUFrQixHQUFHLE1BQU0sZUFBSyxDQUFDLHFCQUFxQixFQUFFLENBQUM7UUFDOUQsSUFBSSxDQUFDLGtCQUFrQixHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsRUFBRSxDQUFDO1FBRXBFLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUMsQ0FBQztRQUM5RCxJQUFJLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztRQUN0RSxJQUFJLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUM7UUFDeEYsSUFBSSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxJQUFJLElBQUksQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQy9GLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxHQUFHLEVBQUU7WUFDckMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3RCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUN6QixDQUFDLENBQUMsQ0FBQztRQUVILGdCQUFnQjtRQUNoQixNQUFNLFlBQVksR0FBRyxDQUFDLElBQVksRUFBRSxJQUFjLEVBQWlCLEVBQUUsQ0FDakUsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxFQUFFLElBQUEsK0NBQVMsRUFBQyxFQUFDLElBQUksRUFBRSxJQUFJLEVBQUMsQ0FBQyxFQUFFLEVBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFDLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtZQUN4QyxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUM7WUFDckQsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3RCLFlBQVksQ0FBQyxlQUFlLEVBQUUsRUFBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFDLENBQUMsQ0FBQztRQUN6RyxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFO1lBQ3ZDLElBQUksQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUN0QixZQUFZLENBQUMsY0FBYyxFQUFFLEVBQUMsWUFBWSxFQUFFLElBQUksQ0FBQyxRQUFRLEVBQUUsYUFBYSxFQUFFLElBQUksQ0FBQyxJQUFJLEVBQUMsQ0FBQyxDQUFDO1FBQzFGLENBQUMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQyxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFDL0UsSUFBSSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtZQUMzQyxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDdEIsTUFBTSxPQUFPLEdBQ1QsRUFBQyxhQUFhLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLEVBQUUsWUFBWSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFDLENBQUM7WUFDL0YsSUFBSSxJQUFJLENBQUMsTUFBTSxLQUFLLFlBQVksRUFBRTtnQkFDOUIsT0FBTyxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUM7Z0JBQzdDLE9BQU8sQ0FBQyxVQUFVLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUMvRDtZQUNELFlBQVksQ0FBQyxrQkFBa0IsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUM5QyxDQUFDLENBQUMsQ0FBQztRQUNILElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUU7WUFDMUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO1lBQ3RCLFlBQVksQ0FBQyxpQkFBaUIsRUFBRSxFQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUMsQ0FBQyxDQUFDO1FBQzNHLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDekIsTUFBTSxJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFDNUIsTUFBTSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7UUFFM0IsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUMxRCxDQUFDO0lBRUssS0FBSyxDQUFDLGFBQWEsQ0FBQyxJQUEyQjs7UUFDakQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDN0MsTUFBTSxHQUFHLEdBQUcsTUFBQSxLQUFLLGFBQUwsS0FBSyx1QkFBTCxLQUFLLENBQUcsQ0FBQyxDQUFDLDBDQUFFLFdBQVcsRUFBRSxDQUFDO1FBQ3RDLElBQUksR0FBRyxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUU7WUFDM0IsTUFBTSxPQUFPLEdBQUcsZUFBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUU1RCxJQUFJO2dCQUNBLE1BQU0sUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDeEQsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxtQkFBbUIsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsSUFBQSwrQ0FBUyxFQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7YUFDL0U7WUFBQyxPQUFPLEtBQUssRUFBRTtnQkFDWixnQkFBTSxDQUFDLEtBQUssQ0FBQyxZQUFZLElBQUksQ0FBQyxLQUFLLHlCQUF5QixLQUFLLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQztnQkFDOUUsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO2dCQUMxQixNQUFNLFFBQVEsR0FBRyxlQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO2dCQUMvRCxNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLG1CQUFtQixLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxJQUFBLCtDQUFTLEVBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQzthQUMvRTtTQUNKO0lBQ0wsQ0FBQztJQUVEOztPQUVHO0lBRUcsS0FBSyxDQUFDLGFBQWEsQ0FBQyxPQUEwQjtRQUNoRCxPQUFPLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDdkQsQ0FBQztJQUVLLEtBQUssQ0FBQyxZQUFZLENBQUMsT0FBMEI7UUFDL0MsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFSyxLQUFLLENBQUMsYUFBYSxDQUFDLE9BQTBCO1FBQ2hELElBQUksT0FBTyxPQUFPLEtBQUssUUFBUSxJQUFJLE9BQU8sT0FBTyxDQUFDLE9BQU8sS0FBSyxRQUFRLEVBQUU7WUFDcEUsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1NBQ3RDO1FBRUQsTUFBTSxJQUFJLEdBQWEsSUFBQSwrQkFBWSxFQUFDLFFBQVEsQ0FBQyxHQUFHLEVBQUUsRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFckUsaUZBQWlGO1FBQ2pGLE1BQU0sY0FBYyxHQUFHLENBQUMsT0FBaUIsRUFBRSxPQUFpQixFQUFRLEVBQUU7WUFDbEUsS0FBSyxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFO2dCQUNwQyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksT0FBTyxDQUFDLEVBQUU7b0JBQ25CLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2lCQUN2QjtxQkFBTSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtvQkFDckMsY0FBYyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztpQkFDOUM7YUFDSjtRQUNMLENBQUMsQ0FBQztRQUNGLGNBQWMsQ0FBQyxPQUFPLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUU5QyxNQUFNLFdBQVcsR0FBRyxJQUFBLDRCQUFnQixFQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRWpGLDRFQUE0RTtRQUM1RSxNQUFNLGdCQUFnQixHQUFHLENBQUMsTUFBZ0IsRUFBRSxLQUFlLEVBQVEsRUFBRTtZQUNqRSxLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsVUFBVSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDbkQsTUFBTSxXQUFXLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNoQyxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLEVBQUU7b0JBQzVCLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxXQUFXLENBQUM7aUJBQzVCO3FCQUFNLElBQUksVUFBVSxJQUFJLE9BQU8sV0FBVyxLQUFLLFFBQVEsRUFBRTtvQkFDdEQsZ0JBQWdCLENBQUMsV0FBVyxFQUFFLFVBQVUsQ0FBQyxDQUFDO2lCQUM3QzthQUNKO1FBQ0wsQ0FBQyxDQUFDO1FBQ0YsZ0JBQWdCLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxXQUFXLENBQUMsQ0FBQztRQUUvQyxNQUFNLGVBQWUsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQ3BELElBQUksZUFBZTtZQUFFLElBQUksQ0FBQyxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBRWpELGtDQUFrQztRQUNsQyxJQUFJLFdBQVcsQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDLEVBQUU7WUFDM0MsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsV0FBVyxDQUFDLENBQUM7U0FDekQ7UUFFRCxJQUFJLFdBQVcsQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLEVBQUU7WUFDN0MsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsV0FBVyxDQUFDLGFBQWEsRUFBRSxlQUFlLENBQUMsQ0FBQztTQUNqRjtRQUVELElBQUksV0FBVyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxXQUFXLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsRUFBRTtZQUM1RixnQkFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1NBQ25EO1FBRUQsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsQ0FBQztRQUMzQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkIsT0FBTyxlQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxlQUFlLEVBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN0RixDQUFDO0lBRUssS0FBSyxDQUFDLFlBQVksQ0FBQyxPQUEwQjtRQUMvQyxPQUFPLElBQUksQ0FBQyxZQUFZLENBQUMsUUFBUSxFQUFFLE9BQU8sQ0FBQyxDQUFDO0lBQ2hELENBQUM7SUFFSyxLQUFLLENBQUMsV0FBVyxDQUFDLE9BQTBCO1FBQzlDLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVLLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBMEI7UUFDOUMsT0FBTyxlQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRUssS0FBSyxDQUFDLFFBQVEsQ0FBQyxPQUEwQjtRQUMzQyxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsZUFBZSxDQUFDLEVBQUU7WUFDekUsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1NBQ3RDO1FBRUQsTUFBTSxZQUFZLEdBQUcsT0FBTyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDbkYsTUFBTSxFQUFFLEdBQUcsT0FBTyxPQUFPLEtBQUssUUFBUSxJQUFJLE9BQU8sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztRQUMzRixNQUFNLEtBQUssR0FBRyxRQUFRLENBQUMsUUFBUSxDQUFDLFlBQVksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUNsRCxJQUFJLENBQUMsTUFBTSxDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbEMsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ3JCLE9BQU8sZUFBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLGFBQWEsRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLEVBQUUsRUFBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFFSyxLQUFLLENBQUMsWUFBWSxDQUFDLE9BQTBCO1FBQy9DLE9BQU8sSUFBSSxDQUFDLFlBQVksQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDaEQsQ0FBQztJQUVLLEtBQUssQ0FBQyxXQUFXLENBQUMsT0FBMEI7UUFDOUMsT0FBTyxJQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztJQUMvQyxDQUFDO0lBRUssS0FBSyxDQUFDLE9BQU8sQ0FBQyxPQUEwQjtRQUMxQyx5REFBeUQ7UUFDekQsVUFBVSxDQUFDLElBQUksQ0FBQyxlQUFlLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFDdEMsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUN0QyxPQUFPLGVBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRUssS0FBSyxDQUFDLFVBQVUsQ0FBQyxPQUEwQjtRQUM3QyxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUU7WUFDakUsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1NBQ3RDO1FBRUQsSUFBSSxLQUF1QixDQUFDO1FBQzVCLElBQUksSUFBWSxDQUFDO1FBQ2pCLElBQUksTUFBTSxHQUFXLElBQUksQ0FBQztRQUMxQixJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsRUFBRTtZQUM3QixLQUFLLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQztZQUN0QixJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztZQUNwQixJQUFJLE9BQU8sQ0FBQyxNQUFNLEVBQUU7Z0JBQ2hCLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQztnQkFDM0QsSUFBSSxRQUFRLFlBQVksZ0JBQU0sRUFBRTtvQkFDNUIsTUFBTSxHQUFHLFFBQVEsQ0FBQztpQkFDckI7cUJBQU07b0JBQ0gsTUFBTSxJQUFJLEtBQUssQ0FBQyxXQUFXLE9BQU8sQ0FBQyxNQUFNLGtCQUFrQixDQUFDLENBQUM7aUJBQ2hFO2FBQ0o7U0FDSjthQUFNO1lBQ0gsS0FBSyxHQUFHLE9BQU8sQ0FBQztTQUNuQjtRQUVELElBQUksT0FBTyxLQUFLLEtBQUssUUFBUSxFQUFFO1lBQzNCLEtBQUssR0FBRyxLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssTUFBTSxDQUFDO1NBQzFDO1FBRUQsTUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUFDO1FBQ2xELE1BQU0sUUFBUSxHQUFxRCxFQUFDLEtBQUssRUFBQyxDQUFDO1FBQzNFLElBQUksTUFBTSxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVE7WUFBRSxRQUFRLENBQUMsTUFBTSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUM7UUFDNUUsSUFBSSxJQUFJLElBQUksT0FBTyxPQUFPLEtBQUssUUFBUTtZQUFFLFFBQVEsQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUN0RSxPQUFPLGVBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN0RCxDQUFDO0lBRUQsYUFBYTtJQUNQLEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBMEI7UUFDakQsTUFBTSxPQUFPLEdBQUcsQ0FBQyxTQUFTLEVBQUUsVUFBVSxFQUFFLE9BQU8sRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ25FLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDckMsSUFBSSxPQUFPLEtBQUssS0FBSyxRQUFRLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3ZELE1BQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLHVDQUF1QyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1NBQzlFO1FBRUQsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLFVBQVUsRUFBRSxXQUFXLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvQyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkIsT0FBTyxlQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFDLEtBQUssRUFBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRCxhQUFhO0lBQ1AsS0FBSyxDQUFDLG1CQUFtQixDQUFDLE9BQTBCO1FBQ3RELE1BQU0sT0FBTyxHQUFHLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlCLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDckMsSUFBSSxPQUFPLEtBQUssS0FBSyxTQUFTLElBQUksQ0FBQyxPQUFPLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQ3hELE1BQU0sSUFBSSxLQUFLLENBQUMsSUFBSSxLQUFLLHVDQUF1QyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1NBQzlFO1FBRUQsTUFBTSxJQUFJLENBQUMsc0JBQXNCLENBQUMsS0FBSyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQzFELFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxlQUFlLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN2QyxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkIsT0FBTyxlQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFDLEtBQUssRUFBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFRCxhQUFhO0lBQ1AsS0FBSyxDQUFDLGFBQWEsQ0FBQyxPQUEwQjtRQUNoRCxNQUFNLE9BQU8sR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUM5QixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ3JDLElBQUksT0FBTyxLQUFLLEtBQUssU0FBUyxJQUFJLENBQUMsT0FBTyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUN4RCxNQUFNLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyx1Q0FBdUMsT0FBTyxFQUFFLENBQUMsQ0FBQztTQUM5RTtRQUVELFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQyxVQUFVLEVBQUUsU0FBUyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1FBQ25CLE9BQU8sZUFBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBQyxLQUFLLEVBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQsYUFBYTtJQUNQLEtBQUssQ0FBQyxjQUFjLENBQUMsT0FBMEI7UUFDakQsTUFBTSxPQUFPLEdBQUcsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxPQUFPLENBQUMsQ0FBQztRQUNuRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBd0MsQ0FBQztRQUM1RSxJQUFJLE9BQU8sS0FBSyxLQUFLLFFBQVEsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEVBQUU7WUFDdkQsTUFBTSxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssdUNBQXVDLE9BQU8sRUFBRSxDQUFDLENBQUM7U0FDOUU7UUFFRCxnQkFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2QixJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDbkIsT0FBTyxlQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFDLEtBQUssRUFBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3JELENBQUM7SUFFSyxLQUFLLENBQUMsaUJBQWlCLENBQUMsT0FBMEI7UUFDcEQsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQztZQUN0RSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDcEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1NBQ3RDO1FBRUQsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsZ0NBQWdDLE9BQU8sQ0FBQyxZQUFZLGdCQUFnQixPQUFPLENBQUMsT0FBTyxFQUFFLENBQUMsQ0FBQztRQUNuRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDM0UsT0FBTyxlQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxFQUFDLFlBQVksRUFBRSxPQUFPLENBQUMsWUFBWSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTyxFQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDNUcsQ0FBQztJQUVLLEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxPQUEwQjtRQUN4RCxJQUFJLE1BQU0sR0FBRyxLQUFLLENBQUM7UUFDbkIsTUFBTSxPQUFPLEdBQThDLEVBQUUsQ0FBQztRQUM5RCxJQUFJLE9BQU8sT0FBTyxLQUFLLFFBQVEsSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQztZQUNyRSxPQUFPLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQ25DLGdCQUFNLENBQUMsSUFBSSxDQUFDLHFDQUFxQyxPQUFPLENBQUMsWUFBWSxnQkFBZ0IsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUM7WUFDeEcsTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsWUFBWSxFQUFFLE9BQU8sQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN4RixPQUFPLENBQUMsWUFBWSxHQUFHLE9BQU8sQ0FBQyxZQUFZLENBQUM7WUFDNUMsT0FBTyxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO1NBQ3JDO2FBQU07WUFDSCxnQkFBTSxDQUFDLElBQUksQ0FBQyxxREFBcUQsQ0FBQyxDQUFDO1lBQ25FLE1BQU0sR0FBRyxNQUFNLElBQUksQ0FBQyxNQUFNLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztTQUMzRDtRQUVELElBQUksTUFBTSxFQUFFO1lBQ1IsZ0JBQU0sQ0FBQyxJQUFJLENBQUMscURBQXFELENBQUMsQ0FBQztZQUNuRSxPQUFPLGVBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztTQUNwRDthQUFNO1lBQ0gsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsa0RBQWtELENBQUMsQ0FBQztZQUNqRSxNQUFNLElBQUksS0FBSyxDQUFDLGtEQUFrRCxDQUFDLENBQUM7U0FDdkU7SUFDTCxDQUFDO0lBRUssS0FBSyxDQUFDLGFBQWEsQ0FBQyxPQUEwQjtRQUNoRCxnQkFBTSxDQUFDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3BDLE1BQU0sTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNqRCxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUU7WUFDM0IsT0FBTyxFQUFDLFlBQVksRUFBRSxDQUFDLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxDQUFDLENBQUMsT0FBTyxFQUFDLENBQUM7UUFDMUQsQ0FBQyxDQUFDLENBQUM7UUFDSCxnQkFBTSxDQUFDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxDQUFDO1FBQ3ZDLE9BQU8sZUFBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBQyxLQUFLLEVBQUMsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNyRCxDQUFDO0lBRUQ7O09BRUc7SUFFSCxRQUFRLENBQUMsT0FBMEI7UUFDL0IsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUU7WUFDN0IsSUFBSSxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ2xDLE1BQU0sSUFBSSxLQUFLLENBQUMsZ0JBQWdCLENBQUMsQ0FBQzthQUNyQztZQUVELE9BQU8sT0FBTyxDQUFDLEtBQUssQ0FBQztTQUN4QjthQUFNO1lBQ0gsT0FBTyxPQUFPLENBQUM7U0FDbEI7SUFDTCxDQUFDO0lBRUQsS0FBSyxDQUFDLG1CQUFtQixDQUFDLFVBQThCLEVBQUUsT0FBMEI7UUFDaEYsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUNwRyxNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7U0FDdEM7UUFFRCxNQUFNLE9BQU8sR0FBRyxDQUFDLENBQVcsRUFBWSxFQUFFO1lBQ3RDLE9BQU8sQ0FBQyxDQUFDLFlBQVksQ0FBQztZQUFDLE9BQU8sQ0FBQyxDQUFDLGFBQWEsQ0FBQztZQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQztZQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQztZQUFDLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FBQztZQUM1RixPQUFPLENBQUMsQ0FBQztRQUNiLENBQUMsQ0FBQztRQUVGLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDdEIsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUMsTUFBTSxVQUFVLEdBQUcsSUFBQSw0QkFBZ0IsRUFBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ2xFLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2xELE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUMsTUFBTSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7UUFFekIsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsc0JBQXNCLFVBQVUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXRELE9BQU8sZUFBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBQyxJQUFJLEVBQUUsVUFBVSxFQUFFLEVBQUUsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBQyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQ3hGLENBQUM7SUFFSyxLQUFLLENBQUMsd0JBQXdCLENBQUMsT0FBMEI7UUFDM0QsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxTQUFTLENBQUM7WUFDbEcsQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsY0FBYyxDQUFDLHlCQUF5QixDQUFDO1lBQ3hHLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxXQUFXLENBQUMsRUFBRTtZQUN0RixNQUFNLElBQUksS0FBSyxDQUFDLGlCQUFpQixDQUFDLENBQUM7U0FDdEM7UUFFRCxNQUFNLFFBQVEsR0FBRyxlQUFLLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNqRCxNQUFNLFFBQVEsR0FBSSxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUMsRUFBRSxDQUFZLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUUvRixNQUFNLG1CQUFtQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsd0JBQXdCLEVBQUUsQ0FBQztRQUNuRSxNQUFNLFFBQVEsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO1FBRTFELE1BQU0sUUFBUSxDQUFDLGtCQUFrQixDQUFDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztnQkFDaEQsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTLEVBQUUscUJBQXFCLEVBQUUsT0FBTyxDQUFDLHVCQUF1QjtnQkFDcEYscUJBQXFCLEVBQUUsT0FBTyxDQUFDLHVCQUF1QixFQUFFLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxpQkFBaUI7YUFDdEcsQ0FBQyxDQUFDLENBQUM7UUFFSixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7UUFFdEIsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsNkJBQTZCLE9BQU8sQ0FBQyxFQUFFLE9BQU8sT0FBTyxDQUFDLE9BQU8sSUFBSSxPQUFPLENBQUMsU0FBUyxHQUFHLENBQUMsQ0FBQztRQUVuRyxPQUFPLGVBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFO1lBQzlCLEVBQUUsRUFBRSxPQUFPLENBQUMsRUFBRSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE9BQU8sQ0FBQyx1QkFBdUI7WUFDbEcsdUJBQXVCLEVBQUUsT0FBTyxDQUFDLHVCQUF1QixFQUFFLGlCQUFpQixFQUFFLE9BQU8sQ0FBQyxpQkFBaUI7WUFDdEcsU0FBUyxFQUFFLE9BQU8sQ0FBQyxTQUFTO1NBQy9CLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDYixDQUFDO0lBRUQsS0FBSyxDQUFDLFlBQVksQ0FBQyxVQUE4QixFQUFFLE9BQTBCO1FBQ3pFLE1BQU0sZ0JBQWdCLEdBQUcsVUFBVSxLQUFLLFFBQVEsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLElBQUksT0FBTyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUM7UUFDekcsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQztZQUNyRixDQUFDLE9BQU8sQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDL0IsTUFBTSxJQUFJLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1NBQ3RDO1FBRUQsSUFBSSxnQkFBZ0IsSUFBSSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRTtZQUNwRCxNQUFNLElBQUksS0FBSyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7U0FDdkQ7UUFFRCxNQUFNLElBQUksR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLHdCQUF3QixDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDO1FBQzdFLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxFQUFFLENBQUM7UUFDdEIsTUFBTSxrQkFBa0IsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztZQUN2RSxPQUFPLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztRQUN6QyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNoRCxNQUFNLGVBQWUsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQztRQUV0RCxRQUFRLENBQUMsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRXRDLDBCQUEwQjtRQUMxQixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxlQUFlLEVBQUUsRUFBRSxFQUFFLEVBQUMsTUFBTSxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7UUFFdkQsSUFBSSxNQUFNLFlBQVksZ0JBQU0sRUFBRTtZQUMxQixJQUFJLENBQUMsY0FBYyxFQUFFLENBQUM7WUFDdEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsa0JBQWtCLEVBQUUsSUFBSSxFQUFFLGVBQWUsRUFBRSxFQUFFLEVBQUMsQ0FBQyxDQUFDO1NBQ3BHO2FBQU07WUFDSCxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDckIsSUFBSSxDQUFDLFdBQVcsRUFBRSxDQUFDO1NBQ3RCO1FBRUQsd0JBQXdCO1FBQ3hCLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFcEMsT0FBTyxlQUFLLENBQUMsV0FBVyxDQUNwQixPQUFPLEVBQ1AsRUFBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLEVBQUUsRUFBRSxvQkFBb0IsRUFBRSxrQkFBa0IsRUFBQyxFQUNyRSxJQUFJLENBQ1AsQ0FBQztJQUNOLENBQUM7SUFFRCxLQUFLLENBQUMsWUFBWSxDQUFDLFVBQThCLEVBQUUsT0FBMEI7UUFDekUsTUFBTSxFQUFFLEdBQUcsT0FBTyxPQUFPLEtBQUssUUFBUSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDckUsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxVQUFVLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDOUMsTUFBTSxZQUFZLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQztRQUNqQyxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsRUFBRSxDQUFDO1FBRTNCLElBQUksS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNsQixJQUFJLEtBQUssR0FBRyxLQUFLLENBQUM7UUFDbEIsSUFBSSxhQUFhLEdBQUcsRUFBRSxDQUFDO1FBRXZCLElBQUksVUFBVSxLQUFLLFFBQVEsSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUU7WUFDeEQsS0FBSyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDO1lBQ3hCLEtBQUssR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztZQUN4QixhQUFhLEdBQUcsWUFBWSxLQUFLLFlBQVksS0FBSyxHQUFHLENBQUM7U0FDekQ7YUFBTSxJQUFJLFVBQVUsS0FBSyxPQUFPLElBQUksT0FBTyxPQUFPLEtBQUssUUFBUSxFQUFFO1lBQzlELEtBQUssR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQztZQUN4QixhQUFhLEdBQUcsWUFBWSxLQUFLLEdBQUcsQ0FBQztTQUN4QztRQUVELElBQUk7WUFDQSxnQkFBTSxDQUFDLElBQUksQ0FBQyxZQUFZLFVBQVUsS0FBSyxNQUFNLENBQUMsSUFBSSxJQUFJLGFBQWEsRUFBRSxDQUFDLENBQUM7WUFDdkUsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLFFBQVEsRUFBRSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUM7WUFDdEQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQztZQUV6QixJQUFJLE1BQU0sWUFBWSxnQkFBTSxFQUFFO2dCQUMxQixJQUFJLEtBQUssRUFBRTtvQkFDUCxRQUFRLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztpQkFDekM7Z0JBRUQsSUFBSSxLQUFLLEVBQUU7b0JBQ1AsTUFBTSxNQUFNLENBQUMsRUFBRSxDQUFDLGtCQUFrQixFQUFFLENBQUM7aUJBQ3hDO3FCQUFNO29CQUNILE1BQU0sTUFBTSxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO2lCQUN2QzthQUNKO2lCQUFNO2dCQUNILElBQUksS0FBSyxFQUFFO29CQUNQLE1BQU0sQ0FBQyxFQUFFLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztpQkFDbEM7cUJBQU07b0JBQ0gsTUFBTSxNQUFNLENBQUMsRUFBRSxDQUFDLGlCQUFpQixFQUFFLENBQUM7aUJBQ3ZDO2FBQ0o7WUFFRCxhQUFhO1lBQ2IsSUFBSSxNQUFNLFlBQVksZ0JBQU0sRUFBRTtnQkFDMUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUMsQ0FBQyxDQUFDO2FBQ3JEO1lBRUQsaUNBQWlDO1lBQ2pDLElBQUksTUFBTSxZQUFZLGdCQUFNLEVBQUU7Z0JBQzFCLFFBQVEsQ0FBQyxZQUFZLENBQUMsUUFBa0IsQ0FBQyxDQUFDO2FBQzdDO2lCQUFNO2dCQUNILFFBQVEsQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLENBQUM7YUFDbEM7WUFFRCxvQkFBb0I7WUFDcEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFNUIsOEJBQThCO1lBQzlCLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxFQUFFLEVBQUUsRUFBQyxNQUFNLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FBQztZQUVwRCxnQkFBTSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsVUFBVSxLQUFLLFlBQVksSUFBSSxhQUFhLEVBQUUsQ0FBQyxDQUFDO1lBRXBGLElBQUksTUFBTSxZQUFZLGdCQUFNLEVBQUU7Z0JBQzFCLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDckIsSUFBSSxDQUFDLGNBQWMsRUFBRSxDQUFDO2dCQUN0QixPQUFPLGVBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFDbkU7aUJBQU07Z0JBQ0gsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUNyQixPQUFPLGVBQUssQ0FBQyxXQUFXLENBQUMsT0FBTyxFQUFFLEVBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFDLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFDbkU7U0FDSjtRQUFDLE9BQU8sS0FBSyxFQUFFO1lBQ1osTUFBTSxJQUFJLEtBQUssQ0FDWCxvQkFBb0IsVUFBVSxLQUFLLFlBQVksSUFBSSxhQUFhLEtBQUssS0FBSyxHQUFHLENBQ2hGLENBQUM7U0FDTDtJQUNMLENBQUM7SUFFRCxTQUFTLENBQUMsSUFBd0IsRUFBRSxFQUFVO1FBQzFDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxNQUFNLElBQUksTUFBTSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsV0FBVyxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzNELE1BQU0sSUFBSSxLQUFLLENBQUMsR0FBRyxlQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztTQUN2RTtRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2xCLENBQUM7SUFFRCxLQUFLLENBQUMsV0FBVztRQUNiLE1BQU0sTUFBTSxHQUFHLElBQUEsNEJBQWdCLEVBQUMsRUFBRSxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1FBQ3BELE9BQU8sTUFBTSxDQUFDLFFBQVEsQ0FBQyxXQUFXLENBQUM7UUFDbkMsT0FBTyxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUM1QixNQUFNLENBQUMsUUFBUSxJQUFJLE9BQU8sTUFBTSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7UUFDckQsTUFBTSxPQUFPLEdBQUc7WUFDWixPQUFPLEVBQUUsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE9BQU87WUFDeEMsTUFBTSxFQUFFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVO1lBQzFDLFdBQVcsRUFBRSxJQUFJLENBQUMsa0JBQWtCO1lBQ3BDLE9BQU8sRUFBRSxlQUFLLENBQUMsV0FBVyxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO1lBQ3BFLFNBQVMsRUFBRSxnQkFBTSxDQUFDLFFBQVEsRUFBRTtZQUM1QixXQUFXLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxhQUFhLEVBQUU7WUFDeEMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsRUFBRTtZQUN2RCxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsZUFBZTtZQUN0QyxNQUFNO1lBQ04sYUFBYSxFQUFFLFFBQVEsQ0FBQyxNQUFNO1NBQ2pDLENBQUM7UUFFRixNQUFNLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUNuQixhQUFhLEVBQUUsSUFBQSwrQ0FBUyxFQUFDLE9BQU8sQ0FBQyxFQUFFLEVBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDekcsQ0FBQztJQUVPLFNBQVMsQ0FBQyxNQUE4Qjs7UUFDNUMsTUFBTSxNQUFNLEdBQTBCLEVBQUUsQ0FBQztRQUN6QyxNQUFNLFNBQVMsR0FBRyxlQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDO1FBQ3ZFLE1BQU0sT0FBTyxHQUFHLGVBQUssQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQztRQUU5RCxLQUFLLE1BQU0sUUFBUSxJQUFJLFNBQVMsRUFBRTtZQUM5QixLQUFLLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxDQUFDLElBQUksTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFBLE1BQUEsUUFBUSxDQUFDLElBQUksMENBQUUsTUFBTSxLQUFJLEVBQUUsQ0FBQyxFQUFFO2dCQUNuRSxNQUFNLEtBQUssR0FBRyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUM3QixNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN2QyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1QyxJQUFJLFlBQVksS0FBSyxPQUFPLEVBQUU7b0JBQzFCLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFDLEVBQUUsRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFHLElBQWlCLENBQUMsSUFBSSxJQUFJLFNBQVMsT0FBTyxFQUFFLEVBQUMsQ0FBQztpQkFDeEY7YUFDSjtTQUNKO1FBRUQsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0lBQ2pDLENBQUM7SUFFRCxLQUFLLENBQUMsY0FBYztRQVFoQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFO1lBQ2pELE1BQU0sU0FBUyxHQUF3QixFQUFFLENBQUM7WUFDMUMsS0FBSyxNQUFNLFFBQVEsSUFBSSxNQUFNLENBQUMsRUFBRSxDQUFDLFNBQVMsRUFBRTtnQkFDeEMsTUFBTSxJQUFJLEdBQVM7b0JBQ2YsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDO29CQUNoQyxRQUFRLEVBQUUsRUFBRTtvQkFDWixxQkFBcUIsRUFBRSxFQUFFO29CQUN6QixRQUFRLEVBQUU7d0JBQ04sS0FBSyxFQUFFLFFBQVEsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQzt3QkFDckQsTUFBTSxFQUFFLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQztxQkFDMUQ7aUJBQ0osQ0FBQztnQkFFRixLQUFLLE1BQU0sSUFBSSxJQUFJLFFBQVEsQ0FBQyxLQUFLLEVBQUU7b0JBQy9CLE1BQU0sTUFBTSxHQUFHLGVBQUssQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7d0JBQzFDLEVBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxZQUFZLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxTQUFTLEVBQUUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFDLENBQUMsQ0FBQzt3QkFDOUYsRUFBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBQyxDQUFDO29CQUM3QyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxFQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxNQUFNLEVBQUMsQ0FBQyxDQUFDO2lCQUM1RDtnQkFFRCxLQUFLLE1BQU0sbUJBQW1CLElBQUksUUFBUSxDQUFDLG9CQUFvQixFQUFFO29CQUM3RCxJQUFJLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDO3dCQUM1QixPQUFPLEVBQUUsbUJBQW1CLENBQUMsT0FBTyxDQUFDLElBQUk7d0JBQ3pDLFNBQVMsRUFBRSxtQkFBbUIsQ0FBQyxTQUFTLENBQUMsSUFBSSxJQUFJLG1CQUFtQixDQUFDLFNBQVMsQ0FBQyxFQUFFO3dCQUNqRix1QkFBdUIsRUFBRSxtQkFBbUIsQ0FBQyxxQkFBcUI7d0JBQ2xFLHVCQUF1QixFQUFFLG1CQUFtQixDQUFDLHFCQUFxQjt3QkFDbEUsaUJBQWlCLEVBQUUsbUJBQW1CLENBQUMsZ0JBQWdCO3FCQUMxRCxDQUFDLENBQUM7aUJBQ047Z0JBRUQsU0FBUyxDQUFDLFFBQVEsQ0FBQyxFQUFFLENBQUMsR0FBRyxJQUFJLENBQUM7YUFDakM7WUFFRCxPQUFPO2dCQUNILFlBQVksRUFBRSxNQUFNLENBQUMsUUFBUTtnQkFDN0IsSUFBSSxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSTtnQkFDcEIsZUFBZSxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsY0FBYztnQkFDekMsU0FBUyxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsVUFBVTtnQkFDOUIsYUFBYSxFQUFFLE1BQU0sQ0FBQyxJQUFJO2dCQUMxQixVQUFVLEVBQUUsSUFBSSxDQUFDLG9CQUFvQixDQUFDLE1BQU0sQ0FBQztnQkFDN0MsWUFBWSxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsV0FBVztnQkFDbkMsaUJBQWlCLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxlQUFlO2dCQUM1QyxTQUFTLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRO2dCQUM3QixRQUFRLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPO2dCQUMzQixZQUFZLEVBQUUsTUFBTSxDQUFDLEVBQUUsQ0FBQyxZQUFZO2dCQUNwQyxtQkFBbUIsRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLGtCQUFrQjtnQkFDakQsWUFBWSxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsZ0JBQWdCO2dCQUN4QyxTQUFTO2FBQ1osQ0FBQztRQUNOLENBQUMsQ0FBQyxDQUFDO1FBRUgsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxJQUFBLCtDQUFTLEVBQUMsT0FBTyxDQUFDLEVBQ3hELEVBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFDLEVBQUUsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVELEtBQUssQ0FBQyxhQUFhO1FBQ2YsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRTtZQUMxQyxPQUFPO2dCQUNILEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBRTtnQkFDUixhQUFhLEVBQUUsQ0FBQyxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSTtnQkFDM0QsTUFBTSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDNUIsT0FBTyxFQUFFLENBQUMsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFO29CQUM1QixPQUFPLEVBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxTQUFTLEVBQUUsQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxFQUFFLEVBQUMsQ0FBQztnQkFDbEUsQ0FBQyxDQUFDO2FBQ0wsQ0FBQztRQUNOLENBQUMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FDbkIsZUFBZSxFQUFFLElBQUEsK0NBQVMsRUFBQyxNQUFNLENBQUMsRUFBRSxFQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBQyxFQUFFLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzFHLENBQUM7SUFFRCxvQkFBb0IsQ0FBQyxNQUFjO1FBQy9CLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVTtZQUFFLE9BQU8sSUFBSSxDQUFDO1FBQ3BDLElBQUksSUFBSSxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7UUFDaEYsSUFBSSxJQUFJLEVBQUU7WUFDTixJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxnQkFBZ0IsRUFBRSxlQUFLLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3ZGLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFVBQVUsRUFBRSxlQUFLLENBQUMsc0JBQXNCLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1NBQzFGO1FBRUQsT0FBTztZQUNILEtBQUssRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLEtBQUs7WUFDOUIsTUFBTSxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsTUFBTTtZQUNoQyxXQUFXLEVBQUUsTUFBTSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1lBQzFDLE9BQU8sRUFBRSxNQUFNLENBQUMsVUFBVSxDQUFDLE9BQU87WUFDbEMsWUFBWSxFQUFFLENBQUMsQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUc7WUFDckMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxVQUFVLENBQUMsT0FBTztZQUNsQyxJQUFJO1NBQ1AsQ0FBQztJQUNOLENBQUM7Q0FDSjtBQTFrQlM7SUFBTCx3QkFBSTsyQ0FnQko7QUFNSztJQUFMLHdCQUFJOzJDQUVKO0FBRUs7SUFBTCx3QkFBSTswQ0FFSjtBQUVLO0lBQUwsd0JBQUk7MkNBcURKO0FBRUs7SUFBTCx3QkFBSTswQ0FFSjtBQUVLO0lBQUwsd0JBQUk7eUNBRUo7QUFFSztJQUFMLHdCQUFJO3lDQUVKO0FBRUs7SUFBTCx3QkFBSTtzQ0FXSjtBQUVLO0lBQUwsd0JBQUk7MENBRUo7QUFFSztJQUFMLHdCQUFJO3lDQUVKO0FBRUs7SUFBTCx3QkFBSTtxQ0FLSjtBQUVLO0lBQUwsd0JBQUk7d0NBZ0NKO0FBR0s7SUFBTCx3QkFBSTs0Q0FVSjtBQUdLO0lBQUwsd0JBQUk7aURBV0o7QUFHSztJQUFMLHdCQUFJOzJDQVVKO0FBR0s7SUFBTCx3QkFBSTs0Q0FVSjtBQUVLO0lBQUwsd0JBQUk7K0NBU0o7QUFFSztJQUFMLHdCQUFJO21EQXFCSjtBQUVLO0lBQUwsd0JBQUk7MkNBUUo7QUF3Q0s7SUFBTCx3QkFBSTtzREEyQko7QUExWkwseUJBbXFCQyJ9