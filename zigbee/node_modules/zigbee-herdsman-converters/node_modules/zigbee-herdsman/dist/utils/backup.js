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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fromLegacyBackup = exports.fromUnifiedBackup = exports.toUnifiedBackup = void 0;
const ZStackStructs = __importStar(require("../adapter/z-stack/structs"));
const ZStackUtils = __importStar(require("../adapter/z-stack/utils"));
const mz_1 = require("mz");
const path = __importStar(require("path"));
/**
 * Converts internal backup format to unified backup storage format as described by
 * [zigpy/open-coordinator-backup](https://github.com/zigpy/open-coordinator-backup).
 *
 * @param backup Backup to create unified backup format from.
 */
const toUnifiedBackup = async (backup) => {
    var _a, _b, _c, _d, _e;
    const panIdBuffer = Buffer.alloc(2);
    panIdBuffer.writeUInt16BE(backup.networkOptions.panId);
    const packageInfo = JSON.parse((await mz_1.fs.readFile(path.join(__dirname, "../../", "package.json"))).toString());
    /* istanbul ignore next */
    return {
        metadata: {
            format: "zigpy/open-coordinator-backup",
            version: 1,
            source: `${packageInfo.name}@${packageInfo.version}`,
            internal: {
                date: new Date().toISOString(),
                znpVersion: [null, undefined].includes((_a = backup.znp) === null || _a === void 0 ? void 0 : _a.version) ? undefined : (_b = backup.znp) === null || _b === void 0 ? void 0 : _b.version
            }
        },
        stack_specific: {
            zstack: {
                tclk_seed: ((_d = (_c = backup.znp) === null || _c === void 0 ? void 0 : _c.trustCenterLinkKeySeed) === null || _d === void 0 ? void 0 : _d.toString("hex")) || undefined
            }
        },
        coordinator_ieee: ((_e = backup.coordinatorIeeeAddress) === null || _e === void 0 ? void 0 : _e.toString("hex")) || null,
        pan_id: panIdBuffer.toString("hex"),
        extended_pan_id: backup.networkOptions.extendedPanId.toString("hex"),
        nwk_update_id: backup.networkUpdateId || 0,
        security_level: backup.securityLevel || null,
        channel: backup.logicalChannel,
        channel_mask: backup.networkOptions.channelList,
        network_key: {
            key: backup.networkOptions.networkKey.toString("hex"),
            sequence_number: backup.networkKeyInfo.sequenceNumber,
            frame_counter: backup.networkKeyInfo.frameCounter
        },
        devices: backup.devices.map(device => {
            const nwkAddressBuffer = Buffer.alloc(2);
            nwkAddressBuffer.writeUInt16BE(device.networkAddress);
            return {
                nwk_address: nwkAddressBuffer.toString("hex"),
                ieee_address: device.ieeeAddress.toString("hex"),
                is_child: device.isDirectChild,
                link_key: !device.linkKey ? undefined : {
                    key: device.linkKey.key.toString("hex"),
                    rx_counter: device.linkKey.rxCounter,
                    tx_counter: device.linkKey.txCounter
                }
            };
        }),
    };
};
exports.toUnifiedBackup = toUnifiedBackup;
/**
 * Converts unified backup storage format to internal backup format.
 *
 * @param backup Unified format to convert to internal backup format.
 */
