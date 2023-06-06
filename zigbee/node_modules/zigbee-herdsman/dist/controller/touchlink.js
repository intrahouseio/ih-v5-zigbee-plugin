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
const Zcl = __importStar(require("../zcl"));
const utils_1 = require("../utils");
const debug_1 = __importDefault(require("debug"));
const debug = (0, debug_1.default)('zigbee-herdsman:controller:touchlink');
const scanChannels = [11, 15, 20, 25, 12, 13, 14, 16, 17, 18, 19, 21, 22, 23, 24, 26];
class Touchlink {
    constructor(adapter) {
        this.adapter = adapter;
        this.locked = false;
    }
    lock(lock) {
        if (lock && this.locked) {
            throw new Error(`Touchlink operation already in progress`);
        }
        this.locked = lock;
    }
    transactionNumber() {
        return Math.floor(Math.random() * 0xFFFFFFFF);
    }
    async scan() {
        this.lock(true);
        const result = [];
        try {
            for (const channel of scanChannels) {
                debug(`Set InterPAN channel to '${channel}'`);
                await this.adapter.setChannelInterPAN(channel);
                try {
                    // TODO: multiple responses are not handled yet.
                    const response = await this.adapter.sendZclFrameInterPANBroadcast(this.createScanRequestFrame(this.transactionNumber()), 500);
                    debug(`Got scan response on channel '${channel}' of '${response.address}'`);
                    (0, utils_1.AssertString)(response.address);
                    result.push({ ieeeAddr: response.address, channel });
                }
                catch (error) {
                    debug(`Scan request failed or was not answered: '${error}'`);
                }
            }
        }
        finally {
            debug(`Restore InterPAN channel`);
            await this.adapter.restoreChannelInterPAN();
            this.lock(false);
        }
        return result;
    }
    async identify(ieeeAddr, channel) {
        this.lock(true);
        try {
            const transaction = this.transactionNumber();
            debug(`Set InterPAN channel to '${channel}'`);
            await this.adapter.setChannelInterPAN(channel);
            await this.adapter.sendZclFrameInterPANBroadcast(this.createScanRequestFrame(transaction), 500);
            debug(`Got scan response on channel '${channel}'`);
            debug(`Identifying '${ieeeAddr}'`);
            await this.adapter.sendZclFrameInterPANToIeeeAddr(this.createIdentifyRequestFrame(transaction), ieeeAddr);
        }
        finally {
            debug(`Restore InterPAN channel`);
            await this.adapter.restoreChannelInterPAN();
            this.lock(false);
        }
    }
    async factoryReset(ieeeAddr, channel) {
        this.lock(true);
        try {
            const transaction = this.transactionNumber();
            debug(`Set InterPAN channel to '${channel}'`);
            await this.adapter.setChannelInterPAN(channel);
            await this.adapter.sendZclFrameInterPANBroadcast(this.createScanRequestFrame(transaction), 500);
            debug(`Got scan response on channel '${channel}'`);
            debug(`Identifying '${ieeeAddr}'`);
            await this.adapter.sendZclFrameInterPANToIeeeAddr(this.createIdentifyRequestFrame(transaction), ieeeAddr);
            await (0, utils_1.Wait)(2000);
            debug(`Reset to factory new '${ieeeAddr}'`);
            await this.adapter.sendZclFrameInterPANToIeeeAddr(this.createResetFactoryNewRequestFrame(transaction), ieeeAddr);
        }
        finally {
            debug(`Restore InterPAN channel`);
            await this.adapter.restoreChannelInterPAN();
            this.lock(false);
        }
        return true;
    }
    async factoryResetFirst() {
        this.lock(true);
        let done = false;
        try {
            for (const channel of scanChannels) {
                debug(`Set InterPAN channel to '${channel}'`);
                await this.adapter.setChannelInterPAN(channel);
                try {
                    const transaction = this.transactionNumber();
                    const response = await this.adapter.sendZclFrameInterPANBroadcast(this.createScanRequestFrame(transaction), 500);
                    debug(`Got scan response on channel '${channel}'`);
                    (0, utils_1.AssertString)(response.address);
                    // Device answered (if not it will fall in the catch below),
                    // identify it (this will make e.g. the bulb flash)
                    debug(`Identifying`);
                    await this.adapter.sendZclFrameInterPANToIeeeAddr(this.createIdentifyRequestFrame(transaction), response.address);
                    await (0, utils_1.Wait)(2000);
                    debug(`Reset to factory new`);
                    await this.adapter.sendZclFrameInterPANToIeeeAddr(this.createResetFactoryNewRequestFrame(transaction), response.address);
                    done = true;
                }
                catch (error) {
                    debug(`Scan request failed or was not answered: '${error}'`);
                }
                if (done)
                    break;
            }
        }
        finally {
            debug(`Restore InterPAN channel`);
            await this.adapter.restoreChannelInterPAN();
            this.lock(false);
        }
        return done;
    }
    createScanRequestFrame(transaction) {
        return Zcl.ZclFrame.create(Zcl.FrameType.SPECIFIC, Zcl.Direction.CLIENT_TO_SERVER, true, null, 0, 'scanRequest', Zcl.Utils.getCluster('touchlink').ID, { transactionID: transaction, zigbeeInformation: 4, touchlinkInformation: 18 });
    }
    createIdentifyRequestFrame(transaction) {
        return Zcl.ZclFrame.create(Zcl.FrameType.SPECIFIC, Zcl.Direction.CLIENT_TO_SERVER, true, null, 0, 'identifyRequest', Zcl.Utils.getCluster('touchlink').ID, { transactionID: transaction, duration: 65535 });
    }
    createResetFactoryNewRequestFrame(transaction) {
        return Zcl.ZclFrame.create(Zcl.FrameType.SPECIFIC, Zcl.Direction.CLIENT_TO_SERVER, true, null, 0, 'resetToFactoryNew', Zcl.Utils.getCluster('touchlink').ID, { transactionID: transaction });
    }
}
exports.default = Touchlink;
//# sourceMappingURL=touchlink.js.map