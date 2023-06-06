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
exports.Controller = void 0;
const mqtt_1 = __importDefault(require("./mqtt"));
const zigbee_1 = __importDefault(require("./zigbee"));
const eventBus_1 = __importDefault(require("./eventBus"));
const state_1 = __importDefault(require("./state"));
const logger_1 = __importDefault(require("./util/logger"));
const settings = __importStar(require("./util/settings"));
const utils_1 = __importDefault(require("./util/utils"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const assert_1 = __importDefault(require("assert"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
// Extensions
const frontend_1 = __importDefault(require("./extension/frontend"));
const publish_1 = __importDefault(require("./extension/publish"));
const receive_1 = __importDefault(require("./extension/receive"));
const networkMap_1 = __importDefault(require("./extension/networkMap"));
const softReset_1 = __importDefault(require("./extension/legacy/softReset"));
const homeassistant_1 = __importDefault(require("./extension/homeassistant"));
const configure_1 = __importDefault(require("./extension/configure"));
const deviceGroupMembership_1 = __importDefault(require("./extension/legacy/deviceGroupMembership"));
const bridgeLegacy_1 = __importDefault(require("./extension/legacy/bridgeLegacy"));
const bridge_1 = __importDefault(require("./extension/bridge"));
const groups_1 = __importDefault(require("./extension/groups"));
const availability_1 = __importDefault(require("./extension/availability"));
const bind_1 = __importDefault(require("./extension/bind"));
const report_1 = __importDefault(require("./extension/legacy/report"));
const onEvent_1 = __importDefault(require("./extension/onEvent"));
const otaUpdate_1 = __importDefault(require("./extension/otaUpdate"));
const externalConverters_1 = __importDefault(require("./extension/externalConverters"));
const externalExtension_1 = __importDefault(require("./extension/externalExtension"));
const AllExtensions = [
    publish_1.default, receive_1.default, networkMap_1.default, softReset_1.default, homeassistant_1.default,
    configure_1.default, deviceGroupMembership_1.default, bridgeLegacy_1.default, bridge_1.default, groups_1.default,
    bind_1.default, report_1.default, onEvent_1.default, otaUpdate_1.default,
    externalConverters_1.default, frontend_1.default, externalExtension_1.default, availability_1.default,
];
class Controller {
    constructor(restartCallback, exitCallback) {
        logger_1.default.init();
        this.eventBus = new eventBus_1.default(/* istanbul ignore next */ (error) => {
            logger_1.default.error(`Error: ${error.message}`);
            logger_1.default.debug(error.stack);
        });
        this.zigbee = new zigbee_1.default(this.eventBus);
        this.mqtt = new mqtt_1.default(this.eventBus);
        this.state = new state_1.default(this.eventBus, this.zigbee);
        this.restartCallback = restartCallback;
        this.exitCallback = exitCallback;
        // Initialize extensions.
        this.extensionArgs = [this.zigbee, this.mqtt, this.state, this.publishEntityState, this.eventBus,
            this.enableDisableExtension, this.restartCallback, this.addExtension];
        this.extensions = [
            new bridge_1.default(...this.extensionArgs),
            new publish_1.default(...this.extensionArgs),
            new receive_1.default(...this.extensionArgs),
            new deviceGroupMembership_1.default(...this.extensionArgs),
            new configure_1.default(...this.extensionArgs),
            new networkMap_1.default(...this.extensionArgs),
            new groups_1.default(...this.extensionArgs),
            new bind_1.default(...this.extensionArgs),
            new onEvent_1.default(...this.extensionArgs),
            new otaUpdate_1.default(...this.extensionArgs),
            new report_1.default(...this.extensionArgs),
            new externalExtension_1.default(...this.extensionArgs),
            new availability_1.default(...this.extensionArgs),
            settings.get().frontend && new frontend_1.default(...this.extensionArgs),
            settings.get().advanced.legacy_api && new bridgeLegacy_1.default(...this.extensionArgs),
            settings.get().external_converters.length && new externalConverters_1.default(...this.extensionArgs),
            settings.get().homeassistant && new homeassistant_1.default(...this.extensionArgs),
            /* istanbul ignore next */
            settings.get().advanced.soft_reset_timeout !== 0 && new softReset_1.default(...this.extensionArgs),
        ].filter((n) => n);
    }
    async start() {
        this.state.start();
        logger_1.default.logOutput();
        const info = await utils_1.default.getZigbee2MQTTVersion();
        logger_1.default.info(`Starting Zigbee2MQTT version ${info.version} (commit #${info.commitHash})`);
        // Start zigbee
        let startResult;
        try {
            startResult = await this.zigbee.start();
            this.eventBus.onAdapterDisconnected(this, this.onZigbeeAdapterDisconnected);
        }
        catch (error) {
            logger_1.default.error('Failed to start zigbee');
            logger_1.default.error('Check https://www.zigbee2mqtt.io/guide/installation/20_zigbee2mqtt-fails-to-start.html for possible solutions'); /* eslint-disable-line max-len */
            logger_1.default.error('Exiting...');
            logger_1.default.error(error.stack);
            await this.exit(1);
        }
        // Disable some legacy options on new network creation
        if (startResult === 'reset') {
            settings.set(['advanced', 'homeassistant_legacy_entity_attributes'], false);
            settings.set(['advanced', 'legacy_api'], false);
            settings.set(['advanced', 'legacy_availability_payload'], false);
            settings.set(['device_options', 'legacy'], false);
            this.enableDisableExtension(false, 'BridgeLegacy');
        }
        // Log zigbee clients on startup
        const devices = this.zigbee.devices(false);
        logger_1.default.info(`Currently ${devices.length} devices are joined:`);
        for (const device of devices) {
            const model = device.definition ?
                `${device.definition.model} - ${device.definition.vendor} ${device.definition.description}` :
                'Not supported';
            logger_1.default.info(`${device.name} (${device.ieeeAddr}): ${model} (${device.zh.type})`);
        }
        // Enable zigbee join
        try {
            if (settings.get().permit_join) {
                logger_1.default.warn('`permit_join` set to  `true` in configuration.yaml.');
                logger_1.default.warn('Allowing new devices to join.');
                logger_1.default.warn('Set `permit_join` to `false` once you joined all devices.');
            }
            await this.zigbee.permitJoin(settings.get().permit_join);
        }
        catch (error) {
            logger_1.default.error(`Failed to set permit join to ${settings.get().permit_join}`);
        }
        // MQTT
        try {
            await this.mqtt.connect();
        }
        catch (error) {
            logger_1.default.error(`MQTT failed to connect, exiting...`);
            await this.zigbee.stop();
            await this.exit(1);
        }
        // Call extensions
        await this.callExtensions('start', [...this.extensions]);
        // Send all cached states.
        if (settings.get().advanced.cache_state_send_on_startup && settings.get().advanced.cache_state) {
            for (const entity of [...devices, ...this.zigbee.groups()]) {
                if (this.state.exists(entity)) {
                    this.publishEntityState(entity, this.state.get(entity), 'publishCached');
                }
            }
        }
        this.eventBus.onLastSeenChanged(this, (data) => utils_1.default.publishLastSeen(data, settings.get(), false, this.publishEntityState));
        logger_1.default.info(`Zigbee2MQTT started!`);
    }
    async enableDisableExtension(enable, name) {
        if (!enable) {
            const extension = this.extensions.find((e) => e.constructor.name === name);
            if (extension) {
                await this.callExtensions('stop', [extension]);
                this.extensions.splice(this.extensions.indexOf(extension), 1);
            }
        }
        else {
            const Extension = AllExtensions.find((e) => e.name === name);
            (0, assert_1.default)(Extension, `Extension '${name}' does not exist`);
            const extension = new Extension(...this.extensionArgs);
            this.extensions.push(extension);
            await this.callExtensions('start', [extension]);
        }
    }
    async addExtension(extension) {
        this.extensions.push(extension);
        await this.callExtensions('start', [extension]);
    }
    async stop(restart = false) {
        // Call extensions
        await this.callExtensions('stop', this.extensions);
        this.eventBus.removeListeners(this);
        // Wrap-up
        this.state.stop();
        await this.mqtt.disconnect();
        try {
            await this.zigbee.stop();
            logger_1.default.info('Stopped Zigbee2MQTT');
            await this.exit(0, restart);
        }
        catch (error) {
            logger_1.default.error('Failed to stop Zigbee2MQTT');
            await this.exit(1, restart);
        }
    }
    async exit(code, restart = false) {
        await logger_1.default.end();
        this.exitCallback(code, restart);
    }
    async onZigbeeAdapterDisconnected() {
        logger_1.default.error('Adapter disconnected, stopping');
        await this.stop();
    }
    async publishEntityState(entity, payload, stateChangeReason) {
        var _a, _b;
        let message = { ...payload };
        // Update state cache with new state.
        const newState = this.state.set(entity, payload, stateChangeReason);
        if (settings.get().advanced.cache_state) {
            // Add cached state to payload
            message = newState;
        }
        const options = {
            retain: utils_1.default.getObjectProperty(entity.options, 'retain', false),
            qos: utils_1.default.getObjectProperty(entity.options, 'qos', 0),
        };
        const retention = utils_1.default.getObjectProperty(entity.options, 'retention', false);
        if (retention !== false) {
            options.properties = { messageExpiryInterval: retention };
        }
        if (entity.isDevice() && settings.get().mqtt.include_device_information) {
            message.device = {
                friendlyName: entity.name, model: entity.definition ? entity.definition.model : 'unknown',
                ieeeAddr: entity.ieeeAddr, networkAddress: entity.zh.networkAddress, type: entity.zh.type,
                manufacturerID: entity.zh.manufacturerID,
                powerSource: entity.zh.powerSource, applicationVersion: entity.zh.applicationVersion,
                stackVersion: entity.zh.stackVersion, zclVersion: entity.zh.zclVersion,
                hardwareVersion: entity.zh.hardwareVersion, dateCode: entity.zh.dateCode,
                softwareBuildID: entity.zh.softwareBuildID,
                // Manufacturer name can contain \u0000, remove this.
                // https://github.com/home-assistant/core/issues/85691
                manufacturerName: (_a = entity.zh.manufacturerName) === null || _a === void 0 ? void 0 : _a.split('\u0000')[0],
            };
        }
        // Add lastseen
        const lastSeen = settings.get().advanced.last_seen;
        if (entity.isDevice() && lastSeen !== 'disable' && entity.zh.lastSeen) {
            message.last_seen = utils_1.default.formatDate(entity.zh.lastSeen, lastSeen);
        }
        // Add device linkquality.
        if (entity.isDevice() && entity.zh.linkquality !== undefined) {
            message.linkquality = entity.zh.linkquality;
        }
        for (const extension of this.extensions) {
            (_b = extension.adjustMessageBeforePublish) === null || _b === void 0 ? void 0 : _b.call(extension, entity, message);
        }
        // Filter mqtt message attributes
        utils_1.default.filterProperties(entity.options.filtered_attributes, message);
        if (Object.entries(message).length) {
            const output = settings.get().advanced.output;
            if (output === 'attribute_and_json' || output === 'json') {
                await this.mqtt.publish(entity.name, (0, json_stable_stringify_without_jsonify_1.default)(message), options);
            }
            if (output === 'attribute_and_json' || output === 'attribute') {
                await this.iteratePayloadAttributeOutput(`${entity.name}/`, message, options);
            }
        }
        this.eventBus.emitPublishEntityState({ entity, message, stateChangeReason, payload });
    }
    async iteratePayloadAttributeOutput(topicRoot, payload, options) {
        for (const [key, value] of Object.entries(payload)) {
            let subPayload = value;
            let message = null;
            // Special cases
            if (key === 'color' && utils_1.default.objectHasProperties(subPayload, ['r', 'g', 'b'])) {
                subPayload = [subPayload.r, subPayload.g, subPayload.b];
            }
            // Check Array first, since it is also an Object
            if (subPayload === null || subPayload === undefined) {
                message = '';
            }
            else if (Array.isArray(subPayload)) {
                message = subPayload.map((x) => `${x}`).join(',');
            }
            else if (typeof subPayload === 'object') {
                await this.iteratePayloadAttributeOutput(`${topicRoot}${key}-`, subPayload, options);
            }
            else {
                message = typeof subPayload === 'string' ? subPayload : (0, json_stable_stringify_without_jsonify_1.default)(subPayload);
            }
            if (message !== null) {
                await this.mqtt.publish(`${topicRoot}${key}`, message, options);
            }
        }
    }
    async callExtensions(method, extensions) {
        var _a;
        for (const extension of extensions) {
            try {
                await ((_a = extension[method]) === null || _a === void 0 ? void 0 : _a.call(extension));
            }
            catch (error) {
                /* istanbul ignore next */
                logger_1.default.error(`Failed to call '${extension.constructor.name}' '${method}' (${error.stack})`);
            }
        }
    }
}
exports.Controller = Controller;
__decorate([
    bind_decorator_1.default
], Controller.prototype, "enableDisableExtension", null);
__decorate([
    bind_decorator_1.default
], Controller.prototype, "addExtension", null);
__decorate([
    bind_decorator_1.default
], Controller.prototype, "onZigbeeAdapterDisconnected", null);
__decorate([
    bind_decorator_1.default
], Controller.prototype, "publishEntityState", null);
module.exports = Controller;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL2xpYi9jb250cm9sbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsa0RBQTBCO0FBQzFCLHNEQUE4QjtBQUM5QiwwREFBa0M7QUFDbEMsb0RBQTRCO0FBQzVCLDJEQUFtQztBQUNuQywwREFBNEM7QUFDNUMseURBQWlDO0FBQ2pDLGtIQUE4RDtBQUM5RCxvREFBNEI7QUFDNUIsb0VBQWtDO0FBRWxDLGFBQWE7QUFDYixvRUFBcUQ7QUFDckQsa0VBQW1EO0FBQ25ELGtFQUFtRDtBQUNuRCx3RUFBeUQ7QUFDekQsNkVBQThEO0FBQzlELDhFQUErRDtBQUMvRCxzRUFBdUQ7QUFDdkQscUdBQXNGO0FBQ3RGLG1GQUFvRTtBQUNwRSxnRUFBaUQ7QUFDakQsZ0VBQWlEO0FBQ2pELDRFQUE2RDtBQUM3RCw0REFBNkM7QUFDN0MsdUVBQXdEO0FBQ3hELGtFQUFtRDtBQUNuRCxzRUFBdUQ7QUFDdkQsd0ZBQXlFO0FBQ3pFLHNGQUF1RTtBQUV2RSxNQUFNLGFBQWEsR0FBRztJQUNsQixpQkFBZ0IsRUFBRSxpQkFBZ0IsRUFBRSxvQkFBbUIsRUFBRSxtQkFBa0IsRUFBRSx1QkFBc0I7SUFDbkcsbUJBQWtCLEVBQUUsK0JBQThCLEVBQUUsc0JBQXFCLEVBQUUsZ0JBQWUsRUFBRSxnQkFBZTtJQUMzRyxjQUFhLEVBQUUsZ0JBQWUsRUFBRSxpQkFBZ0IsRUFBRSxtQkFBa0I7SUFDcEUsNEJBQTJCLEVBQUUsa0JBQWlCLEVBQUUsMkJBQTBCLEVBQUUsc0JBQXFCO0NBQ3BHLENBQUM7QUFLRixNQUFhLFVBQVU7SUFVbkIsWUFBWSxlQUEyQixFQUFFLFlBQXNEO1FBQzNGLGdCQUFNLENBQUMsSUFBSSxFQUFFLENBQUM7UUFDZCxJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksa0JBQVEsQ0FBRSwwQkFBMEIsQ0FBQyxDQUFDLEtB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