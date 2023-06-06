"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EZSPAdapterBackup = void 0;
/* istanbul ignore file */
const debug_1 = __importDefault(require("debug"));
const types_1 = require("../driver/types");
const utils_1 = require("../driver/utils");
class EZSPAdapterBackup {
    constructor(driver, path) {
        this.debug = (0, debug_1.default)("zigbee-herdsman:adapter:ezsp:backup");
        this.driver = driver;
        this.defaultPath = path;
    }
    async createBackup() {
        this.debug("creating backup");
        const version = await this.driver.ezsp.version();
        const linkResult = await this.driver.ezsp.execCommand('getKey', { keyType: types_1.EmberKeyType.TRUST_CENTER_LINK_KEY });
        const trustCenterLinkKey = linkResult.keyStruct;
        const netParams = await this.driver.ezsp.execCommand('getNetworkParameters');
        const networkParams = netParams.parameters;
        const netResult = await this.driver.ezsp.execCommand('getKey', { keyType: types_1.EmberKeyType.CURRENT_NETWORK_KEY });
        const networkKey = netResult.keyStruct;
        const ieee = (await this.driver.ezsp.execCommand('getEui64')).eui64;
        /* return backup structure */
        /* istanbul ignore next */
        return {
            ezsp: {
                version: version,
                hashed_tclk: Buffer.from(trustCenterLinkKey.key.contents),
            },
            networkOptions: {
                panId: networkParams.panId,
                extendedPanId: Buffer.from(networkParams.extendedPanId),
                channelList: (0, utils_1.channelsMask2list)(networkParams.channels),
                networkKey: Buffer.from(networkKey.key.contents),
                networkKeyDistribute: true,
            },
            logicalChannel: networkParams.radioChannel,
            networkKeyInfo: {
                sequenceNumber: networkKey.sequenceNumber,
                frameCounter: networkKey.outgoingFrameCounter
            },
            securityLevel: 5,
            networkUpdateId: networkParams.nwkUpdateId,
            coordinatorIeeeAddress: ieee,
            devices: []
        };
    }
}
exports.EZSPAdapterBackup = EZSPAdapterBackup;
//# sourceMappingURL=backup.js.map