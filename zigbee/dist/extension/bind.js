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
const settings = __importStar(require("../util/settings"));
const logger_1 = __importDefault(require("../util/logger"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const debounce_1 = __importDefault(require("debounce"));
const zigbeeHerdsman = __importStar(require("zigbee-herdsman/dist"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const device_1 = __importDefault(require("../model/device"));
const group_1 = __importDefault(require("../model/group"));
const legacyApi = settings.get().advanced.legacy_api;
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/(bind|unbind)`);
const clusterCandidates = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl', 'closuresWindowCovering',
    'hvacThermostat', 'msIlluminanceMeasurement', 'msTemperatureMeasurement', 'msRelativeHumidity',
    'msSoilMoisture', 'msCO2'];
// See zigbee-herdsman-converters
const defaultBindGroup = { type: 'group_number', ID: 901, name: 'default_bind_group' };
const defaultReportConfiguration = {
    minimumReportInterval: 5, maximumReportInterval: 3600, reportableChange: 1,
};
const getColorCapabilities = async (endpoint) => {
    if (endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities') == null) {
        await endpoint.read('lightingColorCtrl', ['colorCapabilities']);
    }
    const value = endpoint.getClusterAttributeValue('lightingColorCtrl', 'colorCapabilities');
    return {
        colorTemperature: (value & 1 << 4) > 0,
        colorXY: (value & 1 << 3) > 0,
    };
};
const reportClusters = {
    'genOnOff': [
        { attribute: 'onOff', ...defaultReportConfiguration, minimumReportInterval: 0, reportableChange: 0 },
    ],
    'genLevelCtrl': [
        { attribute: 'currentLevel', ...defaultReportConfiguration },
    ],
    'lightingColorCtrl': [
        {
            attribute: 'colorTemperature', ...defaultReportConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorTemperature,
        },
        {
            attribute: 'currentX', ...defaultReportConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
        {
            attribute: 'currentY', ...defaultReportConfiguration,
            condition: async (endpoint) => (await getColorCapabilities(endpoint)).colorXY,
        },
    ],
    'closuresWindowCovering': [
        { attribute: 'currentPositionLiftPercentage', ...defaultReportConfiguration },
        { attribute: 'currentPositionTiltPercentage', ...defaultReportConfiguration },
    ],
};
const pollOnMessage = [
    {
        // On messages that have the cluster and type of below
        cluster: {
            manuSpecificPhilips: [
                { type: 'commandHueNotification', data: { button: 2 } },
                { type: 'commandHueNotification', data: { button: 3 } },
            ],
            genLevelCtrl: [
                { type: 'commandStep', data: {} },
                { type: 'commandStepWithOnOff', data: {} },
                { type: 'commandStop', data: {} },
                { type: 'commandMoveWithOnOff', data: {} },
                { type: 'commandStopWithOnOff', data: {} },
                { type: 'commandMove', data: {} },
                { type: 'commandMoveToLevelWithOnOff', data: {} },
            ],
            genScenes: [
                { type: 'commandRecall', data: {} },
            ],
        },
        // Read the following attributes
        read: { cluster: 'genLevelCtrl', attributes: ['currentLevel'] },
        // When the bound devices/members of group have the following manufacturerIDs
        manufacturerIDs: [
            zigbeeHerdsman.Zcl.ManufacturerCode.Philips,
            zigbeeHerdsman.Zcl.ManufacturerCode.ATMEL,
            zigbeeHerdsman.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbeeHerdsman.Zcl.ManufacturerCode.MUELLER_LICHT_INT,
            zigbeeHerdsman.Zcl.ManufacturerCode.TELINK,
            zigbeeHerdsman.Zcl.ManufacturerCode.BUSCH_JAEGER,
        ],
        manufacturerNames: [
            'GLEDOPTO',
            'Trust International B.V.\u0000',
        ],
    },
    {
        cluster: {
            genLevelCtrl: [
                { type: 'commandStepWithOnOff', data: {} },
                { type: 'commandMoveWithOnOff', data: {} },
                { type: 'commandStopWithOnOff', data: {} },
                { type: 'commandMoveToLevelWithOnOff', data: {} },
            ],
            genOnOff: [
                { type: 'commandOn', data: {} },
                { type: 'commandOff', data: {} },
                { type: 'commandOffWithEffect', data: {} },
                { type: 'commandToggle', data: {} },
            ],
            genScenes: [
                { type: 'commandRecall', data: {} },
            ],
            manuSpecificPhilips: [
                { type: 'commandHueNotification', data: { button: 1 } },
                { type: 'commandHueNotification', data: { button: 4 } },
            ],
        },
        read: { cluster: 'genOnOff', attributes: ['onOff'] },
        manufacturerIDs: [
            zigbeeHerdsman.Zcl.ManufacturerCode.Philips,
            zigbeeHerdsman.Zcl.ManufacturerCode.ATMEL,
            zigbeeHerdsman.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbeeHerdsman.Zcl.ManufacturerCode.MUELLER_LICHT_INT,
            zigbeeHerdsman.Zcl.ManufacturerCode.TELINK,
            zigbeeHerdsman.Zcl.ManufacturerCode.BUSCH_JAEGER,
        ],
        manufacturerNames: [
            'GLEDOPTO',
            'Trust International B.V.\u0000',
        ],
    },
    {
        cluster: {
            genScenes: [
                { type: 'commandRecall', data: {} },
            ],
        },
        read: {
            cluster: 'lightingColorCtrl',
            attributes: [],
            // Since not all devices support the same attributes they need to be calculated dynamically
            // depending on the capabilities of the endpoint.
            attributesForEndpoint: async (endpoint) => {
                const supportedAttrs = await getColorCapabilities(endpoint);
                const readAttrs = [];
                supportedAttrs.colorXY && readAttrs.push('currentX', 'currentY');
                supportedAttrs.colorTemperature && readAttrs.push('colorTemperature');
                return readAttrs;
            },
        },
        manufacturerIDs: [
            zigbeeHerdsman.Zcl.ManufacturerCode.Philips,
            zigbeeHerdsman.Zcl.ManufacturerCode.ATMEL,
            zigbeeHerdsman.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbeeHerdsman.Zcl.ManufacturerCode.MUELLER_LICHT_INT,
            zigbeeHerdsman.Zcl.ManufacturerCode.TELINK,
            // Note: ManufacturerCode.BUSCH_JAEGER is left out intentionally here as their devices don't support colors
        ],
        manufacturerNames: [
            'GLEDOPTO',
            'Trust International B.V.\u0000',
        ],
    },
];
class Bind extends extension_1.default {
    constructor() {
        super(...arguments);
        this.pollDebouncers = {};
    }
    async start() {
        this.eventBus.onDeviceMessage(this, this.poll);
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onGroupMembersChanged(this, this.onGroupMembersChanged);
    }
    parseMQTTMessage(data) {
        let type = null;
        let sourceKey = null;
        let targetKey = null;
        let clusters = null;
        let skipDisableReporting = false;
        if (legacyApi && data.topic.match(legacyTopicRegex)) {
            const topic = data.topic.replace(`${settings.get().mqtt.base_topic}/bridge/`, '');
            type = topic.split('/')[0];
            sourceKey = topic.replace(`${type}/`, '');
            targetKey = data.message;
        }
        else if (data.topic.match(topicRegex)) {
            type = data.topic.endsWith('unbind') ? 'unbind' : 'bind';
            const message = JSON.parse(data.message);
            sourceKey = message.from;
            targetKey = message.to;
            clusters = message.clusters;
            skipDisableReporting = 'skip_disable_reporting' in message ? message.skip_disable_reporting : false;
        }
        return { type, sourceKey, targetKey, clusters, skipDisableReporting };
    }
    async onMQTTMessage(data) {
        const { type, sourceKey, targetKey, clusters, skipDisableReporting } = this.parseMQTTMessage(data);
        if (!type)
            return null;
        const message = utils_1.default.parseJSON(data.message, data.message);
        let error = null;
        const parsedSource = utils_1.default.parseEntityID(sourceKey);
        const parsedTarget = utils_1.default.parseEntityID(targetKey);
        const source = this.zigbee.resolveEntity(parsedSource.ID);
        const target = targetKey === 'default_bind_group' ?
            defaultBindGroup : this.zigbee.resolveEntity(parsedTarget.ID);
        const responseData = { from: sourceKey, to: targetKey };
        if (!source || !(source instanceof device_1.default)) {
            error = `Source device '${sourceKey}' does not exist`;
        }
        else if (!target) {
            error = `Target device or group '${targetKey}' does not exist`;
        }
        else {
            const successfulClusters = [];
            const failedClusters = [];
            const attemptedClusters = [];
            const bindSource = source.endpoint(parsedSource.endpoint);
            let bindTarget = null;
            if (target instanceof device_1.default)
                bindTarget = target.endpoint(parsedTarget.endpoint);
            else if (target instanceof group_1.default)
                bindTarget = target.zh;
            else
                bindTarget = Number(target.ID);
            // Find which clusters are supported by both the source and target.
            // Groups are assumed to support all clusters.
            for (const cluster of clusterCandidates) {
                if (clusters && !clusters.includes(cluster))
                    continue;
                let matchingClusters = false;
                const anyClusterValid = utils_1.default.isZHGroup(bindTarget) || typeof bindTarget === 'number' ||
                    target.zh.type === 'Coordinator';
                if (!anyClusterValid && utils_1.default.isEndpoint(bindTarget)) {
                    matchingClusters = ((bindTarget.supportsInputCluster(cluster) &&
                        bindSource.supportsOutputCluster(cluster)) ||
                        (bindSource.supportsInputCluster(cluster) &&
                            bindTarget.supportsOutputCluster(cluster)));
                }
                const sourceValid = bindSource.supportsInputCluster(cluster) ||
                    bindSource.supportsOutputCluster(cluster);
                if (sourceValid && (anyClusterValid || matchingClusters)) {
                    logger_1.default.debug(`${type}ing cluster '${cluster}' from '${source.name}' to '${target.name}'`);
                    attemptedClusters.push(cluster);
                    try {
                        if (type === 'bind') {
                            await bindSource.bind(cluster, bindTarget);
                        }
                        else {
                            await bindSource.unbind(cluster, bindTarget);
                        }
                        successfulClusters.push(cluster);
                        logger_1.default.info(`Successfully ${type === 'bind' ? 'bound' : 'unbound'} cluster '${cluster}' from ` +
                            `'${source.name}' to '${target.name}'`);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${type}`,
                                message: { from: source.name, to: target.name, cluster } }));
                        }
                    }
                    catch (error) {
                        failedClusters.push(cluster);
                        logger_1.default.error(`Failed to ${type} cluster '${cluster}' from '${source.name}' to ` +
                            `'${target.name}' (${error})`);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${type}_failed`,
                                message: { from: source.name, to: target.name, cluster } }));
                        }
                    }
                }
            }
            if (attemptedClusters.length === 0) {
                logger_1.default.error(`Nothing to ${type} from '${source.name}' to '${target.name}'`);
                error = `Nothing to ${type}`;
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `device_${type}_failed`, message: { from: source.name, to: target.name } }));
                }
            }
            else if (failedClusters.length === attemptedClusters.length) {
                error = `Failed to ${type}`;
            }
            responseData[`clusters`] = successfulClusters;
            responseData[`failed`] = failedClusters;
            if (successfulClusters.length !== 0) {
                if (type === 'bind') {
                    await this.setupReporting(bindSource.binds.filter((b) => successfulClusters.includes(b.cluster.name) && b.target === bindTarget));
                }
                else if ((typeof bindTarget !== 'number') && !skipDisableReporting) {
                    await this.disableUnnecessaryReportings(bindTarget);
                }
            }
        }
        const triggeredViaLegacyApi = data.topic.match(legacyTopicRegex);
        if (!triggeredViaLegacyApi) {
            const response = utils_1.default.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/device/${type}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
        }
        if (error) {
            logger_1.default.error(error);
        }
        else {
            this.eventBus.emitDevicesChanged();
        }
    }
    async onGroupMembersChanged(data) {
        if (data.action === 'add') {
            const bindsToGroup = this.zigbee.devices(false).map((c) => c.zh.endpoints)
                .reduce((a, v) => a.concat(v)).map((e) => e.binds)
                .reduce((a, v) => a.concat(v)).filter((b) => b.target === data.group.zh);
            await this.setupReporting(bindsToGroup);
        }
        else { // action === remove/remove_all
            if (!data.skipDisableReporting) {
                await this.disableUnnecessaryReportings(data.endpoint);
            }
        }
    }
    getSetupReportingEndpoints(bind, coordinatorEp) {
        const endpoints = utils_1.default.isEndpoint(bind.target) ? [bind.target] : bind.target.members;
        return endpoints.filter((e) => {
            const supportsInputCluster = e.supportsInputCluster(bind.cluster.name);
            const hasConfiguredReporting = !!e.configuredReportings.find((c) => c.cluster.name === bind.cluster.name);
            const hasBind = !!e.binds.find((b) => b.cluster.name === bind.cluster.name && b.target === coordinatorEp);
            return supportsInputCluster && !(hasBind && hasConfiguredReporting);
        });
    }
    async setupReporting(binds) {
        const coordinatorEndpoint = this.zigbee.firstCoordinatorEndpoint();
        for (const bind of binds.filter((b) => b.cluster.name in reportClusters)) {
            for (const endpoint of this.getSetupReportingEndpoints(bind, coordinatorEndpoint)) {
                const entity = `${this.zigbee.resolveEntity(endpoint.getDevice()).name}/${endpoint.ID}`;
                try {
                    await endpoint.bind(bind.cluster.name, coordinatorEndpoint);
                    const items = [];
                    for (const c of reportClusters[bind.cluster.name]) {
                        /* istanbul ignore else */
                        if (!c.condition || await c.condition(endpoint)) {
                            const i = { ...c };
                            delete i.condition;
                            items.push(i);
                        }
                    }
                    await endpoint.configureReporting(bind.cluster.name, items);
                    logger_1.default.info(`Successfully setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                }
                catch (error) {
                    logger_1.default.warn(`Failed to setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
                }
            }
        }
        this.eventBus.emitDevicesChanged();
    }
    async disableUnnecessaryReportings(target) {
        const coordinator = this.zigbee.firstCoordinatorEndpoint();
        const endpoints = utils_1.default.isEndpoint(target) ? [target] : target.members;
        for (const endpoint of endpoints) {
            const device = this.zigbee.resolveEntity(endpoint.getDevice());
            const entity = `${device.name}/${endpoint.ID}`;
            const boundClusters = endpoint.binds.filter((b) => b.target === coordinator)
                .map((b) => b.cluster.name);
            const requiredClusters = this.zigbee.devices(false).map((c) => c.zh.endpoints)
                .reduce((a, v) => a.concat(v))
                .map((e) => e.binds).reduce((a, v) => a.concat(v)).filter((bind) => {
                if (utils_1.default.isEndpoint(bind.target)) {
                    return bind.target === endpoint;
                }
                else {
                    return bind.target.members.includes(endpoint);
                }
            }).map((b) => b.cluster.name).filter((v, i, a) => a.indexOf(v) === i);
            for (const cluster of boundClusters.filter((c) => !requiredClusters.includes(c) && c in reportClusters)) {
                try {
                    await endpoint.unbind(cluster, coordinator);
                    const items = [];
                    for (const item of reportClusters[cluster]) {
                        /* istanbul ignore else */
                        if (!item.condition || await item.condition(endpoint)) {
                            const i = { ...item };
                            delete i.condition;
                            items.push({ ...i, maximumReportInterval: 0xFFFF });
                        }
                    }
                    await endpoint.configureReporting(cluster, items);
                    logger_1.default.info(`Successfully disabled reporting for '${entity}' cluster '${cluster}'`);
                }
                catch (error) {
                    logger_1.default.warn(`Failed to disable reporting for '${entity}' cluster '${cluster}'`);
                }
            }
            this.eventBus.emitReconfigure({ device });
        }
    }
    async poll(data) {
        /**
         * This method poll bound endpoints and group members for state changes.
         *
         * A use case is e.g. a Hue Dimmer switch bound to a Hue bulb.
         * Hue bulbs only report their on/off state.
         * When dimming the bulb via the dimmer switch the state is therefore not reported.
         * When we receive a message from a Hue dimmer we read the brightness from the bulb (if bound).
         */
        const polls = pollOnMessage.filter((p) => { var _a; return (_a = p.cluster[data.cluster]) === null || _a === void 0 ? void 0 : _a.find((c) => c.type === data.type && utils_1.default.equalsPartial(data.data, c.data)); });
        if (polls.length) {
            const toPoll = new Set();
            // Add bound devices
            for (const endpoint of data.device.zh.endpoints) {
                for (const bind of endpoint.binds) {
                    if (utils_1.default.isEndpoint(bind.target) && bind.target.getDevice().type !== 'Coordinator') {
                        toPoll.add(bind.target);
                    }
                }
            }
            // If message is published to a group, add members of the group
            const group = data.groupID && data.groupID !== 0 && this.zigbee.groupByID(data.groupID);
            if (group) {
                group.zh.members.forEach((m) => toPoll.add(m));
            }
            for (const endpoint of toPoll) {
                for (const poll of polls) {
                    if ((!poll.manufacturerIDs.includes(endpoint.getDevice().manufacturerID) &&
                        !poll.manufacturerNames.includes(endpoint.getDevice().manufacturerName)) ||
                        !endpoint.supportsInputCluster(poll.read.cluster)) {
                        continue;
                    }
                    let readAttrs = poll.read.attributes;
                    if (poll.read.attributesForEndpoint) {
                        const attrsForEndpoint = await poll.read.attributesForEndpoint(endpoint);
                        readAttrs = [...poll.read.attributes, ...attrsForEndpoint];
                    }
                    const key = `${endpoint.getDevice().ieeeAddr}_${endpoint.ID}_${pollOnMessage.indexOf(poll)}`;
                    if (!this.pollDebouncers[key]) {
                        this.pollDebouncers[key] = (0, debounce_1.default)(async () => {
                            try {
                                await endpoint.read(poll.read.cluster, readAttrs);
                            }
                            catch (error) {
                                logger_1.default.error(`Failed to poll ${readAttrs} from ` +
                                    `${this.zigbee.resolveEntity(endpoint.getDevice()).name}`);
                            }
                        }, 1000);
                    }
                    this.pollDebouncers[key]();
                }
            }
        }
    }
}
exports.default = Bind;
__decorate([
    bind_decorator_1.default
], Bind.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], Bind.prototype, "onGroupMembersChanged", null);
__decorate([
    bind_decorator_1.default
], Bind.prototype, "poll", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmluZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vYmluZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkRBQTZDO0FBQzdDLDREQUFvQztBQUNwQywwREFBa0M7QUFDbEMsNERBQW9DO0FBQ3BDLGtIQUE4RDtBQUM5RCx3REFBZ0M7QUFDaEMscUVBQXVEO0FBQ3ZELG9FQUFrQztBQUNsQyw2REFBcUM7QUFDckMsMkRBQW1DO0FBRW5DLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDO0FBQ3JELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsMkJBQTJCLENBQUMsQ0FBQztBQUNuRyxNQUFNLFVBQVUsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxzQ0FBc0MsQ0FBQyxDQUFDO0FBQ3hHLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyxXQUFXLEVBQUUsVUFBVSxFQUFFLGNBQWMsRUFBRSxtQkFBbUIsRUFBRSx3QkFBd0I7SUFDN0csZ0JBQWdCLEVBQUUsMEJBQTBCLEVBQUUsMEJBQTBCLEVBQUUsb0JBQW9CO0lBQzlGLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxDQUFDO0FBRS9CLGlDQUFpQztBQUNqQyxNQUFNLGdCQUFnQixHQUFHLEVBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBQyxDQUFDO0FBRXJGLE1BQU0sMEJBQTBCLEdBQUc7SUFDL0IscUJBQXFCLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxDQUFDO0NBQzdF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