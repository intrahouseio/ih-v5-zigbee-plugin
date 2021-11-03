"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const zigbee_herdsman_converters_1 = __importDefault(require("zigbee-herdsman-converters"));
const extension_1 = __importDefault(require("./extension"));
/**
 * This extension calls the zigbee-herdsman-converters onEvent.
 */
class OnEvent extends extension_1.default {
    async start() {
        for (const device of this.zigbee.devices(false)) {
            await this.callOnEvent(device, 'start', {});
        }
        this.eventBus.onDeviceMessage(this, (data) => this.callOnEvent(data.device, 'message', this.convertData(data)));
        this.eventBus.onDeviceJoined(this, (data) => this.callOnEvent(data.device, 'deviceJoined', this.convertData(data)));
        this.eventBus.onDeviceInterview(this, (data) => this.callOnEvent(data.device, 'deviceInterview', this.convertData(data)));
        this.eventBus.onDeviceAnnounce(this, (data) => this.callOnEvent(data.device, 'deviceAnnounce', this.convertData(data)));
        this.eventBus.onDeviceNetworkAddressChanged(this, (data) => this.callOnEvent(data.device, 'deviceNetworkAddressChanged', this.convertData(data)));
    }
    convertData(data) {
        return { ...data, device: data.device.zh };
    }
    async stop() {
        super.stop();
        for (const device of this.zigbee.devices(false)) {
            await this.callOnEvent(device, 'stop', {});
        }
    }
    async callOnEvent(device, type, data) {
        var _a;
        zigbee_herdsman_converters_1.default.onEvent(type, data, device.zh);
        if ((_a = device.definition) === null || _a === void 0 ? void 0 : _a.onEvent) {
            await device.definition.onEvent(type, data, device.zh, device.settings);
        }
    }
}
exports.default = OnEvent;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoib25FdmVudC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL2xpYi9leHRlbnNpb24vb25FdmVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7OztBQUFBLDRGQUE2QztBQUM3Qyw0REFBb0M7QUFFcEM7O0dBRUc7QUFDSCxNQUFxQixPQUFRLFNBQVEsbUJBQVM7SUFDakMsS0FBSyxDQUFDLEtBQUs7UUFDaEIsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUM3QyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztTQUMvQztRQUVELElBQUksQ0FBQyxRQUFRLENBQUMsZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNoSCxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQzdCLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsY0FBYyxFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3JGLElBQUksQ0FBQyxRQUFRLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUNoQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLGlCQUFpQixFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLElBQUksQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUMvQixDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLGdCQUFnQixFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3ZGLElBQUksQ0FBQyxRQUFRLENBQUMsNkJBQTZCLENBQUMsSUFBSSxFQUM1QyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLDZCQUE2QixFQUFFLElBQUksQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ3hHLENBQUM7SUFFTyxXQUFXLENBQUMsSUFBYztRQUM5QixPQUFPLEVBQUMsR0FBRyxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFDLENBQUM7SUFDN0MsQ0FBQztJQUVRLEtBQUssQ0FBQyxJQUFJO1FBQ2YsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2IsS0FBSyxNQUFNLE1BQU0sSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUM3QyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQztTQUM5QztJQUNMLENBQUM7SUFFTyxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQWMsRUFBRSxJQUFZLEVBQUUsSUFBYzs7UUFDbEUsb0NBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxNQUFNLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFbkMsSUFBSSxNQUFBLE1BQU0sQ0FBQyxVQUFVLDBDQUFFLE9BQU8sRUFBRTtZQUM1QixNQUFNLE1BQU0sQ0FBQyxVQUFVLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLEVBQUUsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUM7U0FDM0U7SUFDTCxDQUFDO0NBQ0o7QUFuQ0QsMEJBbUNDIn0=