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
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const utils_1 = __importDefault(require("../util/utils"));
const tradfri_1 = __importDefault(require("zigbee-herdsman-converters/lib/ota/tradfri"));
const zigbeeOTA_1 = __importDefault(require("zigbee-herdsman-converters/lib/ota/zigbeeOTA"));
const extension_1 = __importDefault(require("./extension"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const device_1 = __importDefault(require("../model/device"));
const data_1 = __importDefault(require("../util/data"));
const URI = __importStar(require("uri-js"));
const path_1 = __importDefault(require("path"));
function isValidUrl(url) {
    let parsed;
    try {
        parsed = URI.parse(url);
    }
    catch (_) {
        // istanbul ignore next
        return false;
    }
    return parsed.scheme === 'http' || parsed.scheme === 'https';
}
const legacyTopicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/ota_update/.+$`);
const topicRegex = new RegExp(`^${settings.get().mqtt.base_topic}/bridge/request/device/ota_update/(update|check)`, 'i');
class OTAUpdate extends extension_1.default {
    constructor() {
        super(...arguments);
        this.inProgress = new Set();
        this.lastChecked = {};
        this.legacyApi = settings.get().advanced.legacy_api;
    }
    async start() {
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onDeviceMessage(this, this.onZigbeeEvent);
        if (settings.get().ota.ikea_ota_use_test_url) {
            tradfri_1.default.useTestURL();
        }
        // Let zigbeeOTA module know if the override index file is provided
        let overrideOTAIndex = settings.get().ota.zigbee_ota_override_index_location;
        if (overrideOTAIndex) {
            // If the file name is not a full path, then treat it as a relative to the data directory
            if (!isValidUrl(overrideOTAIndex) && !path_1.default.isAbsolute(overrideOTAIndex)) {
                overrideOTAIndex = data_1.default.joinPath(overrideOTAIndex);
            }
            zigbeeOTA_1.default.useIndexOverride(overrideOTAIndex);
        }
        // In order to support local firmware files we need to let zigbeeOTA know where the data directory is
        zigbeeOTA_1.default.setDataDir(data_1.default.getPath());
        // In case Zigbee2MQTT is restared during an update, progress and remaining values are still in state.
        // remove them.
        for (const device of this.zigbee.devices(false)) {
            this.removeProgressAndRemainingFromState(device);
        }
    }
    removeProgressAndRemainingFromState(device) {
        var _a, _b;
        (_a = this.state.get(device).update) === null || _a === void 0 ? true : delete _a.progress;
        (_b = this.state.get(device).update) === null || _b === void 0 ? true : delete _b.remaining;
    }
    async onZigbeeEvent(data) {
        if (data.type !== 'commandQueryNextImageRequest' || !data.device.definition ||
            this.inProgress.has(data.device.ieeeAddr))
            return;
        logger_1.default.debug(`Device '${data.device.name}' requested OTA`);
        const automaticOTACheckDisabled = settings.get().ota.disable_automatic_update_check;
        let supportsOTA = data.device.definition.hasOwnProperty('ota');
        if (supportsOTA && !automaticOTACheckDisabled) {
            // When a device does a next image request, it will usually do it a few times after each other
            // with only 10 - 60 seconds inbetween. It doesn't make sense to check for a new update
            // each time, so this interval can be set by the user. The default is 1,440 minutes (one day).
            const updateCheckInterval = settings.get().ota.update_check_interval * 1000 * 60;
            const check = this.lastChecked.hasOwnProperty(data.device.ieeeAddr) ?
                (Date.now() - this.lastChecked[data.device.ieeeAddr]) > updateCheckInterval : true;
            if (!check)
                return;
            this.lastChecked[data.device.ieeeAddr] = Date.now();
            let availableResult = null;
            try {
                availableResult = await data.device.definition.ota.isUpdateAvailable(data.device.zh, logger_1.default, data.data);
            }
            catch (e) {
                supportsOTA = false;
                logger_1.default.debug(`Failed to check if update available for '${data.device.name}' (${e.message})`);
            }
            const payload = this.getEntityPublishPayload(data.device, availableResult !== null && availableResult !== void 0 ? availableResult : 'idle');
            this.publishEntityState(data.device, payload);
            if (availableResult === null || availableResult === void 0 ? void 0 : availableResult.available) {
                const message = `Update available for '${data.device.name}'`;
                logger_1.default.info(message);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: 'available', device: data.device.name };
                    this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message, meta }));
                }
            }
        }
        // Respond to the OTA request: respond with NO_IMAGE_AVAILABLE (0x98) (so the client stops requesting OTAs)
        const endpoint = data.device.zh.endpoints.find((e) => e.supportsOutputCluster('genOta')) || data.endpoint;
        await endpoint.commandResponse('genOta', 'queryNextImageResponse', { status: 0x98 });
        logger_1.default.debug(`Responded to OTA request of '${data.device.name}' with 'NO_IMAGE_AVAILABLE'`);
    }
    async readSoftwareBuildIDAndDateCode(device, sendWhen) {
        try {
            const endpoint = device.zh.endpoints.find((e) => e.supportsInputCluster('genBasic'));
            const result = await endpoint.read('genBasic', ['dateCode', 'swBuildId'], { sendWhen });
            return { softwareBuildID: result.swBuildId, dateCode: result.dateCode };
        }
        catch (e) {
            return null;
        }
    }
    getEntityPublishPayload(device, state, progress = null, remaining = null) {
        const deviceUpdateState = this.state.get(device).update;
        const payload = { update: {
                state: typeof state === 'string' ? state : (state.available ? 'available' : 'idle'),
                installed_version: typeof state === 'string' ?
                    deviceUpdateState === null || deviceUpdateState === void 0 ? void 0 : deviceUpdateState.installed_version : state.currentFileVersion,
                latest_version: typeof state === 'string' ?
                    deviceUpdateState === null || deviceUpdateState === void 0 ? void 0 : deviceUpdateState.latest_version : state.otaFileVersion,
            } };
        if (progress !== null)
            payload.update.progress = progress;
        if (remaining !== null)
            payload.update.remaining = Math.round(remaining);
        /* istanbul ignore else */
        if (this.legacyApi) {
            payload.update_available = typeof state === 'string' ? state === 'available' : state.available;
        }
        return payload;
    }
    async onMQTTMessage(data) {
        if ((!this.legacyApi || !data.topic.match(legacyTopicRegex)) && !data.topic.match(topicRegex)) {
            return null;
        }
        const message = utils_1.default.parseJSON(data.message, data.message);
        const ID = (typeof message === 'object' && message.hasOwnProperty('id') ? message.id : message);
        const device = this.zigbee.resolveEntity(ID);
        const type = data.topic.substring(data.topic.lastIndexOf('/') + 1);
        const responseData = { id: ID };
        let error = null;
        let errorStack = null;
        if (!(device instanceof device_1.default)) {
            error = `Device '${ID}' does not exist`;
        }
        else if (!device.definition || !device.definition.ota) {
            error = `Device '${device.name}' does not support OTA updates`;
            /* istanbul ignore else */
            if (settings.get().advanced.legacy_api) {
                const meta = { status: `not_supported`, device: device.name };
                this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: error, meta }));
            }
        }
        else if (this.inProgress.has(device.ieeeAddr)) {
            error = `Update or check for update already in progress for '${device.name}'`;
        }
        else {
            this.inProgress.add(device.ieeeAddr);
            if (type === 'check') {
                const msg = `Checking if update available for '${device.name}'`;
                logger_1.default.info(msg);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: `checking_if_available`, device: device.name };
                    this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                }
                try {
                    const availableResult = await device.definition.ota.isUpdateAvailable(device.zh, logger_1.default);
                    const msg = `${availableResult.available ? 'Update' : 'No update'} available for '${device.name}'`;
                    logger_1.default.info(msg);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = {
                            status: availableResult.available ? 'available' : 'not_available', device: device.name
                        };
                        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                    }
                    const payload = this.getEntityPublishPayload(device, availableResult);
                    this.publishEntityState(device, payload);
                    this.lastChecked[device.ieeeAddr] = Date.now();
                    responseData.updateAvailable = availableResult.available;
                }
                catch (e) {
                    error = `Failed to check if update available for '${device.name}' (${e.message})`;
                    errorStack = e.stack;
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: `check_failed`, device: device.name };
                        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: error, meta }));
                    }
                }
            }
            else { // type === 'update'
                const msg = `Updating '${device.name}' to latest firmware`;
                logger_1.default.info(msg);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: `update_in_progress`, device: device.name };
                    this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                }
                try {
                    const onProgress = (progress, remaining) => {
                        let msg = `Update of '${device.name}' at ${progress.toFixed(2)}%`;
                        if (remaining) {
                            msg += `, ≈ ${Math.round(remaining / 60)} minutes remaining`;
                        }
                        logger_1.default.info(msg);
                        const payload = this.getEntityPublishPayload(device, 'updating', progress, remaining);
                        this.publishEntityState(device, payload);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const meta = { status: `update_progress`, device: device.name, progress };
                            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                        }
                    };
                    const from_ = await this.readSoftwareBuildIDAndDateCode(device, 'immediate');
                    const fileVersion = await device.definition.ota.updateToLatest(device.zh, logger_1.default, onProgress);
                    logger_1.default.info(`Finished update of '${device.name}'`);
                    this.eventBus.emitReconfigure({ device });
                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload(device, { available: false, currentFileVersion: fileVersion, otaFileVersion: fileVersion });
                    this.publishEntityState(device, payload);
                    const to = await this.readSoftwareBuildIDAndDateCode(device, 'active');
                    const [fromS, toS] = [(0, json_stable_stringify_without_jsonify_1.default)(from_), (0, json_stable_stringify_without_jsonify_1.default)(to)];
                    logger_1.default.info(`Device '${device.name}' was updated from '${fromS}' to '${toS}'`);
                    responseData.from = from_ ? utils_1.default.toSnakeCase(from_) : null;
                    responseData.to = to ? utils_1.default.toSnakeCase(to) : null;
                    this.eventBus.emitDevicesChanged();
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: `update_succeeded`, device: device.name, from: from_, to };
                        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message, meta }));
                    }
                }
                catch (e) {
                    logger_1.default.debug(`Update of '${device.name}' failed (${e})`);
                    error = `Update of '${device.name}' failed (${e.message})`;
                    errorStack = e.stack;
                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload(device, 'available');
                    this.publishEntityState(device, payload);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: `update_failed`, device: device.name };
                        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: error, meta }));
                    }
                }
            }
            this.inProgress.delete(device.ieeeAddr);
        }
        const triggeredViaLegacyApi = data.topic.match(legacyTopicRegex);
        if (!triggeredViaLegacyApi) {
            const response = utils_1.default.getResponse(message, responseData, error);
            await this.mqtt.publish(`bridge/response/device/ota_update/${type}`, (0, json_stable_stringify_without_jsonify_1.default)(response));
        }
        if (error) {
            logger_1.default.error(error);
            errorStack && logger_1.default.debug(errorStack);
        }
    }
}
exports.default = OTAUpdate;
__decorate([
    bind_decorator_1.default
], OTAUpdate.prototype, "onZigbeeEvent", null);
__decorate([
    bind_decorator_1.default
], OTAUpdate.prototype, "onMQTTMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3RhVXBkYXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9vdGFVcGRhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJEQUE2QztBQUM3Qyw0REFBb0M7QUFDcEMsa0hBQThEO0FBQzlELDBEQUFrQztBQUNsQyx5RkFBb0U7QUFDcEUsNkZBQXFFO0FBQ3JFLDREQUFvQztBQUNwQyxvRUFBa0M7QUFDbEMsNkRBQXFDO0FBQ3JDLHdEQUFtQztBQUNuQyw0Q0FBOEI7QUFDOUIsZ0RBQXdCO0FBRXhCLFNBQVMsVUFBVSxDQUFDLEdBQVc7SUFDM0IsSUFBSSxNQUFNLENBQUM7SUFDWCxJQUFJO1FBQ0EsTUFBTSxHQUFHLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7S0FDM0I7SUFBQyxPQUFPLENBQUMsRUFBRTtRQUNSLHVCQUF1QjtRQUN2QixPQUFPLEtBQUssQ0FBQztLQUNoQjtJQUNELE9BQU8sTUFBTSxDQUFDLE1BQU0sS0FBSyxNQUFNLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUM7QUFDakUsQ0FBQztBQVlELE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsd0JBQXdCLENBQUMsQ0FBQztBQUNoRyxNQUFNLFVBQVUsR0FDWixJQUFJLE1BQU0sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxrREFBa0QsRUFBRSxHQUFHLENBQUMsQ0FBQztBQUUxRyxNQUFxQixTQUFVLFNBQVEsbUJBQVM7SUFBaEQ7O1FBQ1ksZUFBVSxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDdkIsZ0JBQVcsR0FBMEIsRUFBRSxDQUFDO1FBQ3hDLGNBQVMsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQztJQW1SM0QsQ0FBQztJQWpSWSxLQUFLLENBQUMsS0FBSztRQUNoQixJQUFJLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDeEQsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLHFCQUFxQixFQUFFO1lBQzFDLGlCQUFVLENBQUMsVUFBVSxFQUFFLENBQUM7U0FDM0I7UUFFRCxtRUFBbUU7UUFDbkUsSUFBSSxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLGtDQUFrQyxDQUFDO1FBQzdFLElBQUksZ0JBQWdCLEVBQUU7WUFDbEIseUZBQXlGO1lBQ3pGLElBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLGNBQUksQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsRUFBRTtnQkFDckUsZ0JBQWdCLEdBQUcsY0FBTyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO2FBQ3pEO1lBRUQsbUJBQVMsQ0FBQyxnQkFBZ0IsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1NBQ2hEO1FBRUQscUdBQXFHO1FBQ3JHLG1CQUFTLENBQUMsVUFBVSxDQUFDLGNBQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO1FBRXhDLHNHQUFzRztRQUN0RyxlQUFlO1FBQ2YsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUM3QyxJQUFJLENBQUMsbUNBQW1DLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDcEQ7SUFDTCxDQUFDO0lBRU8sbUNBQW1DLENBQUMsTUFBYzs7UUFDL0MsTUFBQSxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLCtDQUFFLFFBQVEsQ0FBQztRQUN4QyxNQUFBLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sK0NBQUUsU0FBUyxDQUFDO0lBQ3BELENBQUM7SUFFbUIsQUFBTixLQUFLLENBQUMsYUFBYSxDQUFDLElBQTZCO1FBQzNELElBQUksSUFBSSxDQUFDLElBQUksS0FBSyw4QkFBOEIsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVTtZQUN2RSxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUFFLE9BQU87UUFDdEQsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsV0FBVyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksaUJBQWlCLENBQUMsQ0FBQztRQUUzRCxNQUFNLHlCQUF5QixHQUFHLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxHQUFHLENBQUMsOEJBQThCLENBQUM7UUFDcEYsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQy9ELElBQUksV0FBVyxJQUFJLENBQUMseUJBQXlCLEVBQUU7WUFDM0MsOEZBQThGO1lBQzlGLHVGQUF1RjtZQUN2Riw4RkFBOEY7WUFDOUYsTUFBTSxtQkFBbUIsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsR0FBRyxDQUFDLHFCQUFxQixHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7WUFDakYsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO2dCQUNqRSxDQUFDLElBQUksQ0FBQyxHQUFHLEVBQUUsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsR0FBRyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO1lBQ3ZGLElBQUksQ0FBQyxLQUFLO2dCQUFFLE9BQU87WUFFbkIsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNwRCxJQUFJLGVBQWUsR0FBaUMsSUFBSSxDQUFDO1lBQ3pELElBQUk7Z0JBQ0EsZUFBZSxHQUFHLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLGdCQUFNLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2FBQzNHO1lBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ1IsV0FBVyxHQUFHLEtBQUssQ0FBQztnQkFDcEIsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsNENBQTRDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO2FBQ2hHO1lBRUQsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsZUFBZSxhQUFmLGVBQWUsY0FBZixlQUFlLEdBQUksTUFBTSxDQUFDLENBQUM7WUFDckYsSUFBSSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFOUMsSUFBSSxlQUFlLGFBQWYsZUFBZSx1QkFBZixlQUFlLENBQUUsU0FBUyxFQUFFO2dCQUM1QixNQUFNLE9BQU8sR0FBRyx5QkFBeUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQztnQkFDN0QsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7Z0JBRXJCLDBCQUEwQjtnQkFDMUIsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRTtvQkFDcEMsTUFBTSxJQUFJLEdBQUcsRUFBQyxNQUFNLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBQyxDQUFDO29CQUM3RCxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FDYixZQUFZLEVBQ1osSUFBQSwrQ0FBUyxFQUFDLEVBQUMsSUFBSSxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FDakQsQ0FBQztpQkFDTDthQUNKO1NBQ0o7UUFFRCwyR0FBMkc7UUFDM0csTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLHFCQUFxQixDQUFDLFFBQVEsQ0FBQyxDQUFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQztRQUMxRyxNQUFNLFFBQVEsQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLHdCQUF3QixFQUFFLEVBQUMsTUFBTSxFQUFFLElBQUksRUFBQyxDQUFDLENBQUM7UUFDbkYsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsZ0NBQWdDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSw2QkFBNkIsQ0FBQyxDQUFDO0lBQ2hHLENBQUM7SUFFTyxLQUFLLENBQUMsOEJBQThCLENBQUMsTUFBYyxFQUFFLFFBQWdDO1FBRXpGLElBQUk7WUFDQSxNQUFNLFFBQVEsR0FBRyxNQUFNLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1lBQ3JGLE1BQU0sTUFBTSxHQUFHLE1BQU0sUUFBUSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLEVBQUUsRUFBQyxRQUFRLEVBQUMsQ0FBQyxDQUFDO1lBQ3RGLE9BQU8sRUFBQyxlQUFlLEVBQUUsTUFBTSxDQUFDLFNBQVMsRUFBRSxRQUFRLEVBQUUsTUFBTSxDQUFDLFFBQVEsRUFBQyxDQUFDO1NBQ3pFO1FBQUMsT0FBTyxDQUFDLEVBQUU7WUFDUixPQUFPLElBQUksQ0FBQztTQUNmO0lBQ0wsQ0FBQztJQUVPLHVCQUF1QixDQUFDLE1BQWMsRUFBRSxLQUFpRCxFQUM3RixXQUFpQixJQUFJLEVBQUUsWUFBa0IsSUFBSTtRQUM3QyxNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQztRQUN4RCxNQUFNLE9BQU8sR0FBa0IsRUFBQyxNQUFNLEVBQUU7Z0JBQ3BDLEtBQUssRUFBRSxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQztnQkFDbkYsaUJBQWlCLEVBQUUsT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUM7b0JBQzFDLGlCQUFpQixhQUFqQixpQkFBaUIsdUJBQWpCLGlCQUFpQixDQUFFLGlCQUFpQixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsa0JBQWtCO2dCQUNuRSxjQUFjLEVBQUUsT0FBTyxLQUFLLEtBQUssUUFBUSxDQUFDLENBQUM7b0JBQ3ZDLGlCQUFpQixhQUFqQixpQkFBaUIsdUJBQWpCLGlCQUFpQixDQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLGNBQWM7YUFDL0QsRUFBQyxDQUFDO1FBQ0gsSUFBSSxRQUFRLEtBQUssSUFBSTtZQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxHQUFHLFFBQVEsQ0FBQztRQUMxRCxJQUFJLFNBQVMsS0FBSyxJQUFJO1lBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxTQUFTLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUV6RSwwQkFBMEI7UUFDMUIsSUFBSSxJQUFJLENBQUMsU0FBUyxFQUFFO1lBQ2hCLE9BQU8sQ0FBQyxnQkFBZ0IsR0FBRyxPQUFPLEtBQUssS0FBSyxRQUFRLENBQUMsQ0FBQyxDQUFDLEtBQUssS0FBSyxXQUFXLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7U0FDbEc7UUFFRCxPQUFPLE9BQU8sQ0FBQztJQUNuQixDQUFDO0lBRVcsQUFBTixLQUFLLENBQUMsYUFBYSxDQUFDLElBQTJCO1FBQ2pELElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxTQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUMzRixPQUFPLElBQUksQ0FBQztTQUNmO1FBRUQsTUFBTSxPQUFPLEdBQUcsZUFBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM1RCxNQUFNLEVBQUUsR0FBRyxDQUFDLE9BQU8sT0FBTyxLQUFLLFFBQVEsSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQVcsQ0FBQztRQUMxRyxNQUFNLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLGFBQWEsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM3QyxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLFdBQVcsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztRQUNuRSxNQUFNLFlBQVksR0FBdUUsRUFBQyxFQUFFLEVBQUUsRUFBRSxFQUFDLENBQUM7UUFDbEcsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBQ2pCLElBQUksVUFBVSxHQUFHLElBQUksQ0FBQztRQUV0QixJQUFJLENBQUMsQ0FBQyxNQUFNLFlBQVksZ0JBQU0sQ0FBQyxFQUFFO1lBQzdCLEtBQUssR0FBRyxXQUFXLEVBQUUsa0JBQWtCLENBQUM7U0FDM0M7YUFBTSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxFQUFFO1lBQ3JELEtBQUssR0FBRyxXQUFXLE1BQU0sQ0FBQyxJQUFJLGdDQUFnQyxDQUFDO1lBRS9ELDBCQUEwQjtZQUMxQixJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFO2dCQUNwQyxNQUFNLElBQUksR0FBRyxFQUFDLE1BQU0sRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEVBQUMsQ0FBQztnQkFDNUQsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQ2IsWUFBWSxFQUNaLElBQUEsK0NBQVMsRUFBQyxFQUFDLElBQUksRUFBRSxZQUFZLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUMsQ0FBQyxDQUN4RCxDQUFDO2FBQ0w7U0FDSjthQUFNLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxFQUFFO1lBQzdDLEtBQUssR0FBRyx1REFBdUQsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDO1NBQ2pGO2FBQU07WUFDSCxJQUFJLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7WUFFckMsSUFBSSxJQUFJLEtBQUssT0FBTyxFQUFFO2dCQUNsQixNQUFNLEdBQUcsR0FBRyxxQ0FBcUMsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDO2dCQUNoRSxnQkFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFFakIsMEJBQTBCO2dCQUMxQixJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFO29CQUNwQyxNQUFNLElBQUksR0FBRyxFQUFDLE1BQU0sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBQyxDQUFDO29CQUNwRSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FDYixZQUFZLEVBQ1osSUFBQSwrQ0FBUyxFQUFDLEVBQUMsSUFBSSxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBQyxDQUFDLENBQ3RELENBQUM7aUJBQ0w7Z0JBRUQsSUFBSTtvQkFDQSxNQUFNLGVBQWUsR0FBRyxNQUFNLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsZ0JBQU0sQ0FBQyxDQUFDO29CQUN6RixNQUFNLEdBQUcsR0FBRyxHQUFHLGVBQWUsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsV0FBVyxtQkFBbUIsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDO29CQUNuRyxnQkFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFFakIsMEJBQTBCO29CQUMxQixJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFO3dCQUNwQyxNQUFNLElBQUksR0FBRzs0QkFDVCxNQUFNLEVBQUUsZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxlQUFlLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxJQUFJO3lCQUFDLENBQUM7d0JBQzVGLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUNiLFlBQVksRUFDWixJQUFBLCtDQUFTLEVBQUMsRUFBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FDdEQsQ0FBQztxQkFDTDtvQkFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLGVBQWUsQ0FBQyxDQUFDO29CQUN0RSxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxDQUFDO29CQUN6QyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxFQUFFLENBQUM7b0JBQy9DLFlBQVksQ0FBQyxlQUFlLEdBQUcsZUFBZSxDQUFDLFNBQVMsQ0FBQztpQkFDNUQ7Z0JBQUMsT0FBTyxDQUFDLEVBQUU7b0JBQ1IsS0FBSyxHQUFHLDRDQUE0QyxNQUFNLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQztvQkFDbEYsVUFBVSxHQUFHLENBQUMsQ0FBQyxLQUFLLENBQUM7b0JBRXJCLDBCQUEwQjtvQkFDMUIsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRTt3QkFDcEMsTUFBTSxJQUFJLEdBQUcsRUFBQyxNQUFNLEVBQUUsY0FBYyxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFDLENBQUM7d0JBQzNELElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUNiLFlBQVksRUFDWixJQUFBLCtDQUFTLEVBQUMsRUFBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FDeEQsQ0FBQztxQkFDTDtpQkFDSjthQUNKO2lCQUFNLEVBQUUsb0JBQW9CO2dCQUN6QixNQUFNLEdBQUcsR0FBRyxhQUFhLE1BQU0sQ0FBQyxJQUFJLHNCQUFzQixDQUFDO2dCQUMzRCxnQkFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFFakIsMEJBQTBCO2dCQUMxQixJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFO29CQUNwQyxNQUFNLElBQUksR0FBRyxFQUFDLE1BQU0sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBQyxDQUFDO29CQUNqRSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FDYixZQUFZLEVBQ1osSUFBQSwrQ0FBUyxFQUFDLEVBQUMsSUFBSSxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBQyxDQUFDLENBQ3RELENBQUM7aUJBQ0w7Z0JBRUQsSUFBSTtvQkFDQSxNQUFNLFVBQVUsR0FBRyxDQUFDLFFBQWdCLEVBQUUsU0FBaUIsRUFBUSxFQUFFO3dCQUM3RCxJQUFJLEdBQUcsR0FBRyxjQUFjLE1BQU0sQ0FBQyxJQUFJLFFBQVEsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO3dCQUNsRSxJQUFJLFNBQVMsRUFBRTs0QkFDWCxHQUFHLElBQUksT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUMsb0JBQW9CLENBQUM7eUJBQ2hFO3dCQUVELGdCQUFNLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO3dCQUVqQixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsdUJBQXVCLENBQUMsTUFBTSxFQUFFLFVBQVUsRUFBRSxRQUFRLEVBQUUsU0FBUyxDQUFDLENBQUM7d0JBQ3RGLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7d0JBRXpDLDBCQUEwQjt3QkFDMUIsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRTs0QkFDcEMsTUFBTSxJQUFJLEdBQUcsRUFBQyxNQUFNLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEVBQUUsUUFBUSxFQUFDLENBQUM7NEJBQ3hFLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxJQUFBLCtDQUFTLEVBQUMsRUFBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FBQyxDQUFDO3lCQUN4RjtvQkFDTCxDQUFDLENBQUM7b0JBRUYsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsOEJBQThCLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQyxDQUFDO29CQUM3RSxNQUFNLFdBQVcsR0FBRyxNQUFNLE1BQU0sQ0FBQyxVQUFVLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLGdCQUFNLEVBQUUsVUFBVSxDQUFDLENBQUM7b0JBQzlGLGdCQUFNLENBQUMsSUFBSSxDQUFDLHVCQUF1QixNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztvQkFDbkQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxlQUFlLENBQUMsRUFBQyxNQUFNLEVBQUMsQ0FBQyxDQUFDO29CQUN4QyxJQUFJLENBQUMsbUNBQW1DLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ2pELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQy9DLEVBQUMsU0FBUyxFQUFFLEtBQUssRUFBRSxrQkFBa0IsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBQyxDQUFDLENBQUM7b0JBQ3RGLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBQ3pDLE1BQU0sRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLDhCQUE4QixDQUFDLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQztvQkFDdkUsTUFBTSxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsR0FBRyxDQUFDLElBQUEsK0NBQVMsRUFBQyxLQUFLLENBQUMsRUFBRSxJQUFBLCtDQUFTLEVBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztvQkFDdkQsZ0JBQU0sQ0FBQyxJQUFJLENBQUMsV0FBVyxNQUFNLENBQUMsSUFBSSx1QkFBdUIsS0FBSyxTQUFTLEdBQUcsR0FBRyxDQUFDLENBQUM7b0JBQy9FLFlBQVksQ0FBQyxJQUFJLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxlQUFLLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQzVELFlBQVksQ0FBQyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsQ0FBQyxlQUFLLENBQUMsV0FBVyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUM7b0JBQ3BELElBQUksQ0FBQyxRQUFRLENBQUMsa0JBQWtCLEVBQUUsQ0FBQztvQkFFbkMsMEJBQTBCO29CQUMxQixJQUFJLFFBQVEsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxRQUFRLENBQUMsVUFBVSxFQUFFO3dCQUNwQyxNQUFNLElBQUksR0FBRyxFQUFDLE1BQU0sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFLEVBQUUsRUFBQyxDQUFDO3dCQUNoRixJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEVBQUUsSUFBQSwrQ0FBUyxFQUFDLEVBQUMsSUFBSSxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FBQyxDQUFDO3FCQUNuRjtpQkFDSjtnQkFBQyxPQUFPLENBQUMsRUFBRTtvQkFDUixnQkFBTSxDQUFDLEtBQUssQ0FBQyxjQUFjLE1BQU0sQ0FBQyxJQUFJLGFBQWEsQ0FBQyxHQUFHLENBQUMsQ0FBQztvQkFDekQsS0FBSyxHQUFHLGNBQWMsTUFBTSxDQUFDLElBQUksYUFBYSxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUM7b0JBQzNELFVBQVUsR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDO29CQUVyQixJQUFJLENBQUMsbUNBQW1DLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ2pELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxNQUFNLEVBQUUsV0FBVyxDQUFDLENBQUM7b0JBQ2xFLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUM7b0JBRXpDLDBCQUEwQjtvQkFDMUIsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsUUFBUSxDQUFDLFVBQVUsRUFBRTt3QkFDcEMsTUFBTSxJQUFJLEdBQUcsRUFBQyxNQUFNLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFDLENBQUM7d0JBQzVELElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksRUFBRSxJQUFBLCtDQUFTLEVBQUMsRUFBQyxJQUFJLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFDLENBQUMsQ0FBQyxDQUFDO3FCQUMxRjtpQkFDSjthQUNKO1lBRUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1NBQzNDO1FBRUQsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2pFLElBQUksQ0FBQyxxQkFBcUIsRUFBRTtZQUN4QixNQUFNLFFBQVEsR0FBRyxlQUFLLENBQUMsV0FBVyxDQUFDLE9BQU8sRUFBRSxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDakUsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxxQ0FBcUMsSUFBSSxFQUFFLEVBQUUsSUFBQSwrQ0FBUyxFQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUM7U0FDN0Y7UUFFRCxJQUFJLEtBQUssRUFBRTtZQUNQLGdCQUFNLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3BCLFVBQVUsSUFBSSxnQkFBTSxDQUFDLEtBQUssQ0FBQyxVQUFVLENBQUMsQ0FBQztTQUMxQztJQUNMLENBQUM7Q0FDSjtBQXRSRCw0QkFzUkM7QUFoUHVCO0lBQW5CLHdCQUFJOzhDQStDSjtBQWtDVztJQUFYLHdCQUFJOzhDQThKSiJ9