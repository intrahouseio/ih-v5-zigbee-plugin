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
const crypto_1 = __importDefault(require("crypto"));
const zclTransactionSequenceNumber_1 = __importDefault(require("./helpers/zclTransactionSequenceNumber"));
const events_1 = __importDefault(require("events"));
const tstype_1 = require("./tstype");
const debug_1 = __importDefault(require("debug"));
const debug = {
    info: (0, debug_1.default)('zigbee-herdsman:controller:greenpower'),
    error: (0, debug_1.default)('zigbee-herdsman:controller:greenpower'),
};
const zigBeeLinkKey = Buffer.from([
    0x5A, 0x69, 0x67, 0x42, 0x65, 0x65, 0x41, 0x6C, 0x6C, 0x69, 0x61, 0x6E, 0x63, 0x65, 0x30, 0x39
]);
class GreenPower extends events_1.default.EventEmitter {
    constructor(adapter) {
        super();
        this.adapter = adapter;
    }
    encryptSecurityKey(sourceID, securityKey) {
        const sourceIDInBytes = Buffer.from([
            (sourceID & 0x000000ff),
            (sourceID & 0x0000ff00) >> 8,
            (sourceID & 0x00ff0000) >> 16,
            (sourceID & 0xff000000) >> 24
        ]);
        const nonce = Buffer.alloc(13);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 4; j++) {
                nonce[4 * i + j] = sourceIDInBytes[j];
            }
        }
        nonce[12] = 0x05;
        const cipher = crypto_1.default.createCipheriv('aes-128-ccm', zigBeeLinkKey, nonce, { authTagLength: 16 });
        const encrypted = cipher.update(securityKey);
        return Buffer.concat([encrypted, cipher.final()]);
    }
    /* eslint-disable-next-line @typescript-eslint/no-explicit-any*/
    async sendPairingCommand(payload, dataPayload) {
        debug.info("Payload.Options: " + payload.options + " wasBroadcast: " + dataPayload.wasBroadcast);
        // Set sink address based on communication mode
        switch ((payload.options >> 5) & 3) {
            case 0b10: // Groupcast to pre-commissioned GroupID
            case 0b01: // Groupcast to DGroupID
                payload.sinkGroupID = this.adapter.greenPowerGroup;
                break;
            /* istanbul ignore next */
            case 0b00: // Full unicast forwarding
            case 0b11: // Lightweight unicast forwarding
                const coordinator = await this.adapter.getCoordinator();
                payload.sinkIEEEAddr = coordinator.ieeeAddr;
                payload.sinkNwkAddr = coordinator.networkAddress;
                break;
            /* istanbul ignore next */
            default:
                debug.error("Unhandled applicationID: " + (payload.options & 7));
                return;
        }
        const frame = Zcl.ZclFrame.create(Zcl.FrameType.SPECIFIC, Zcl.Direction.SERVER_TO_CLIENT, true, null, zclTransactionSequenceNumber_1.default.next(), 'pairing', 33, payload);
        // Not sure how correct this is - according to GP spec Pairing command is
        // to be sent as broadcast unless communication mode is 0b11 - in which case
        // the proxy MAY send it as unicast to selected proxy.
        // This attempts to mirror logic from commit 92f77cc5.
        if (dataPayload.wasBroadcast) {
            return this.adapter.sendZclFrameToAll(242, frame, 242);
        }
        else {
            return this.adapter.sendZclFrameToEndpoint(null, dataPayload.frame.Payload.gppNwkAddr, 242, frame, 10000, false, false, 242);
        }
    }
    async onZclGreenPowerData(dataPayload) {
        let payload = {};
        try {
            switch (dataPayload.frame.Payload.commandID) {
                /* istanbul ignore next */
                case undefined:
                    debug.error("GP Undefined Command");
                    break;
                case 0xE0: // GP Commissioning
                    debug.info("GP Commissioning");
                    /* istanbul ignore if */
                    if (typeof dataPayload.address !== 'number') {
                        debug.info("Warning: commissioning request with string type address");
                        break;
                    }
                    const rxOnCap = dataPayload.frame.Payload.commandFrame.options & 0b10;
                    const key = this.encryptSecurityKey(dataPayload.frame.Payload.srcID, dataPayload.frame.Payload.commandFrame.securityKey);
                    // RX capable GPD needs GP Commissioning Reply
                    if (rxOnCap) {
                        debug.info("RxOnCap set -> supports bidirectional communication");
                        // NOTE: currently encryption is disabled for RX capable GPDs
                        const networkParameters = await this.adapter.getNetworkParameters();
                        // Commissioning reply
                        payload = {
                            options: 0,
                            tempMaster: dataPayload.frame.Payload.gppNwkAddr,
                            tempMasterTx: networkParameters.channel - 11,
                            srcID: dataPayload.frame.Payload.srcID,
                            gpdCmd: 0xf0,
                            gpdPayload: {
                                commandID: 0xf0,
                                options: 0b00000000, // Disable encryption
                                // securityKey: [...dataPayload.frame.Payload.commandFrame.securityKey],
                                // keyMic: dataPayload.frame.Payload.commandFrame.keyMic,
                            }
                        };
                        const frame = Zcl.ZclFrame.create(Zcl.FrameType.SPECIFIC, Zcl.Direction.SERVER_TO_CLIENT, true, null, zclTransactionSequenceNumber_1.default.next(), 'response', 33, payload);
                        await this.adapter.sendZclFrameToAll(242, frame, 242);
                        payload = {
                            options: 0b0000000110101000,
                            srcID: dataPayload.frame.Payload.srcID,
                            deviceID: dataPayload.frame.Payload.commandFrame.deviceID,
                        };
                        await this.sendPairingCommand(payload, dataPayload);
                    }
                    else {
                        // Communication mode:
                        //  Broadcast: Groupcast to precommissioned ID (0b10)
                        // !Broadcast: Lightweight unicast (0b11)
                        let opt = 0b1110010101101000;
                        if (dataPayload.wasBroadcast) {
                            opt = 0b1110010101001000;
                        }
                        payload = {
                            options: opt,
                            srcID: dataPayload.frame.Payload.srcID,
                            deviceID: dataPayload.frame.Payload.commandFrame.deviceID,
                            frameCounter: dataPayload.frame.Payload.commandFrame.outgoingCounter,
                            gpdKey: [...key],
                        };
                        await this.sendPairingCommand(payload, dataPayload);
                    }
                    const eventData = {
                        sourceID: dataPayload.frame.Payload.srcID,
                        deviceID: dataPayload.frame.Payload.commandFrame.deviceID,
                        networkAddress: dataPayload.frame.Payload.srcID & 0xFFFF,
                    };
                    this.emit(tstype_1.GreenPowerEvents.deviceJoined, eventData);
                    break;
                /* istanbul ignore next */
                case 0xE2: // GP Success
                    debug.info("GP Success");
                    if (typeof dataPayload.address !== 'number') {
                        debug.info("Warning: commissioning request with string type address");
                        break;
                    }
                    break;
                case 0xE3: // GP Channel Request
                    debug.info("GP Channel Request");
                    const networkParameters = await this.adapter.getNetworkParameters();
                    // Channel notification
                    payload = {
                        options: 0,
                        tempMaster: dataPayload.frame.Payload.gppNwkAddr,
                        tempMasterTx: dataPayload.frame.Payload.commandFrame.nextChannel,
                        srcID: dataPayload.frame.Payload.srcID,
                        gpdCmd: 0xf3,
                        gpdPayload: {
                            commandID: 0xf3,
                            options: networkParameters.channel - 11,
                        }
                    };
                    const frame = Zcl.ZclFrame.create(Zcl.FrameType.SPECIFIC, Zcl.Direction.SERVER_TO_CLIENT, true, null, zclTransactionSequenceNumber_1.default.next(), 'response', 33, payload);
                    await this.adapter.sendZclFrameToAll(242, frame, 242);
                    break;
                /* istanbul ignore next */
                case 0xA1: // GP Manufacturer-specific Attribute Reporting
                    break;
                default:
                    debug.info("Unhandled Zigbee GreenPower command: 0x" +
                        dataPayload.frame.Payload.commandID.toString(16));
            }
        }
        catch (error) {
            /* istanbul ignore next */
            debug.error(`onZclGreenPowerData failed with error '${error}'`);
        }
    }
    async permitJoin(time, networkAddress) {
        const payload = {
            options: time ? (networkAddress === null ? 0x0b : 0x2b) : 0x0a,
            commisioningWindow: time,
        };
        const frame = Zcl.ZclFrame.create(Zcl.FrameType.SPECIFIC, Zcl.Direction.SERVER_TO_CLIENT, true, null, zclTransactionSequenceNumber_1.default.next(), 'commisioningMode', 33, payload);
        if (networkAddress === null) {
            await this.adapter.sendZclFrameToAll(242, frame, 242);
        }
        else {
            await this.adapter.sendZclFrameToEndpoint(null, networkAddress, 242, frame, 10000, false, false, 242);
        }
    }
}
exports.default = GreenPower;
//# sourceMappingURL=greenPower.js.map