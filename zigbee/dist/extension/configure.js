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
const utils_1 = __importDefault(require("../util/utils"));
const logger_1 = __importDefault(require("../util/logger"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const zigbee_herdsman_converters_1 = __importDefault(require("zigbee-herdsman-converters"));
const extension_1 = __importDefault(require("./extension"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const device_1 = __importDefault(require("../model/device"));
/**
 * This extension calls the zigbee-herdsman-converters definition configure() method
 */
class Configure extends extension_1.default {
    constructor() {
        super(...arguments);
        this.configuring = new Set();
        this.attempts = {};
        this.topic = `${settings.get().mqtt.base_topic}/bridge/request/device/configure`;
        this.legacyTopic = `${settings.get().mqtt.base_topic}/bridge/configure`;
    }
    async onReportingDisabled(data) {
        var _a;
        // Disabling reporting unbinds some cluster which could be bound by configure, re-setup.
        if ((_a = data.device.zh.meta) === null || _a === void 0 ? void 0 : _a.hasOwnProperty('configured')) {
            delete data.device.zh.meta.configured;
            data.device.zh.save();
        }
        await this.configure(data.device, 'reporting_disabled');
    }
    async onMQTTMessage(data) {
        if (data.topic === this.legacyTopic) {
            const device = this.zigbee.resolveEntity(data.message);
            if (!device || !(device instanceof device_1.default)) {
                logger_1.default.error(`Device '${data.message}' does not exist`);
                return;
            }
            if (!device.definition || !device.definition.configure) {
                logger_1.default.warn(`Skipping configure of '${device.name}', device does not require this.`);
                return;
            }
            this.configure(device, 'mqtt_message', true);
        }
        else if (data.topic === this.topic) {
            const message = utils_1.default.parseJSON(data.message, data.message);
            const ID = typeof message === 'object' && message.hasOwnProperty('id') ? message.id : message;
            let error = null;
            const device = this.zigbee.resolveEntity(ID);
            if (!device || !(device instanceof device_1.default)) {
                error = `Device '${ID}' does not exist`;
            }
            else if (!device.definition || !device.definition.configure) {
                error = `Device '${device.name}' cannot be configured`;
            }
            else {
                try {
                    await this.configure(device, 'mqtt_message', true, true);
                }
                catch (e) {
                    error = `Failed to configure (${e.message})`;
                }
            }
            const response = utils_1.default.getResponse(message, { id: ID }, error);
            await this.mqtt.publish(`bridge/response/device/configure`, (0, json_stable_stringify_without_jsonify_1.default)(response));
        }
    }
    async start() {
        for (const device of this.zigbee.devices(false)) {
            await this.configure(device, 'started');
        }
        this.eventBus.onDeviceJoined(this, (data) => {
            if (data.device.zh.meta.hasOwnProperty('configured')) {
                delete data.device.zh.meta.configured;
                data.device.zh.save();
            }
            this.configure(data.device, 'zigbee_event');
        });
        this.eventBus.onDeviceInterview(this, (data) => this.configure(data.device, 'zigbee_event'));
        this.eventBus.onLastSeenChanged(this, (data) => this.configure(data.device, 'zigbee_event'));
        this.eventBus.onMQTTMessage(this, this.onMQTTMessage);
        this.eventBus.onReportingDisabled(this, this.onReportingDisabled);
    }
    async configure(device, event, force = false, thowError = false) {
        var _a, _b;
        if (!force) {
            if (!((_a = device.definition) === null || _a === void 0 ? void 0 : _a.configure) || device.zh.interviewing) {
                return;
            }
            if (((_b = device.zh.meta) === null || _b === void 0 ? void 0 : _b.hasOwnProperty('configured')) &&
                device.zh.meta.configured === zigbee_herdsman_converters_1.default.getConfigureKey(device.definition)) {
                return;
            }
            // Only configure end devices when it is active, otherwise it will likely fails as they are sleeping.
            if (device.zh.type === 'EndDevice' && event !== 'zigbee_event') {
                return;
            }
        }
        if (this.configuring.has(device.ieeeAddr) || (this.attempts[device.ieeeAddr] >= 3 && !force)) {
            return;
        }
        this.configuring.add(device.ieeeAddr);
        if (!this.attempts.hasOwnProperty(device.ieeeAddr)) {
            this.attempts[device.ieeeAddr] = 0;
        }
        logger_1.default.info(`Configuring '${device.name}'`);
        try {
            await device.definition.configure(device.zh, this.zigbee.firstCoordinatorEndpoint(), logger_1.default);
            logger_1.default.info(`Successfully configured '${device.name}'`);
            device.zh.meta.configured = zigbee_herdsman_converters_1.default.getConfigureKey(device.definition);
            device.zh.save();
            this.eventBus.emitDevicesChanged();
        }
        catch (error) {
            this.attempts[device.ieeeAddr]++;
            const attempt = this.attempts[device.ieeeAddr];
            const msg = `Failed to configure '${device.name}', attempt ${attempt} (${error.stack})`;
            logger_1.default.error(msg);
            if (thowError) {
                throw error;
            }
        }
        this.configuring.delete(device.ieeeAddr);
    }
}
__decorate([
    bind_decorator_1.default
], Configure.prototype, "onReportingDisabled", null);
__decorate([
    bind_decorator_1.default
], Configure.prototype, "onMQTTMessage", null);
exports.default = Configure;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9jb25maWd1cmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkRBQTZDO0FBQzdDLDBEQUFrQztBQUNsQyw0REFBb0M7QUFDcEMsa0hBQThEO0FBQzlELDRGQUE2QztBQUM3Qyw0REFBb0M7QUFDcEMsb0VBQWtDO0FBQ2xDLDZEQUFxQztBQUVyQzs7R0FFRztBQUNILE1BQXFCLFNBQVUsU0FBUSxtQkFBUztJQUFoRDs7UUFDWSxnQkFBVyxHQUFHLElBQUksR0FBRyxFQUFFLENBQUM7UUFDeEIsYUFBUSxHQUEwQixFQUFFLENBQUM7UUFDckMsVUFBSyxHQUFHLEdBQUcsUUFBUSxDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLGtDQUFrQyxDQUFDO1FBQzVFLGdCQUFXLEdBQUcsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsbUJBQW1CLENBQUM7SUFvSC9FLENBQUM7SUFsSGlCLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxJQUFpQzs7UUFDckUsd0ZBQXdGO1FBQ3hGLElBQUksTUFBQSxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLDBDQUFFLGNBQWMsQ0FBQyxZQUFZLENBQUMsRUFBRTtZQUNuRCxPQUFPLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7WUFDdEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7U0FDekI7UUFFRCxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFYSxLQUFLLENBQUMsYUFBYSxDQUFDLElBQTJCO1FBQ3pELElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxJQUFJLENBQUMsV0FBVyxFQUFFO1lBQ2pDLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUN2RCxJQUFJLENBQUMsTUFBTSxJQUFJLENBQUMsQ0FBQyxNQUFNLFlBQVksZ0JBQU0sQ0FBQyxFQUFFO2dCQUN4QyxnQkFBTSxDQUFDLEtBQUssQ0FBQyxXQUFXLElBQUksQ0FBQyxPQUFPLGtCQUFrQixDQUFDLENBQUM7Z0JBQ3hELE9BQU87YUFDVjtZQUVELElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxJQUFJLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLEVBQUU7Z0JBQ3BELGdCQUFNLENBQUMsSUFBSSxDQUFDLDBCQUEwQixNQUFNLENBQUMsSUFBSSxrQ0FBa0MsQ0FBQyxDQUFDO2dCQUNyRixPQUFPO2FBQ1Y7WUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxjQUFjLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDaEQ7YUFBTSxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssSUFBSSxDQUFDLEtBQUssRUFBRTtZQUNsQyxNQUFNLE9BQU8sR0FBRyxlQUFLLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQzVELE1BQU0sRUFBRSxHQUFHLE9BQU8sT0FBTyxLQUFLLFFBQVEsSUFBSSxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7WUFDOUYsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBRWpCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsYUFBYSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQzdDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxDQUFDLE1BQU0sWUFBWSxnQkFBTSxDQUFDLEVBQUU7Z0JBQ3hDLEtBQUssR0FBRyxXQUFXLEVBQUUsa0JBQWtCLENBQUM7YUFDM0M7aUJBQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLElBQUksQ0FBQyxNQUFNLENBQUMsVUFBVSxDQUFDLFNBQVMsRUFBRTtnQkFDM0QsS0FBSyxHQUFHLFdBQVcsTUFBTSxDQUFDLElBQUksd0JBQXdCLENBQUM7YUFDMUQ7aUJBQU07Z0JBQ0gsSUFBSTtvQkFDQSxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxFQUFFLGNBQWMsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7aUJBQzVEO2dCQUFDLE9BQU8sQ0FBQyxFQUFFO29CQUNSLEtBQUssR0FBRyx3QkFBd0IsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDO2lCQUNoRDthQUNKO1lBRUQsTUFBTSxRQUFRLEdBQUcsZUFBSyxDQUFDLFdBQVcsQ0FBQyxPQUFPLEVBQUUsRUFBQyxFQUFFLEVBQUUsRUFBRSxFQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDN0QsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxrQ0FBa0MsRUFBRSxJQUFBLCtDQUFTLEVBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztTQUNwRjtJQUNMLENBQUM7SUFFUSxLQUFLLENBQUMsS0FBSztRQUNoQixLQUFLLE1BQU0sTUFBTSxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxFQUFFO1lBQzdDLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7U0FDM0M7UUFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtZQUN4QyxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsWUFBWSxDQUFDLEVBQUU7Z0JBQ2xELE9BQU8sSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztnQkFDdEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7YUFDekI7WUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsY0FBYyxDQUFDLENBQUM7UUFDaEQsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsUUFBUSxDQUFDLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFDN0YsSUFBSSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBQzdGLElBQUksQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUM7UUFDdEQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDdEUsQ0FBQztJQUVPLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBYyxFQUFFLEtBQXlFLEVBQzdHLEtBQUssR0FBQyxLQUFLLEVBQUUsU0FBUyxHQUFDLEtBQUs7O1FBQzVCLElBQUksQ0FBQyxLQUFLLEVBQUU7WUFDUixJQUFJLENBQUMsQ0FBQSxNQUFBLE1BQU0sQ0FBQyxVQUFVLDBDQUFFLFNBQVMsQ0FBQSxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUMsWUFBWSxFQUFFO2dCQUN6RCxPQUFPO2FBQ1Y7WUFFRCxJQUFJLENBQUEsTUFBQSxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksMENBQUUsY0FBYyxDQUFDLFlBQVksQ0FBQztnQkFDNUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsVUFBVSxLQUFLLG9DQUFHLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsRUFBRTtnQkFDdEUsT0FBTzthQUNWO1lBRUQscUdBQXFHO1lBQ3JHLElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssV0FBVyxJQUFJLEtBQUssS0FBSyxjQUFjLEVBQUU7Z0JBQzVELE9BQU87YUFDVjtTQUNKO1FBRUQsSUFBSSxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUMxRixPQUFPO1NBQ1Y7UUFFRCxJQUFJLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7UUFFdEMsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRTtZQUNoRCxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDdEM7UUFFRCxnQkFBTSxDQUFDLElBQUksQ0FBQyxnQkFBZ0IsTUFBTSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7UUFDNUMsSUFBSTtZQUNBLE1BQU0sTUFBTSxDQUFDLFVBQVUsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsRUFBRSxJQUFJLENBQUMsTUFBTSxDQUFDLHdCQUF3QixFQUFFLEVBQUUsZ0JBQU0sQ0FBQyxDQUFDO1lBQzdGLGdCQUFNLENBQUMsSUFBSSxDQUFDLDRCQUE0QixNQUFNLENBQUMsSUFBSSxHQUFHLENBQUMsQ0FBQztZQUN4RCxNQUFNLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxVQUFVLEdBQUcsb0NBQUcsQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQ25FLE1BQU0sQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDakIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1NBQ3RDO1FBQUMsT0FBTyxLQUFLLEVBQUU7WUFDWixJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDO1lBQ2pDLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQy9DLE1BQU0sR0FBRyxHQUFHLHdCQUF3QixNQUFNLENBQUMsSUFBSSxjQUFjLE9BQU8sS0FBSyxLQUFLLENBQUMsS0FBSyxHQUFHLENBQUM7WUFDeEYsZ0JBQU0sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7WUFFbEIsSUFBSSxTQUFTLEVBQUU7Z0JBQ1gsTUFBTSxLQUFLLENBQUM7YUFDZjtTQUNKO1FBRUQsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQzdDLENBQUM7Q0FDSjtBQWxIUztJQUFMLHdCQUFJO29EQVFKO0FBRUs7SUFBTCx3QkFBSTs4Q0FtQ0o7QUFuREwsNEJBd0hDIn0=