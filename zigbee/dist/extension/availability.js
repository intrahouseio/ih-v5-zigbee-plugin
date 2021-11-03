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
const extension_1 = __importDefault(require("./extension"));
const logger_1 = __importDefault(require("../util/logger"));
const utils_1 = __importDefault(require("../util/utils"));
const settings = __importStar(require("../util/settings"));
const debounce_1 = __importDefault(require("debounce"));
const bind_decorator_1 = __importDefault(require("bind-decorator"));
class Availability extends extension_1.default {
    constructor() {
        super(...arguments);
        this.timers = {};
        this.availabilityCache = {};
        this.retrieveStateDebouncers = {};
        this.pingQueue = [];
        this.pingQueueExecuting = false;
    }
    getTimeout(device) {
        var _a, _b, _c;
        if (typeof device.settings.availability === 'object' && ((_a = device.settings.availability) === null || _a === void 0 ? void 0 : _a.timeout) != null) {
            return utils_1.default.minutes(device.settings.availability.timeout);
        }
        const key = this.isActiveDevice(device) ? 'active' : 'passive';
        const availabilitySettings = settings.get().availability;
        if (typeof availabilitySettings === 'object' && ((_b = availabilitySettings[key]) === null || _b === void 0 ? void 0 : _b.timeout) != null) {
            return utils_1.default.minutes((_c = availabilitySettings[key]) === null || _c === void 0 ? void 0 : _c.timeout);
        }
        return key === 'active' ? utils_1.default.minutes(10) : utils_1.default.hours(25);
    }
    isActiveDevice(device) {
        return (device.zh.type === 'Router' && device.zh.powerSource !== 'Battery') ||
            device.zh.powerSource === 'Mains (single phase)';
    }
    isAvailable(device) {
        const ago = Date.now() - device.zh.lastSeen;
        return ago < this.getTimeout(device);
    }
    resetTimer(device) {
        clearTimeout(this.timers[device.ieeeAddr]);
        // If the timer triggers, the device is not avaiable anymore otherwise resetTimer already have been called
        if (this.isActiveDevice(device)) {
            // If device did not check in, ping it, if that fails it will be marked as offline
            this.timers[device.ieeeAddr] = setTimeout(() => this.addToPingQueue(device), this.getTimeout(device) + utils_1.default.seconds(1));
        }
        else {
            this.timers[device.ieeeAddr] = setTimeout(() => this.publishAvailability(device, true), this.getTimeout(device) + utils_1.default.seconds(1));
        }
    }
    addToPingQueue(device) {
        this.pingQueue.push(device);
        this.pingQueueExecuteNext();
    }
    removeFromPingQueue(device) {
        const index = this.pingQueue.findIndex((d) => d.ieeeAddr === device.ieeeAddr);
        index != -1 && this.pingQueue.splice(index, 1);
    }
    async pingQueueExecuteNext() {
        if (this.pingQueue.length === 0 || this.pingQueueExecuting)
            return;
        this.pingQueueExecuting = true;
        const device = this.pingQueue[0];
        let pingedSuccessfully = false;
        const available = this.availabilityCache[device.ieeeAddr] || this.isAvailable(device);
        const attempts = available ? 2 : 1;
        for (let i = 0; i < attempts; i++) {
            try {
                // Enable recovery if device is marked as available and first ping fails.
                const disableRecovery = !(i == 1 && available);
                await device.zh.ping(disableRecovery);
                pingedSuccessfully = true;
                logger_1.default.debug(`Succesfully pinged '${device.name}' (attempt ${i + 1}/${attempts})`);
                break;
            }
            catch (error) {
                logger_1.default.error(`Failed to ping '${device.name}' (attempt ${i + 1}/${attempts}, ${error.message})`);
                // Try again in 3 seconds.
                const lastAttempt = i - 1 === attempts;
                !lastAttempt && await utils_1.default.sleep(3);
            }
        }
        this.publishAvailability(device, !pingedSuccessfully);
        this.resetTimer(device);
        this.removeFromPingQueue(device);
        // Sleep 2 seconds before executing next ping
        await utils_1.default.sleep(2);
        this.pingQueueExecuting = false;
        this.pingQueueExecuteNext();
    }
    async start() {
        logger_1.default.warn('Using experimental new availability feature');
        this.eventBus.onDeviceRenamed(this, (data) => this.publishAvailability(data.device, false, true));
        this.eventBus.onDeviceLeave(this, (data) => clearTimeout(this.timers[data.ieeeAddr]));
        this.eventBus.onDeviceAnnounce(this, (data) => this.retrieveState(data.device));
        this.eventBus.onLastSeenChanged(this, this.onLastSeenChanged);
        for (const device of this.zigbee.devices(false)) {
            if (utils_1.default.isAvailabilityEnabledForDevice(device, settings.get())) {
                // Publish initial availablility
                this.publishAvailability(device, true);
                this.resetTimer(device);
                // If an active device is initially unavailable, ping it.
                if (this.isActiveDevice(device) && !this.isAvailable(device)) {
                    this.addToPingQueue(device);
                }
            }
        }
    }
    publishAvailability(device, logLastSeen, forcePublish = false) {
        if (logLastSeen) {
            const ago = Date.now() - device.zh.lastSeen;
            if (this.isActiveDevice(device)) {
                logger_1.default.debug(`Active device '${device.name}' was last seen ` +
                    `'${(ago / utils_1.default.minutes(1)).toFixed(2)}' minutes ago.`);
            }
            else {
                logger_1.default.debug(`Passive device '${device.name}' was last seen '${(ago / utils_1.default.hours(1)).toFixed(2)}' hours ago.`);
            }
        }
        const available = this.isAvailable(device);
        if (!forcePublish && this.availabilityCache[device.ieeeAddr] == available) {
            return;
        }
        if (device.ieeeAddr in this.availabilityCache && available &&
            this.availabilityCache[device.ieeeAddr] === false) {
            logger_1.default.debug(`Device '${device.name}' reconnected`);
            this.retrieveState(device);
        }
        const topic = `${device.name}/availability`;
        const payload = available ? 'online' : 'offline';
        this.availabilityCache[device.ieeeAddr] = available;
        this.mqtt.publish(topic, payload, { retain: true, qos: 0 });
    }
    onLastSeenChanged(data) {
        if (utils_1.default.isAvailabilityEnabledForDevice(data.device, settings.get())) {
            // Remove from ping queue, not necessary anymore since we know the device is online.
            this.removeFromPingQueue(data.device);
            this.resetTimer(data.device);
            this.publishAvailability(data.device, false);
        }
    }
    async stop() {
        super.stop();
        Object.values(this.timers).forEach((t) => clearTimeout(t));
    }
    retrieveState(device) {
        var _a, _b;
        /**
         * Retrieve state of a device in a debounced manner, this function is called on a 'deviceAnnounce' which a
         * device can send multiple times after each other.
         */
        if (device.definition && !device.zh.interviewing && !this.retrieveStateDebouncers[device.ieeeAddr]) {
            this.retrieveStateDebouncers[device.ieeeAddr] = (0, debounce_1.default)(async () => {
                var _a;
                try {
                    logger_1.default.debug(`Retrieving state of '${device.name}' after reconnect`);
                    // Color and color temperature converters do both, only needs to be called once.
                    const keySet = [['state'], ['brightness'], ['color', 'color_temp']];
                    for (const keys of keySet) {
                        const converter = device.definition.toZigbee.find((c) => c.key.find((k) => keys.includes(k)));
                        await ((_a = converter === null || converter === void 0 ? void 0 : converter.convertGet) === null || _a === void 0 ? void 0 : _a.call(converter, device.endpoint(), keys[0], { message: this.state.get(device) || {}, mapped: device.definition }));
                    }
                }
                catch (error) {
                    logger_1.default.error(`Failed to read state of '${device.name}' after reconnect (${error.message})`);
                }
            }, utils_1.default.seconds(2));
        }
        (_b = (_a = this.retrieveStateDebouncers)[device.ieeeAddr]) === null || _b === void 0 ? void 0 : _b.call(_a);
    }
}
__decorate([
    bind_decorator_1.default
], Availability.prototype, "onLastSeenChanged", null);
exports.default = Availability;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXZhaWxhYmlsaXR5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vbGliL2V4dGVuc2lvbi9hdmFpbGFiaWxpdHkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsNERBQW9DO0FBQ3BDLDREQUFvQztBQUNwQywwREFBa0M7QUFDbEMsMkRBQTZDO0FBQzdDLHdEQUFnQztBQUNoQyxvRUFBa0M7QUFFbEMsTUFBcUIsWUFBYSxTQUFRLG1CQUFTO0lBQW5EOztRQUNZLFdBQU0sR0FBa0MsRUFBRSxDQUFDO1FBQzNDLHNCQUFpQixHQUEyQixFQUFFLENBQUM7UUFDL0MsNEJBQXVCLEdBQThCLEVBQUUsQ0FBQztRQUN4RCxjQUFTLEdBQWEsRUFBRSxDQUFDO1FBQ3pCLHVCQUFrQixHQUFHLEtBQUssQ0FBQztJQStLdkMsQ0FBQztJQTdLVyxVQUFVLENBQUMsTUFBYzs7UUFDN0IsSUFBSSxPQUFPLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxLQUFLLFFBQVEsSUFBSSxDQUFBLE1BQUEsTUFBTSxDQUFDLFFBQVEsQ0FBQyxZQUFZLDBDQUFFLE9BQU8sS0FBSSxJQUFJLEVBQUU7WUFDbkcsT0FBTyxlQUFLLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1NBQzlEO1FBRUQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDL0QsTUFBTSxvQkFBb0IsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLENBQUMsWUFBWSxDQUFDO1FBQ3pELElBQUksT0FBTyxvQkFBb0IsS0FBSyxRQUFRLElBQUksQ0FBQSxNQUFBLG9CQUFvQixDQUFDLEdBQUcsQ0FBQywwQ0FBRSxPQUFPLEtBQUksSUFBSSxFQUFFO1lBQ3hGLE9BQU8s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