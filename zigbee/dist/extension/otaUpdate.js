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
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const utils_1 = __importDefault(require("../util/utils"));
const tradfri_1 = __importDefault(require("zigbee-herdsman-converters/lib/ota/tradfri"));
const extension_1 = __importDefault(require("./extension"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const device_1 = __importDefault(require("../model/device"));
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
        if (settings.get().advanced.ikea_ota_use_test_url) {
            tradfri_1.default.useTestURL();
        }
        for (const device of this.zigbee.devices(false)) {
            // In case Zigbee2MQTT is restared during an update, progress and remaining values are still in state.
            // remove them.
            this.removeProgressAndRemainingFromState(device);
        }
    }
    removeProgressAndRemainingFromState(device) {
        var _a, _b, _c, _d;
        (_b = (_a = this.state.get(device)) === null || _a === void 0 ? void 0 : _a.update) === null || _b === void 0 ? true : delete _b.progress;
        (_d = (_c = this.state.get(device)) === null || _c === void 0 ? void 0 : _c.update) === null || _d === void 0 ? true : delete _d.remaining;
    }
    async onZigbeeEvent(data) {
        if (settings.get().ota.disable_automatic_update_check)
            return;
        if (data.type !== 'commandQueryNextImageRequest' || !data.device.definition)
            return;
        logger_1.default.debug(`Device '${data.device.name}' requested OTA`);
        const supportsOTA = data.device.definition.hasOwnProperty('ota');
        if (supportsOTA) {
            // When a device does a next image request, it will usually do it a few times after each other
            // with only 10 - 60 seconds inbetween. It doesn't make sense to check for a new update
            // each time, so this interval can be set by the user. The default is 1,440 minutes (one day).
            const updateCheckInterval = settings.get().ota.update_check_interval * 1000 * 60;
            const check = this.lastChecked.hasOwnProperty(data.device.ieeeAddr) ?
                (Date.now() - this.lastChecked[data.device.ieeeAddr]) > updateCheckInterval : true;
            if (!check || this.inProgress.has(data.device.ieeeAddr))
                return;
            this.lastChecked[data.device.ieeeAddr] = Date.now();
            const available = await data.device.definition.ota.isUpdateAvailable(data.device.zh, logger_1.default, data.data);
            const payload = this.getEntityPublishPayload(available ? 'available' : 'idle');
            this.publishEntityState(data.device, payload);
            if (available) {
                const message = `Update available for '${data.device.name}'`;
                logger_1.default.info(message);
                /* istanbul ignore else */
                if (settings.get().advanced.legacy_api) {
                    const meta = { status: 'available', device: data.device.name };
                    this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message, meta }));
                }
            }
        }
        // Respond to the OTA request:
        // - In case we don't support OTA: respond with NO_IMAGE_AVAILABLE (0x98) (so the client stops requesting OTAs)
        // - In case we do support OTA: respond with ABORT (0x95) as we don't want to update now.
        const endpoint = data.device.zh.endpoints.find((e) => e.supportsOutputCluster('genOta'));
        if (endpoint) {
            // Some devices send OTA requests without defining OTA cluster as input cluster.
            await endpoint.commandResponse('genOta', 'queryNextImageResponse', { status: supportsOTA ? 0x95 : 0x98 });
        }
    }
    async readSoftwareBuildIDAndDateCode(device, update) {
        try {
            const endpoint = device.zh.endpoints.find((e) => e.supportsInputCluster('genBasic'));
            const result = await endpoint.read('genBasic', ['dateCode', 'swBuildId']);
            if (update) {
                device.zh.softwareBuildID = result.swBuildId;
                device.zh.dateCode = result.dateCode;
                device.zh.save();
            }
            return { softwareBuildID: result.swBuildId, dateCode: result.dateCode };
        }
        catch (e) {
            return null;
        }
    }
    getEntityPublishPayload(state, progress = null, remaining = null) {
        const payload = { update: { state } };
        if (progress !== null)
            payload.update.progress = progress;
        if (remaining !== null)
            payload.update.remaining = Math.round(remaining);
        /* istanbul ignore else */
        if (this.legacyApi) {
            payload.update_available = state === 'available';
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
                    const available = await device.definition.ota.isUpdateAvailable(device.zh, logger_1.default);
                    const msg = `${available ? 'Update' : 'No update'} available for '${device.name}'`;
                    logger_1.default.info(msg);
                    /* istanbul ignore else */
                    if (settings.get().advanced.legacy_api) {
                        const meta = { status: available ? 'available' : 'not_available', device: device.name };
                        this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                    }
                    const payload = this.getEntityPublishPayload(available ? 'available' : 'idle');
                    this.publishEntityState(device, payload);
                    this.lastChecked[device.ieeeAddr] = Date.now();
                    responseData.updateAvailable = available;
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
                        const payload = this.getEntityPublishPayload('updating', progress, remaining);
                        this.publishEntityState(device, payload);
                        /* istanbul ignore else */
                        if (settings.get().advanced.legacy_api) {
                            const meta = { status: `update_progress`, device: device.name, progress };
                            this.mqtt.publish('bridge/log', (0, json_stable_stringify_without_jsonify_1.default)({ type: `ota_update`, message: msg, meta }));
                        }
                    };
                    const from_ = await this.readSoftwareBuildIDAndDateCode(device, false);
                    await device.definition.ota.updateToLatest(device.zh, logger_1.default, onProgress);
                    const to = await this.readSoftwareBuildIDAndDateCode(device, true);
                    const [fromS, toS] = [(0, json_stable_stringify_without_jsonify_1.default)(from_), (0, json_stable_stringify_without_jsonify_1.default)(to)];
                    const msg = `Finished update of '${device.name}'` +
                        (to ? `, from '${fromS}' to '${toS}'` : ``);
                    logger_1.default.info(msg);
                    this.removeProgressAndRemainingFromState(device);
                    const payload = this.getEntityPublishPayload('idle');
                    this.publishEntityState(device, payload);
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
                    const payload = this.getEntityPublishPayload('available');
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
__decorate([
    bind_decorator_1.default
], OTAUpdate.prototype, "onZigbeeEvent", null);
__decorate([
    bind_decorator_1.default
], OTAUpdate.prototype, "onMQTTMessage", null);
exports.default = OTAUpdate;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib3RhVXBkYXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9vdGFVcGRhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkRBQTZDO0FBQzdDLDREQUFvQztBQUNwQyxrSEFBOEQ7QUFDOUQsMERBQWtDO0FBQ2xDLHlGQUFvRTtBQUNwRSw0REFBb0M7QUFDcEMsb0VBQWtDO0FBQ2xDLDZEQUFxQztBQU9yQyxNQUFNLGdCQUFnQixHQUFHLElBQUksTUFBTSxDQUFDLElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLHdCQUF3QixDQUFDLENBQUM7QUFDaEcsTUFBTSxVQUFVLEdBQ1osSUFBSSxNQUFNLENBQUMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsa0RBQWtELEVBQUUsR0FBRyxDQUFDLENBQUM7QUFFMUcsTUFBcUIsU0FBVSxTQUFRLG1CQUFTO0lBQWhEOztRQUNZLGVBQVUsR0FBRyxJQUFJLEdBQUcsRUFBRSxDQUFDO1FBQ3ZCLGdCQUFXLEdBQTBCLEVBQUUsQ0FBQztRQUN4QyxjQUFTLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUM7SUErUDNELENBQUM7SUE3UFksS0FBSyxDQUFDLEtBQUs7UUFDaEIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUN0RCxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ3hELElBQUksUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLFFBQVEsQ0FBQyxxQkFBcUIsRUFBRTtZQUMvQyxpQkFBVSxDQUFDLFVBQVUsRUFBRSxDQUFDO1NBQzNCO1FBRUQsS0FB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