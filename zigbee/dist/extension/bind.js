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
const settings = __importStar(require("../util/settings"));
const logger_1 = __importDefault(require("../util/logger"));
const utils_1 = __importDefault(require("../util/utils"));
const extension_1 = __importDefault(require("./extension"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const debounce_1 = __importDefault(require("debounce"));
const zigbeeHersdman = __importStar(require("zigbee-herdsman/dist"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const device_1 = __importDefault(require("../model/device"));
const group_1 = __importDefault(require("../model/group"));
const legacyApi = settings.get().advanced.legacy_api;
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/(bind|unbind)/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/(bind|unbind)`);
const clusterCandidates = ['genScenes', 'genOnOff', 'genLevelCtrl', 'lightingColorCtrl', 'closuresWindowCovering',
    'hvacThermostat', 'msTemperatureMeasurement'];
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
            zigbeeHersdman.Zcl.ManufacturerCode.Philips,
            zigbeeHersdman.Zcl.ManufacturerCode.ATMEL,
            zigbeeHersdman.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbeeHersdman.Zcl.ManufacturerCode.MUELLER_LICHT_INT,
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
            zigbeeHersdman.Zcl.ManufacturerCode.Philips,
            zigbeeHersdman.Zcl.ManufacturerCode.ATMEL,
            zigbeeHersdman.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbeeHersdman.Zcl.ManufacturerCode.MUELLER_LICHT_INT,
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
            zigbeeHersdman.Zcl.ManufacturerCode.Philips,
            zigbeeHersdman.Zcl.ManufacturerCode.ATMEL,
            zigbeeHersdman.Zcl.ManufacturerCode.GLEDOPTO_CO_LTD,
            zigbeeHersdman.Zcl.ManufacturerCode.MUELLER_LICHT_INT,
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
                    logger_1.default.info(`Succesfully setup reporting for '${entity}' cluster '${bind.cluster.name}'`);
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
                    logger_1.default.info(`Succesfully disabled reporting for '${entity}' cluster '${cluster}'`);
                }
                catch (error) {
                    logger_1.default.warn(`Failed to disable reporting for '${entity}' cluster '${cluster}'`);
                }
            }
            this.eventBus.emitReportingDisabled({ device });
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
                    if (!poll.manufacturerIDs.includes(endpoint.getDevice().manufacturerID) ||
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
                            await endpoint.read(poll.read.cluster, readAttrs);
                        }, 1000);
                    }
                    this.pollDebouncers[key]();
                }
            }
        }
    }
}
__decorate([
    bind_decorator_1.default
], Bind.prototype, "onMQTTMessage", null);
__decorate([
    bind_decorator_1.default
], Bind.prototype, "onGroupMembersChanged", null);
__decorate([
    bind_decorator_1.default
], Bind.prototype, "poll", null);
exports.default = Bind;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmluZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vYmluZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyREFBNkM7QUFDN0MsNERBQW9DO0FBQ3BDLDBEQUFrQztBQUNsQyw0REFBb0M7QUFDcEMsa0hBQThEO0FBQzlELHdEQUFnQztBQUNoQyxxRUFBdUQ7QUFDdkQsb0VBQWtDO0FBQ2xDLDZEQUFxQztBQUNyQywyREFBbUM7QUFFbkMsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7QUFDckQsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSwyQkFBMkIsQ0FBQyxDQUFDO0FBQ25HLE1BQU0sVUFBVSxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLHNDQUFzQyxDQUFDLENBQUM7QUFDeEcsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLFdBQVcsRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLG1CQUFtQixFQUFFLHdCQUF3QjtJQUM3RyxnQkFBZ0IsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO0FBRWxELGlDQUFpQztBQUNqQyxNQUFNLGdCQUFnQixHQUFHLEVBQUMsSUFBSSxFQUFFLGNBQWMsRUFBRSxFQUFFLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxvQkFBb0IsRUFBQyxDQUFDO0FBRXJGLE1BQU0sMEJBQTBCLEdBQUc7SUFDL0IscUJBQXFCLEVBQUUsQ0FBQyxFQUFFLHFCQUFxQixFQUFFLElBQUksRUFBRSxnQkFBZ0IsRUFBRSxDQUFDO0NBQzdFLENBQUM7QUFFRixNQUFNLG9CQUFvQixHQUFHLEtBQUssRUFBRSxRQUFxQixFQUEwRCxF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