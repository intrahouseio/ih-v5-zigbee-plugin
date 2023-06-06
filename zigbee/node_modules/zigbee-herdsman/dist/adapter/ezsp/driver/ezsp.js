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
exports.Ezsp = exports.EZSPZDOResponseFrameData = exports.EZSPZDORequestFrameData = exports.EZSPFrameData = void 0;
/* istanbul ignore file */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
const t = __importStar(require("./types"));
const uart_1 = require("./uart");
const commands_1 = require("./commands");
const named_1 = require("./types/named");
const events_1 = require("events");
const utils_1 = require("../../../utils");
const debug_1 = __importDefault(require("debug"));
const debug = {
    error: (0, debug_1.default)('zigbee-herdsman:adapter:ezsp:erro'),
    log: (0, debug_1.default)('zigbee-herdsman:adapter:ezsp:ezsp'),
};
const MTOR_MIN_INTERVAL = 10;
const MTOR_MAX_INTERVAL = 90;
const MTOR_ROUTE_ERROR_THRESHOLD = 4;
const MTOR_DELIVERY_FAIL_THRESHOLD = 3;
const MAX_WATCHDOG_FAILURES = 4;
//const RESET_ATTEMPT_BACKOFF_TIME = 5;
const WATCHDOG_WAKE_PERIOD = 10; // in sec
//const EZSP_COUNTER_CLEAR_INTERVAL = 180;  // Clear counters every n * WATCHDOG_WAKE_PERIOD
const EZSP_DEFAULT_RADIUS = 0;
const EZSP_MULTICAST_NON_MEMBER_RADIUS = 3;
class EZSPFrameData {
    static createFrame(ezspv, frame_id, isRequest, params) {
        const names = commands_1.FRAME_NAMES_BY_ID[frame_id];
        if (!names) {
            throw new Error(`Unrecognized frame FrameID ${frame_id}`);
        }
        let frm;
        names.every((frameName) => {
            const frameDesc = EZSPFrameData.getFrame(frameName);
            if ((frameDesc.maxV && frameDesc.maxV < ezspv) || (frameDesc.minV && frameDesc.minV > ezspv)) {
                return true;
            }
            try {
                frm = new EZSPFrameData(frameName, isRequest, params);
            }
            catch (error) {
                debug.error(`Frame ${frameName} parsing error: ${error.stack}`);
                return true;
            }
            return false;
        });
        return frm;
    }
    static getFrame(name) {
        const frameDesc = commands_1.FRAMES[name];
        if (!frameDesc)
            throw new Error(`Unrecognized frame from FrameID ${name}`);
        return frameDesc;
    }
    constructor(key, isRequest, params) {
        this._cls_ = key;
        this._id_ = commands_1.FRAMES[this._cls_].ID;
        this._isRequest_ = isRequest;
        const frame = EZSPFrameData.getFrame(key);
        const frameDesc = (this._isRequest_) ? frame.request || {} : frame.response || {};
        if (Buffer.isBuffer(params)) {
            let data = params;
            for (const prop of Object.getOwnPropertyNames(frameDesc)) {
                [this[prop], data] = frameDesc[prop].deserialize(frameDesc[prop], data);
            }
        }
        else {
            for (const prop of Object.getOwnPropertyNames(frameDesc)) {
                this[prop] = params[prop];
            }
        }
    }
    serialize() {
        const frame = EZSPFrameData.getFrame(this._cls_);
        const frameDesc = (this._isRequest_) ? frame.request || {} : frame.response || {};
        const result = [];
        for (const prop of Object.getOwnPropertyNames(frameDesc)) {
            result.push(frameDesc[prop].serialize(frameDesc[prop], this[prop]));
        }
        return Buffer.concat(result);
    }
    get name() {
        return this._cls_;
    }
    get id() {
        return this._id_;
    }
}
exports.EZSPFrameData = EZSPFrameData;
class EZSPZDORequestFrameData {
    static getFrame(key) {
        const name = (typeof key == 'string') ? key : commands_1.ZDOREQUEST_NAME_BY_ID[key];
        const frameDesc = commands_1.ZDOREQUESTS[name];
        if (!frameDesc)
            throw new Error(`Unrecognized ZDOFrame from FrameID ${key}`);
        return frameDesc;
    }
    constructor(key, isRequest, params) {
        if (typeof key == 'string') {
            this._cls_ = key;
            this._id_ = commands_1.ZDOREQUESTS[this._cls_].ID;
        }
        else {
            this._id_ = key;
            this._cls_ = commands_1.ZDOREQUEST_NAME_BY_ID[key];
        }
        this._isRequest_ = isRequest;
        const frame = EZSPZDORequestFrameData.getFrame(key);
        const frameDesc = (this._isRequest_) ? frame.request || {} : frame.response || {};
        if (Buffer.isBuffer(params)) {
            let data = params;
            for (const prop of Object.getOwnPropertyNames(frameDesc)) {
                [this[prop], data] = frameDesc[prop].deserialize(frameDesc[prop], data);
            }
        }
        else {
            for (const prop of Object.getOwnPropertyNames(frameDesc)) {
                this[prop] = params[prop];
            }
        }
    }
    serialize() {
        const frame = EZSPZDORequestFrameData.getFrame(this._cls_);
        const frameDesc = (this._isRequest_) ? frame.request || {} : frame.response || {};
        const result = [];
        for (const prop of Object.getOwnPropertyNames(frameDesc)) {
            result.push(frameDesc[prop].serialize(frameDesc[prop], this[prop]));
        }
        return Buffer.concat(result);
    }
    get name() {
        return this._cls_;
    }
    get id() {
        return this._id_;
    }
}
exports.EZSPZDORequestFrameData = EZSPZDORequestFrameData;
class EZSPZDOResponseFrameData {
    static getFrame(key) {
        const name = (typeof key == 'string') ? key : commands_1.ZDORESPONSE_NAME_BY_ID[key];
        const frameDesc = commands_1.ZDORESPONSES[name];
        if (!frameDesc)
            throw new Error(`Unrecognized ZDOFrame from FrameID ${key}`);
        return frameDesc.params;
    }
    constructor(key, params) {
        if (typeof key == 'string') {
            this._cls_ = key;
            this._id_ = commands_1.ZDORESPONSES[this._cls_].ID;
        }
        else {
            this._id_ = key;
            this._cls_ = commands_1.ZDORESPONSE_NAME_BY_ID[key];
        }
        const frameDesc = EZSPZDOResponseFrameData.getFrame(key);
        if (Buffer.isBuffer(params)) {
            let data = params;
            for (const prop of Object.getOwnPropertyNames(frameDesc)) {
                [this[prop], data] = frameDesc[prop].deserialize(frameDesc[prop], data);
            }
        }
        else {
            for (const prop of Object.getOwnPropertyNames(frameDesc)) {
                this[prop] = params[prop];
            }
        }
    }
    serialize() {
        const frameDesc = EZSPZDOResponseFrameData.getFrame(this._cls_);
        const result = [];
        for (const prop of Object.getOwnPropertyNames(frameDesc)) {
            result.push(frameDesc[prop].serialize(frameDesc[prop], this[prop]));
        }
        return Buffer.concat(result);
    }
    get name() {
        return this._cls_;
    }
    get id() {
        return this._id_;
    }
}
exports.EZSPZDOResponseFrameData = EZSPZDOResponseFrameData;
class Ezsp extends events_1.EventEmitter {
    constructor() {
        super();
        this.ezspV = 4;
        this.cmdSeq = 0; // command sequence
        this.failures = 0;
        this.queue = new utils_1.Queue();
        this.waitress = new utils_1.Waitress(this.waitressValidator, this.waitressTimeoutFormatter);
        this.serialDriver = new uart_1.SerialDriver();
        this.serialDriver.on('received', this.onFrameReceived.bind(this));
        this.serialDriver.on('close', this.onClose.bind(this));
        this.serialDriver.on('reset', this.resetHandler.bind(this));
    }
    async connect(path, options) {
        for (let i = 1; i < 5; i += 1) {
            try {
                await this.serialDriver.connect(path, options);
                break;
            }
            catch (error) {
                debug.error(`Connection attempt ${i} error: ${error.stack}`);
                await (0, utils_1.Wait)(5000);
                debug.log(`Next attempt ${i + 1}`);
            }
        }
        if (!this.serialDriver.isInitialized) {
            throw new Error("Failure to connect");
        }
        if (WATCHDOG_WAKE_PERIOD) {
            this.watchdogTimer = setInterval(this.watchdogHandler.bind(this), WATCHDOG_WAKE_PERIOD * 1000);
        }
    }
    onClose() {
        debug.log('Close ezsp');
        this.emit('close');
    }
    async close(force) {
        debug.log('Stop ezsp');
        if (force) {
            clearTimeout(this.watchdogTimer);
        }
        this.queue.clear();
        await this.serialDriver.close();
    }
    getFrameDesc(name) {
        return (name in commands_1.FRAMES) ? commands_1.FRAMES[name] : null;
    }
    onFrameReceived(data) {
        /*Handle a received EZSP frame

        The protocol has taken care of UART specific framing etc, so we should
        just have EZSP application stuff here, with all escaping/stuffing and
        data randomization removed.
        */
        debug.log(`<== Frame: ${data.toString('hex')}`);
        let frame_id, sequence;
        if ((this.ezspV < 8)) {
            [sequence, frame_id, data] = [data[0], data[2], data.subarray(3)];
        }
        else {
            sequence = data[0];
            [[frame_id], data] = t.deserialize(data.subarray(3), [t.uint16_t]);
        }
        if ((frame_id === 255)) {
            frame_id = 0;
            if ((data.length > 1)) {
                frame_id = data[1];
                data = data.subarray(2);
            }
        }
        const frm = EZSPFrameData.createFrame(this.ezspV, frame_id, false, data);
        if (!frm) {
            debug.error(`Unparsed frame 0x${frame_id.toString(16)}. Skipped`);
            return;
        }
        debug.log(`<== 0x${frame_id.toString(16)}: ${JSON.stringify(frm)}`);
        const handled = this.waitress.resolve({
            frameId: frame_id,
            frameName: frm.name,
            sequence: sequence,
            payload: frm
        });
        if (!handled)
            this.emit('frame', frm.name, frm);
        if ((frame_id === 0)) {
            this.ezspV = frm.protocolVersion;
        }
    }
    async version() {
        const version = this.ezspV;
        const result = await this.execCommand("version", { desiredProtocolVersion: version });
        if ((result.protocolVersion !== version)) {
            debug.log("Switching to eszp version %d", result.protocolVersion);
            await this.execCommand("version", { desiredProtocolVersion: result.protocolVersion });
        }
        return result.protocolVersion;
    }
    async networkInit() {
        const waiter = this.waitFor("stackStatusHandler", null).start();
        const result = await this.execCommand("networkInit");
        debug.log('network init result: ', JSON.stringify(result));
        if ((result.status !== named_1.EmberStatus.SUCCESS)) {
            this.waitress.remove(waiter.ID);
            debug.log("Failure to init network");
            return false;
        }
        const response = await waiter.promise;
        return response.payload.status == named_1.EmberStatus.NETWORK_UP;
    }
    async leaveNetwork() {
        const waiter = this.waitFor("stackStatusHandler", null).start();
        const result = await this.execCommand("leaveNetwork");
        debug.log('network init result', JSON.stringify(result));
        if ((result.status !== named_1.EmberStatus.SUCCESS)) {
            this.waitress.remove(waiter.ID);
            debug.log("Failure to leave network");
            throw new Error(("Failure to leave network: " + JSON.stringify(result)));
        }
        const response = await waiter.promise;
        if ((response.payload.status !== named_1.EmberStatus.NETWORK_DOWN)) {
            debug.log("Wrong network status: " + JSON.stringify(response.payload));
            throw new Error(("Wrong network status: " + JSON.stringify(response.payload)));
        }
        return response.payload.status;
    }
    async setConfigurationValue(configId, value) {
        debug.log('Set %s = %s', named_1.EzspConfigId.valueToName(named_1.EzspConfigId, configId), value);
        const ret = await this.execCommand('setConfigurationValue', { configId: configId, value: value });
        console.assert(ret.status === named_1.EmberStatus.SUCCESS, `Command (setConfigurationValue) returned unexpected state: ${ret}`);
    }
    async getConfigurationValue(configId) {
        debug.log('Get %s', named_1.EzspConfigId.valueToName(named_1.EzspConfigId, configId));
        const ret = await this.execCommand('getConfigurationValue', { configId: configId });
        console.assert(ret.status === named_1.EmberStatus.SUCCESS, `Command (getConfigurationValue) returned unexpected state: ${ret}`);
        debug.log('Got %s = %s', named_1.EzspConfigId.valueToName(named_1.EzspConfigId, configId), ret.value.toString());
        return ret.value;
    }
    async getMulticastTableEntry(index) {
        const ret = await this.execCommand('getMulticastTableEntry', { index: index });
        return ret.value;
    }
    async setMulticastTableEntry(index, entry) {
        const ret = await this.execCommand('setMulticastTableEntry', { index: index, value: entry });
        console.assert(ret.status === named_1.EmberStatus.SUCCESS, `Command (setMulticastTableEntry) returned unexpected state: ${ret}`);
        return ret.status;
    }
    async setInitialSecurityState(entry) {
        const ret = await this.execCommand('setInitialSecurityState', { state: entry });
        console.assert(ret.success === named_1.EmberStatus.SUCCESS, `Command (setInitialSecurityState) returned unexpected state: ${ret}`);
        return ret.success;
    }
    async getCurrentSecurityState() {
        const ret = await this.execCommand('getCurrentSecurityState');
        console.assert(ret.status === named_1.EmberStatus.SUCCESS, `Command (getCurrentSecurityState) returned unexpected state: ${ret}`);
        return ret;
    }
    async setValue(valueId, value) {
        debug.log('Set %s = %s', t.EzspValueId.valueToName(t.EzspValueId, valueId), value);
        const ret = await this.execCommand('setValue', { valueId, value });
        console.assert(ret.status === named_1.EmberStatus.SUCCESS, `Command (setValue) returned unexpected state: ${ret.status}`);
        return ret;
    }
    async getValue(valueId) {
        debug.log('Get %s', t.EzspValueId.valueToName(t.EzspValueId, valueId));
        const ret = await this.execCommand('getValue', { valueId });
        console.assert(ret.status === named_1.EmberStatus.SUCCESS, `Command (getValue) returned unexpected state: ${ret}`);
        debug.log('Got %s = %s', t.EzspValueId.valueToName(t.EzspValueId, valueId), ret.value);
        return ret.value;
    }
    async setPolicy(policyId, value) {
        debug.log('Set %s = %s', named_1.EzspPolicyId.valueToName(named_1.EzspPolicyId, policyId), value);
        const ret = await this.execCommand('setPolicy', { policyId: policyId, decisionId: value });
        console.assert(ret.status === named_1.EmberStatus.SUCCESS, `Command (setPolicy) returned unexpected state: ${ret}`);
        return ret;
    }
    async updateConfig() {
        const config = [
            [named_1.EzspConfigId.CONFIG_TC_REJOINS_USING_WELL_KNOWN_KEY_TIMEOUT_S, 90],
            [named_1.EzspConfigId.CONFIG_TRUST_CENTER_ADDRESS_CACHE_SIZE, 2],
            //[EzspConfigId.CONFIG_SUPPORTED_NETWORKS, 1],
            [named_1.EzspConfigId.CONFIG_FRAGMENT_DELAY_MS, 50],
            [named_1.EzspConfigId.CONFIG_PAN_ID_CONFLICT_REPORT_THRESHOLD, 2],
            //[EzspConfigId.CONFIG_SOURCE_ROUTE_TABLE_SIZE, 16],
            //[EzspConfigId.CONFIG_ADDRESS_TABLE_SIZE, 16],
            [named_1.EzspConfigId.CONFIG_APPLICATION_ZDO_FLAGS,
                named_1.EmberZdoConfigurationFlags.APP_HANDLES_UNSUPPORTED_ZDO_REQUESTS |
                    named_1.EmberZdoConfigurationFlags.APP_RECEIVES_SUPPORTED_ZDO_REQUESTS],
            [named_1.EzspConfigId.CONFIG_INDIRECT_TRANSMISSION_TIMEOUT, 7680],
            [named_1.EzspConfigId.CONFIG_END_DEVICE_POLL_TIMEOUT, 14],
            [named_1.EzspConfigId.CONFIG_SECURITY_LEVEL, 5],
            [named_1.EzspConfigId.CONFIG_STACK_PROFILE, 2],
            //[EzspConfigId.CONFIG_TX_POWER_MODE, 3],
            [named_1.EzspConfigId.CONFIG_FRAGMENT_WINDOW_SIZE, 1],
            //[EzspConfigId.CONFIG_NEIGHBOR_TABLE_SIZE, 16],
            //[EzspConfigId.CONFIG_ROUTE_TABLE_SIZE, 16],
            //[EzspConfigId.CONFIG_BINDING_TABLE_SIZE, 32],
            //[EzspConfigId.CONFIG_KEY_TABLE_SIZE, 12],
            //[EzspConfigId.CONFIG_ZLL_GROUP_ADDRESSES, 0],
            //[EzspConfigId.CONFIG_ZLL_RSSI_THRESHOLD, 0],
            //[EzspConfigId.CONFIG_APS_UNICAST_MESSAGE_COUNT, 255],
            //[EzspConfigId.CONFIG_BROADCAST_TABLE_SIZE, 43],
            //[EzspConfigId.CONFIG_MAX_HOPS, 30],
            //[EzspConfigId.CONFIG_MAX_END_DEVICE_CHILDREN, 32],
            [named_1.EzspConfigId.CONFIG_PACKET_BUFFER_COUNT, 255],
        ];
        for (const [confName, value] of config) {
            try {
                await this.setConfigurationValue(confName, value);
            }
            catch (error) {
                debug.error(`setConfigurationValue(${confName}, ${value}) error: ${error} ${error.stack}`);
            }
        }
    }
    async updatePolicies() {
        // Set up the policies for what the NCP should do.
        let policies = [
            // [EzspPolicyId.BINDING_MODIFICATION_POLICY,
            //     EzspDecisionId.DISALLOW_BINDING_MODIFICATION],
            // [EzspPolicyId.UNICAST_REPLIES_POLICY, EzspDecisionId.HOST_WILL_NOT_SUPPLY_REPLY],
            // [EzspPolicyId.POLL_HANDLER_POLICY, EzspDecisionId.POLL_HANDLER_IGNORE],
            // [EzspPolicyId.MESSAGE_CONTENTS_IN_CALLBACK_POLICY,
            //     EzspDecisionId.MESSAGE_TAG_ONLY_IN_CALLBACK],
            // [EzspPolicyId.PACKET_VALIDATE_LIBRARY_POLICY,
            //     EzspDecisionId.PACKET_VALIDATE_LIBRARY_CHECKS_DISABLED],
            // [EzspPolicyId.ZLL_POLICY, EzspDecisionId.ALLOW_JOINS],
            // [EzspPolicyId.TC_REJOINS_USING_WELL_KNOWN_KEY_POLICY, EzspDecisionId.ALLOW_JOINS],
            [named_1.EzspPolicyId.APP_KEY_REQUEST_POLICY, named_1.EzspDecisionId.DENY_APP_KEY_REQUESTS],
            [named_1.EzspPolicyId.TC_KEY_REQUEST_POLICY, named_1.EzspDecisionId.ALLOW_TC_KEY_REQUESTS],
        ];
        if (this.ezspV >= 8) {
            policies = policies.concat([
                [named_1.EzspPolicyId.TRUST_CENTER_POLICY, named_1.EzspDecisionBitmask.ALLOW_UNSECURED_REJOINS
                        | named_1.EzspDecisionBitmask.ALLOW_JOINS],
            ]);
        }
        for (const [policy, value] of policies) {
            await this.setPolicy(policy, value);
        }
    }
    makeZDOframe(name, params) {
        const frmData = new EZSPZDORequestFrameData(name, true, params);
        return frmData.serialize();
    }
    makeFrame(name, params, seq) {
        const frmData = new EZSPFrameData(name, true, params);
        debug.log(`==> ${JSON.stringify(frmData)}`);
        const frame = [(seq & 255)];
        if ((this.ezspV < 8)) {
            if ((this.ezspV >= 5)) {
                frame.push(0x00, 0xFF, 0x00, frmData.id);
            }
            else {
                frame.push(0x00, frmData.id);
            }
        }
        else {
            const cmd_id = t.serialize([frmData.id], [t.uint16_t]);
            frame.push(0x00, 0x01, ...cmd_id);
        }
        return Buffer.concat([Buffer.from(frame), frmData.serialize()]);
    }
    async execCommand(name, params = null) {
        debug.log(`==> ${name}: ${JSON.stringify(params)}`);
        if (!this.serialDriver.isInitialized()) {
            throw new Error('Connection not initialized');
        }
        return this.queue.execute(async () => {
            const data = this.makeFrame(name, params, this.cmdSeq);
            const waiter = this.waitFor(name, this.cmdSeq);
            this.cmdSeq = (this.cmdSeq + 1) & 255;
            return this.serialDriver.sendDATA(data).then(async () => {
                const response = await waiter.start().promise;
                return response.payload;
            }).catch(() => {
                this.waitress.remove(waiter.ID);
                throw new Error(`Failure send ${name}:` + JSON.stringify(data));
            });
        });
    }
    async formNetwork(params) {
        const waiter = this.waitFor("stackStatusHandler", null).start();
        const v = await this.execCommand("formNetwork", { parameters: params });
        if ((v.status !== named_1.EmberStatus.SUCCESS)) {
            this.waitress.remove(waiter.ID);
            debug.error("Failure forming network: " + JSON.stringify(v));
            throw new Error(("Failure forming network: " + JSON.stringify(v)));
        }
        const response = await waiter.promise;
        if ((response.payload.status !== named_1.EmberStatus.NETWORK_UP)) {
            debug.error("Wrong network status: " + JSON.stringify(response.payload));
            throw new Error(("Wrong network status: " + JSON.stringify(response.payload)));
        }
        return response.payload.status;
    }
    parse_frame_payload(name, data) {
        const frame = new EZSPZDOResponseFrameData(name, data);
        return frame;
    }
    sendUnicast(direct, nwk, apsFrame, seq, data) {
        return this.execCommand('sendUnicast', {
            type: direct,
            indexOrDestination: nwk,
            apsFrame: apsFrame,
            messageTag: seq,
            message: data
        });
    }
    sendMulticast(apsFrame, seq, data) {
        return this.execCommand('sendMulticast', {
            apsFrame: apsFrame,
            hops: EZSP_DEFAULT_RADIUS,
            nonmemberRadius: EZSP_MULTICAST_NON_MEMBER_RADIUS,
            messageTag: seq,
            message: data
        });
    }
    async setSourceRouting() {
        const res = await this.execCommand('setConcentrator', {
            on: true,
            concentratorType: named_1.EmberConcentratorType.HIGH_RAM_CONCENTRATOR,
            minTime: MTOR_MIN_INTERVAL,
            maxTime: MTOR_MAX_INTERVAL,
            routeErrorThreshold: MTOR_ROUTE_ERROR_THRESHOLD,
            deliveryFailureThreshold: MTOR_DELIVERY_FAIL_THRESHOLD,
            maxHops: 0,
        });
        debug.log("Set concentrator type: %s", JSON.stringify(res));
        if (res.status != named_1.EmberStatus.SUCCESS) {
            debug.log("Couldn't set concentrator type %s: %s", true, JSON.stringify(res));
        }
        if (this.ezspV >= 8) {
            await this.execCommand('setSourceRouteDiscoveryMode', { mode: 1 });
        }
    }
    sendBroadcast(destination, apsFrame, seq, data) {
        return this.execCommand('sendBroadcast', {
            destination: destination,
            apsFrame: apsFrame,
            radius: EZSP_DEFAULT_RADIUS,
            messageTag: seq,
            message: data
        });
    }
    waitFor(frameId, sequence, timeout = 10000) {
        return this.waitress.waitFor({ frameId, sequence }, timeout);
    }
    waitressTimeoutFormatter(matcher, timeout) {
        return `${JSON.stringify(matcher)} after ${timeout}ms`;
    }
    waitressValidator(payload, matcher) {
        const frameNames = (typeof matcher.frameId == 'string') ?
            [matcher.frameId] : commands_1.FRAME_NAMES_BY_ID[matcher.frameId];
        return ((matcher.sequence == null || payload.sequence === matcher.sequence) &&
            frameNames.includes(payload.frameName));
    }
    async watchdogHandler() {
        debug.log(`Time to watchdog ... ${this.failures}`);
        try {
            await this.execCommand('nop');
        }
        catch (error) {
            debug.error(`Watchdog heartbeat timeout ${error.stack}`);
            this.failures += 1;
            if (this.failures > MAX_WATCHDOG_FAILURES) {
                this.failures = 0;
                this.resetHandler();
            }
        }
    }
    async resetHandler() {
        this.emit('reset');
    }
}
exports.Ezsp = Ezsp;
//# sourceMappingURL=ezsp.js.map