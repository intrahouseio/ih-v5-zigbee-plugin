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
const debounce_1 = __importDefault(require("debounce"));
const extension_1 = __importDefault(require("./extension"));
const json_stable_stringify_without_jsonify_1 = __importDefault(require("json-stable-stringify-without-jsonify"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
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
            for (const key of Object.keys(data.message)) {
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
                logger_1.default.warn(`Please see: https://www.zigbee2mqtt.io/how_tos/how_to_support_new_devices.html.`);
            }
            return false;
        }
        return true;
    }
    async onDeviceMessage(data) {
        /* istanbul ignore next */
        if (!data.device)
            return;
        /**
         * Handling of re-transmitted Xiaomi messages.
         * https://github.com/Koenkk/zigbee2mqtt/issues/1238
         * https://github.com/Koenkk/zigbee2mqtt/issues/3592
         *
         * Some Xiaomi router devices re-transmit messages from Xiaomi end devices.
         * The network address of these message is set to the one of the Xiaomi router.
         * Therefore it looks like if the message came from the Xiaomi router, while in
         * fact it came from the end device.
         * Handling these message would result in false state updates.
         * The group ID attribute of these message defines the network address of the end device.
         */
        if (data.device.isXiaomi() && data.device.zh.type === 'Router' && data.groupID) {
            logger_1.default.debug('Handling re-transmitted Xiaomi message');
            data = { ...data, device: this.zigbee.deviceByNetworkAddress(data.groupID) };
        }
        if (!this.shouldProcess(data))
            return;
        const converters = data.device.definition.fromZigbee.filter((c) => {
            const type = Array.isArray(c.type) ? c.type.includes(data.type) : c.type === data.type;
            return c.cluster === data.cluster && type;
        });
        // Check if there is an available converter, genOta messages are not interesting.
        const ignoreClusters = ['genOta', 'genTime', 'genBasic'];
        if (converters.length == 0 && !ignoreClusters.includes(data.cluster)) {
            logger_1.default.debug(`No converter available for '${data.device.definition.model}' with ` +
                `cluster '${data.cluster}' and type '${data.type}' and data '${(0, json_stable_stringify_without_jsonify_1.default)(data.data)}'`);
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
            if (data.device.settings.debounce) {
                this.publishDebounce(data.device, payload, data.device.settings.debounce, data.device.settings.debounce_ignore);
            }
            else {
                this.publishEntityState(data.device, payload);
            }
        };
        const meta = { device: data.device.zh, logger: logger_1.default, state: this.state.get(data.device) };
        let payload = {};
        for (const converter of converters) {
            try {
                const converted = await converter.convert(data.device.definition, data, publish, data.device.settings, meta);
                if (converted) {
                    payload = { ...payload, ...converted };
                }
            }
            catch (error) {
                // istanbul ignore next
                logger_1.default.error(`Exception while calling fromZigbee converter: ${error.message}}`);
            }
        }
        if (Object.keys(payload).length) {
            publish(payload);
        }
    }
}
__decorate([
    bind_decorator_1.default
], Receive.prototype, "onPublishEntityState", null);
__decorate([
    bind_decorator_1.default
], Receive.prototype, "onDeviceMessage", null);
exports.default = Receive;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVjZWl2ZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vcmVjZWl2ZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSwyREFBNkM7QUFDN0MsNERBQW9DO0FBQ3BDLHdEQUFnQztBQUNoQyw0REFBb0M7QUFDcEMsa0hBQThEO0FBQzlELG9FQUFrQztBQUlsQyxNQUFxQixPQUFRLFNBQVEsbUJBQVM7SUFBOUM7O1FBQ1ksWUFBTyxHQUEwQixFQUFFLENBQUM7UUFDcEMsZUFBVSxHQUFtRSxFQUFFLENBQUM7SUEySjVGLENBQUM7SUF6SkcsS0FBSyxDQUFDLEtBQUs7UUFDUCxJQUFJLENBQUMsUUFBUSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsUUFBUSxDQUFDLGVBQWUsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFSyxLQUFLLENBQUMsb0JBQW9CLENBQUMsSUFBa0M7UUFDL0Q7Ozs7V0FJRztRQUNILElBQUksSUFBSSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsSUFBSSxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO1lBQy9ELElBQUksQ0FBQyxpQkFBaUIsS0FBSyxpQkFBaUIsSUFBSSxJQUFJLENBQUMsaUJBQWlCLEtBQUssaUJBQWlCLEVBQUU7WUFDOUYsS0FBSyxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsRUFBRTtnQkFDekMsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQzdEO1NBQ0o7SUFDTCxDQUFD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