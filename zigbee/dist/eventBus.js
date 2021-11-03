"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = __importDefault(require("events"));
events_1.default.captureRejections = true;
class EventBus {
    constructor(onError) {
        this.callbacksByExtension = {};
        this.emitter = new events_1.default.EventEmitter();
        this.emitter.setMaxListeners(100);
        this.emitter.on('error', onError);
    }
    emitAdapterDisconnected() {
        this.emitter.emit('adapterDisconnected');
    }
    onAdapterDisconnected(key, callback) {
        this.on('adapterDisconnected', callback, key);
    }
    emitPermitJoinChanged(data) {
        this.emitter.emit('permitJoinChanged', data);
    }
    onPermitJoinChanged(key, callback) {
        this.on('permitJoinChanged', callback, key);
    }
    emitDeviceRenamed(data) {
        this.emitter.emit('deviceRenamed', data);
    }
    onDeviceRenamed(key, callback) {
        this.on('deviceRenamed', callback, key);
    }
    emitDeviceRemoved(data) {
        this.emitter.emit('deviceRemoved', data);
    }
    onDeviceRemoved(key, callback) {
        this.on('deviceRemoved', callback, key);
    }
    emitLastSeenChanged(data) {
        this.emitter.emit('lastSeenChanged', data);
    }
    onLastSeenChanged(key, callback) {
        this.on('lastSeenChanged', callback, key);
    }
    emitDeviceNetworkAddressChanged(data) {
        this.emitter.emit('deviceNetworkAddressChanged', data);
    }
    onDeviceNetworkAddressChanged(key, callback) {
        this.on('deviceNetworkAddressChanged', callback, key);
    }
    emitDeviceAnnounce(data) {
        this.emitter.emit('deviceAnnounce', data);
    }
    onDeviceAnnounce(key, callback) {
        this.on('deviceAnnounce', callback, key);
    }
    emitDeviceInterview(data) {
        this.emitter.emit('deviceInterview', data);
    }
    onDeviceInterview(key, callback) {
        this.on('deviceInterview', callback, key);
    }
    emitDeviceJoined(data) {
        this.emitter.emit('deviceJoined', data);
    }
    onDeviceJoined(key, callback) {
        this.on('deviceJoined', callback, key);
    }
    emitDeviceLeave(data) {
        this.emitter.emit('deviceLeave', data);
    }
    onDeviceLeave(key, callback) {
        this.on('deviceLeave', callback, key);
    }
    emitDeviceMessage(data) {
        this.emitter.emit('deviceMessage', data);
    }
    onDeviceMessage(key, callback) {
        this.on('deviceMessage', callback, key);
    }
    emitMQTTMessage(data) {
        this.emitter.emit('mqttMessage', data);
    }
    onMQTTMessage(key, callback) {
        this.on('mqttMessage', callback, key);
    }
    emitMQTTMessagePublished(data) {
        this.emitter.emit('mqttMessagePublished', data);
    }
    onMQTTMessagePublished(key, callback) {
        this.on('mqttMessagePublished', callback, key);
    }
    emitPublishEntityState(data) {
        this.emitter.emit('publishEntityState', data);
    }
    onPublishEntityState(key, callback) {
        this.on('publishEntityState', callback, key);
    }
    emitGroupMembersChanged(data) {
        this.emitter.emit('groupMembersChanged', data);
    }
    onGroupMembersChanged(key, callback) {
        this.on('groupMembersChanged', callback, key);
    }
    emitDevicesChanged() {
        this.emitter.emit('devicesChanged');
    }
    onDevicesChanged(key, callback) {
        this.on('devicesChanged', callback, key);
    }
    emitScenesChanged() {
        this.emitter.emit('scenesChanged');
    }
    onScenesChanged(key, callback) {
        this.on('scenesChanged', callback, key);
    }
    emitReportingDisabled(data) {
        this.emitter.emit('reportingDisabled', data);
    }
    onReportingDisabled(key, callback) {
        this.on('reportingDisabled', callback, key);
    }
    emitStateChange(data) {
        this.emitter.emit('stateChange', data);
    }
    onStateChange(key, callback) {
        this.on('stateChange', callback, key);
    }
    on(event, callback, key) {
        if (!this.callbacksByExtension[key.constructor.name])
            this.callbacksByExtension[key.constructor.name] = [];
        this.callbacksByExtension[key.constructor.name].push({ event, callback });
        this.emitter.on(event, callback);
    }
    removeListeners(key) {
        var _a;
        (_a = this.callbacksByExtension[key.constructor.name]) === null || _a === void 0 ? void 0 : _a.forEach((e) => this.emitter.removeListener(e.event, e.callback));
    }
}
exports.default = EventBus;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXZlbnRCdXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9saWIvZXZlbnRCdXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxvREFBNEI7QUFDNUIsZ0JBQU0sQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUM7QUFLaEMsTUFBcUIsUUFBUTtJQUl6QixZQUFZLE9BQStCO1FBSG5DLHlCQUFvQixHQUFpRixFQUFFLENBQUM7UUFDeEcsWUFBTyxHQUFHLElBQUksZ0JBQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztRQUd4QyxJQUFJLENBQUMsT0FBTyxDQUFDLGVBQWUsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNsQyxJQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDdEMsQ0FBQztJQUVNLHVCQUF1QjtRQUMxQixJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFDTSxxQkFBcUIsQ0FBQyxHQUFnQixFQUFFLFFBQW9CO1FBQy9ELElBQUksQ0FBQyxFQUFFLENBQUMscUJBQXFCLEVBQUUsUUFBUSxFQUFFLEdBQUcsQ0FBQyxDQUFDO0lBQ2xELENBQUM7SUFFTSxxQkFBcUIsQ0FBQyxJQUFpQztRQUMxRCxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxtQkFBbUIsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBQ00sbUJBQW1CLENBQUMsR0FBZ0IsRUFBRSxRQUFxRDtRQUM5RixJQUFJLENBQUMsRUFBRSxDQUFDLG1CQUFtQixFQUFFLFFBQVEsRUFBRSxHQUFHLENBQUMsQ0FBQztJQUNoRCxDQUFDO0lBRU0saUJBQWlCLENBQUMsSUFBNkI7UUFDbEQsSUFBSSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsZUFBZSxFQUFFLElBQUksQ0FBQyxDQUFDO0lBQzdDLENBQUM7SUFDTSxlQUFlLENBQUMsR0FBZ0Is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