const fromUnifiedBackup = (backup) => {
    var _a, _b, _c;
    const tclkSeedString = ((_b = (_a = backup.stack_specific) === null || _a === void 0 ? void 0 : _a.zstack) === null || _b === void 0 ? void 0 : _b.tclk_seed) || null;
    /* istanbul ignore next */
    return {
        networkOptions: {
            panId: Buffer.from(backup.pan_id, "hex").readUInt16BE(),
            extendedPanId: Buffer.from(backup.extended_pan_id, "hex"),
            channelList: backup.channel_mask,
            networkKey: Buffer.from(backup.network_key.key, "hex"),
            networkKeyDistribute: false
        },
        logicalChannel: backup.channel,
        networkKeyInfo: {
            sequenceNumber: backup.network_key.sequence_number,
            frameCounter: backup.network_key.frame_counter
        },
        coordinatorIeeeAddress: backup.coordinator_ieee ? Buffer.from(backup.coordinator_ieee, "hex") : null,
        securityLevel: backup.security_level || null,
        networkUpdateId: backup.nwk_update_id || null,
        devices: backup.devices.map(device => ({
            networkAddress: device.nwk_address ? Buffer.from(device.nwk_address, "hex").readUInt16BE() : Buffer.from("fffe", "hex").readUInt16BE(),
            ieeeAddress: Buffer.from(device.ieee_address, "hex"),
            isDirectChild: typeof device.is_child === "boolean" ? device.is_child : true,
            linkKey: !device.link_key ? undefined : {
                key: Buffer.from(device.link_key.key, "hex"),
                rxCounter: device.link_key.rx_counter,
                txCounter: device.link_key.tx_counter
            }
        })),
        znp: {
            version: ((_c = backup.metadata.internal) === null || _c === void 0 ? void 0 : _c.znpVersion) || undefined,
            trustCenterLinkKeySeed: tclkSeedString ? Buffer.from(tclkSeedString, "hex") : undefined,
        }
    };
};
exports.fromUnifiedBackup = fromUnifiedBackup;
/**
 * Converts legacy Zigbee2MQTT format to internal backup format.
 *
 * @param backup Legacy format to convert.
 */
const fromLegacyBackup = (backup) => {
    if (!backup.data.ZCD_NV_NIB) {
        throw new Error("Backup corrupted - missing NIB");
    }
    else if (!backup.data.ZCD_NV_NWK_ACTIVE_KEY_INFO) {
        throw new Error("Backup corrupted - missing active key info");
    }
    else if (!backup.data.ZCD_NV_PRECFGKEY_ENABLE) {
        throw new Error("Backup corrupted - missing pre-configured key enable attribute");
    }
    else if (!backup.data.ZCD_NV_EX_NWK_SEC_MATERIAL_TABLE && !backup.data.ZCD_NV_LEGACY_NWK_SEC_MATERIAL_TABLE_START) {
        throw new Error("Backup corrupted - missing network security material table");
    }
    else if (!backup.data.ZCD_NV_EXTADDR) {
        throw new Error("Backup corrupted - missing adapter IEEE address NV entry");
    }
    const ieeeAddress = Buffer.from(backup.data.ZCD_NV_EXTADDR.value).reverse();
    const nib = ZStackStructs.nib(Buffer.from(backup.data.ZCD_NV_NIB.value));
    const activeKeyInfo = ZStackStructs.nwkKeyDescriptor(Buffer.from(backup.data.ZCD_NV_NWK_ACTIVE_KEY_INFO.value));
    const preconfiguredKeyEnabled = backup.data.ZCD_NV_PRECFGKEY_ENABLE.value[0] !== 0x00;
    const nwkSecMaterialSource = backup.data.ZCD_NV_EX_NWK_SEC_MATERIAL_TABLE || backup.data.ZCD_NV_LEGACY_NWK_SEC_MATERIAL_TABLE_START;
    const nwkSecMaterialEntry = ZStackStructs.nwkSecMaterialDescriptorEntry(Buffer.from(nwkSecMaterialSource.value));
    return {
        networkOptions: {
            panId: nib.nwkPanId,
            extendedPanId: nib.extendedPANID,
            channelList: ZStackUtils.unpackChannelList(nib.channelList),
            networkKey: activeKeyInfo.key,
            networkKeyDistribute: preconfiguredKeyEnabled
        },
        logicalChannel: nib.nwkLogicalChannel,
        networkKeyInfo: {
            sequenceNumber: activeKeyInfo.keySeqNum,
            frameCounter: nwkSecMaterialEntry.FrameCounter
        },
        coordinatorIeeeAddress: ieeeAddress,
        securityLevel: nib.SecurityLevel,
        networkUpdateId: nib.nwkUpdateId,
        devices: []
    };
};
exports.fromLegacyBackup = fromLegacyBackup;
//# sourceMappingURL=backup.js.map