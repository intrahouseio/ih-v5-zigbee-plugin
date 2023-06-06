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
const debounce_1 = __importDefault(require("debounce"));
const extension_1 = __importDefault(require("./extension"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
const utils_1 = __importDefault(require("../util/utils"));
class Receive extends extension_1.default {
    constructor() {
        super(...arguments);
        this.elapsed = {};
        this.debouncers = {};
    }
    async start() {
        this.eventBus.onPublishEntityState(this, this.onPublishEntityState);
        this.eventBus.onDeviceMessage(this, this.onDeviceMessage);
    }
    async onPublishEntityState(data) {
        /**
         * Prevent that outdated properties are being published.
         * In case that e.g. the state is currently held back by a debounce and a new state is published
         * remove it from the to be send debounced message.
         */
        if (data.entity.isDevice() && this.debouncers[data.entity.ieeeAddr] &&
            data.stateChangeReason !== 'publishDebounce' && data.stateChangeReason !== 'lastSeenChanged') {
            for (const key of Object.keys(data.payload)) {
                delete this.debouncers[data.entity.ieeeAddr].payload[key];
            }
        }
    }
    publishDebounce(device, payload, time, debounceIgnore) {
        if (!this.debouncers[device.ieeeAddr]) {
            this.debouncers[device.ieeeAddr] = {
                payload: {},
                publish: (0, debounce_1.default)(() => {
                    this.publishEntityState(device, this.debouncers[device.ieeeAddr].payload, 'publishDebounce');
                    this.debouncers[device.ieeeAddr].payload = {};
                }, time * 1000),
            };
        }
        if (this.isPayloadConflicted(payload, this.debouncers[device.ieeeAddr].payload, debounceIgnore)) {
            // publish previous payload immediately
            this.debouncers[device.ieeeAddr].publish.flush();
        }
        // extend debounced payload with current
        this.debouncers[device.ieeeAddr].payload = { ...this.debouncers[device.ieeeAddr].payload, ...payload };
        // Update state cache right away. This makes sure that during debouncing cached state is always up to date.
        // ( Update right away as "lastSeenChanged" event might occur while debouncer is still active.
        //  And if that happens it would cause old message to be published from cache.
        // By updating cache we make sure that state cache is always up-to-date.
        this.state.set(device, this.debouncers[device.ieeeAddr].payload);
        this.debouncers[device.ieeeAddr].publish();
    }
    // if debounce_ignore are specified (Array of strings)
    // then all newPayload values with key present in debounce_ignore
    // should equal or be undefined in oldPayload
    // otherwise payload is conflicted
    isPayloadConflicted(newPayload, oldPayload, debounceIgnore) {
        let result = false;
        Object.keys(oldPayload)
            .filter((key) => (debounceIgnore || []).includes(key))
            .forEach((key) => {
            if (typeof newPayload[key] !== 'undefined' && newPayload[key] !== oldPayload[key]) {
                result = true;
            }
        });
        return result;
    }
    shouldProcess(data) {
        if (!data.device.definition) {
            if (data.device.zh.interviewing) {
                logger_1.default.debug(`Skipping message, definition is undefined and still interviewing`);
            }
            else {
                logger_1.default.warn(`Received message from unsupported device with Zigbee model '${data.device.zh.modelID}' ` +
                    `and manufacturer name '${data.device.zh.manufacturerName}'`);
                // eslint-disable-next-line max-len
                logger_1.default.warn(`Please see: https://www.zigbee2mqtt.io/advanced/support-new-devices/01_support_new_devices.html`);
            }
            return false;
        }
        return true;
    }
    async onDeviceMessage(data) {
        /* istanbul ignore next */
        if (!data.device)
            return;
        if (!this.shouldProcess(data)) {
            utils_1.default.publishLastSeen({ device: data.device, reason: 'messageEmitted' }, settings.get(), true, this.publishEntityState);
            return;
        }
        const converters = data.device.definition.fromZigbee.filter((c) => {
            const type = Array.isArray(c.type) ? c.type.includes(data.type) : c.type === data.type;
            return c.cluster === data.cluster && type;
        });
        // Check if there is an available converter, genOta messages are not interesting.
        const ignoreClusters = ['genOta', 'genTime', 'genBasic', 'genPollCtrl'];
        if (converters.length == 0 && !ignoreClusters.includes(data.cluster)) {
            logger_1.default.debug(`No converter available for '${data.device.definition.model}' with ` +
                `cluster '${data.cluster}' and type '${data.type}' and data '${(0, json_stable_stringify_without_jsonify_1.default)(data.data)}'`);
            utils_1.default.publishLastSeen({ device: data.device, reason: 'messageEmitted' }, settings.get(), true, this.publishEntityState);
            return;
        }
        // Convert this Zigbee message to a MQTT message.
        // Get payload for the message.
        // - If a payload is returned publish it to the MQTT broker
        // - If NO payload is returned do nothing. This is for non-standard behaviour
        //   for e.g. click switches where we need to count number of clicks and detect long presses.
        const publish = (payload) => {
            if (settings.get().advanced.elapsed) {
                const now = Date.now();
                if (this.elapsed[data.device.ieeeAddr]) {
                    payload.elapsed = now - this.elapsed[data.device.ieeeAddr];
                }
                this.elapsed[data.device.ieeeAddr] = now;
            }
            // Check if we have to debounce
            if (data.device.options.debounce) {
                this.publishDebounce(data.device, payload, data.device.options.debounce, data.device.options.debounce_ignore);
            }
            else {
                this.publishEntityState(data.device, payload);
            }
        };
        const meta = { device: data.device.zh, logger: logger_1.default, state: this.state.get(data.device) };
        let payload = {};
        for (const converter of converters) {
            try {
                const converted = await converter.convert(data.device.definition, data, publish, data.device.options, meta);
                if (converted) {
                    payload = { ...payload, ...converted };
                }
            }
            catch (error) /* istanbul ignore next */ {
                logger_1.default.error(`Exception while calling fromZigbee converter: ${error.message}}`);
                logger_1.default.debug(error.stack);
            }
        }
        if (Object.keys(payload).length) {
            publish(payload);
        }
        else {
            utils_1.default.publishLastSeen({ device: data.device, reason: 'messageEmitted' }, settings.get(), true, this.publishEntityState);
        }
    }
}
exports.default = Receive;
__decorate([
    bind_decorator_1.default
], Receive.prototype, "onPublishEntityState", null);
__decorate([
    bind_decorator_1.default
], Receive.prototype, "onDeviceMessage", null);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVjZWl2ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vcmVjZWl2ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMkRBQTZDO0FBQzdDLDREQUFvQztBQUNwQyx3REFBZ0M7QUFDaEMsNERBQW9DO0FBQ3BDLGtIQUE4RDtBQUM5RCxvRUFBa0M7QUFDbEMsMERBQWtDO0FBSWxDLE1BQXFCLE9BQVEsU0FBUSxtQkFBUztJQUE5Qzs7UUFDWSxZQUFPLEdBQTBCLEVBQUUsQ0FBQztRQUNwQyxlQUFVLEdBQW1FLEVBQUUsQ0FBQztJQTJKNUYsQ0FBQztJQXpKRyxLQUFLLENBQUMsS0FBSztRQUNQLElBQUksQ0FBQyxRQUFRLENBQUMsb0JBQW9CLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO1FBQ3BFLElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7SUFDOUQsQ0FBQztJQUVXLEFBQU4sS0FBSyxDQUFDLG9CQUFvQixDQUFDLElBQWtDO1FBQy9EOzs7O1dBSUc7UUFDSCxJQUFJLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLElBQUksSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQztZQUMvRCxJQUFJLENBQUMsaUJBQWlCLEtBQUssaUJBQWlCLElBQUksSUFBSSxDQUFDLGlCQUFpQixLQUFLLGlCQUFpQixFQUFFO1lBQzlGLEtBQUssTUFBTSxHQUFHLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUU7Z0JBQ3pDLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FB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