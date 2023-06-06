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
const buffalo_1 = require("../buffalo");
const definition_1 = require("./definition");
const tstype_1 = require("./tstype");
const Utils = __importStar(require("./utils"));
const debug_1 = __importDefault(require("debug"));
const debug = {
    info: (0, debug_1.default)('zigbee-herdsman:controller:buffaloZcl'),
    error: (0, debug_1.default)('zigbee-herdsman:controller:buffaloZcl'),
};
const aliases = {
    'boolean': 'uint8',
    'bitmap8': 'uint8',
    'enum8': 'uint8',
    'data8': 'uint8',
    'data16': 'uint16',
    'bitmap16': 'uint16',
    'uint16': 'uint16',
    'enum16': 'uint16',
    'clusterId': 'uint16',
    'attrId': 'uint16',
    'data24': 'uint24',
    'bitmap24': 'uint24',
    'data32': 'uint32',
    'bitmap32': 'uint32',
    'uint32': 'uint32',
    'tod': 'uint32',
    'date': 'uint32',
    'utc': 'uint32',
    'bacOid': 'uint32',
    'singlePrec': 'floatle',
    'doublePrec': 'doublele',
    'bitmap40': 'uint40',
    'data40': 'uint40',
    'bitmap48': 'uint48',
    'data48': 'uint48',
    'bitmap56': 'uint56',
    'data56': 'uint56',
    'bitmap64': 'uint64',
    'data64': 'uint64',
    'ieeeAddr': 'uint64',
    'longOctetStr': 'longCharStr',
    'secKey': 'buffer16',
    'noData': 'EMPTY',
    'unknown': 'EMPTY',
    'bag': 'array',
    'set': 'array',
};
const extensionFieldSetsDateTypeLookup = {
    6: ['uint8'],
    8: ['uint8'],
    258: ['uint8', 'unit8'],
    768: ['uint16', 'uint16', 'uint16', 'uint8', 'uint8', 'uint8', 'uint16', 'uint16'],
};
class BuffaloZcl extends buffalo_1.Buffalo {
    readUseDataType(options) {
        return this.read(options.dataType, options);
    }
    writeUseDataType(value, options) {
        this.write(options.dataType, value, options);
    }
    readArray() {
        const values = [];
        const elementType = definition_1.DataType[this.readUInt8()];
        const numberOfElements = this.readUInt16();
        for (let i = 0; i < numberOfElements; i++) {
            const value = this.read(elementType, {});
            values.push(value);
        }
        return values;
    }
    writeArray(value) {
        const elTypeNumeric = typeof value.elementType === 'number' ? value.elementType : definition_1.DataType[value.elementType];
        this.writeUInt8(elTypeNumeric);
        this.writeUInt16(value.elements.length);
        value.elements.forEach(element => {
            this.write(definition_1.DataType[elTypeNumeric], element, {});
        });
    }
    readStruct() {
        const values = [];
        const numberOfElements = this.readUInt16();
        for (let i = 0; i < numberOfElements; i++) {
            const elementType = this.readUInt8();
            const value = this.read(definition_1.DataType[elementType], {});
            values.push({ elmType: elementType, elmVal: value });
        }
        return values;
    }
    readOctetStr() {
        const length = this.readUInt8();
        return this.readBuffer(length);
    }
    readCharStr(options) {
        const length = this.readUInt8();
        if (options.attrId === 65281) {
            const value = {};
            // Xiaomi struct parsing
            for (let i = 0; i < length; i++) {
                const index = this.readUInt8();
                const dataType = definition_1.DataType[this.readUInt8()];
                value[index] = this.read(dataType, {});
                if (this.position === this.buffer.length) {
                    break;
                }
            }
            return value;
        }
        else {
            return this.readUtf8String(length);
        }
    }
    writeCharStr(value) {
        if (typeof value === 'string') {
            this.writeUInt8(value.length);
            this.writeUtf8String(value);
        }
        else {
            this.writeBuffer(value, value.length);
        }
    }
    readLongCharStr() {
        const length = this.readUInt16();
        return this.readUtf8String(length);
    }
    writeLongCharStr(value) {
        this.writeUInt16(value.length);
        this.writeUtf8String(value);
    }
    writeOctetStr(value) {
        this.writeUInt8(value.length);
        this.writeBuffer(value, value.length);
    }
    readExtensionFieldSets() {
        const value = [];
        while (this.isMore()) {
            const clstId = this.readUInt16();
            const len = this.readUInt8();
            const end = this.getPosition() + len;
            let index = 0;
            const extField = [];
            while (this.getPosition() < end) {
                extField.push(this.read(extensionFieldSetsDateTypeLookup[clstId][index], null));
                index++;
            }
            value.push({ extField, clstId, len });
        }
        return value;
    }
    writeExtensionFieldSets(values) {
        for (const value of values) {
            this.writeUInt16(value.clstId);
            this.writeUInt8(value.len);
            value.extField.forEach((entry, index) => {
                this.write(extensionFieldSetsDateTypeLookup[value.clstId][index], entry, null);
            });
        }
    }
    writeListZoneInfo(values) {
        for (const value of values) {
            this.writeUInt8(value.zoneID);
            this.writeUInt16(value.zoneStatus);
        }
    }
    readListZoneInfo(options) {
        const value = [];
        for (let i = 0; i < options.length; i++) {
            value.push({
                zoneID: this.readUInt8(),
                zoneStatus: this.readUInt16(),
            });
        }
        return value;
    }
    readListThermoTransitions(options) {
        const heat = options.payload['mode'] & 1;
        const cool = options.payload['mode'] & 2;
        const result = [];
        for (let i = 0; i < options.payload.numoftrans; i++) {
            const entry = {
                transitionTime: this.readUInt16()
            };
            if (heat) {
                entry.heatSetpoint = this.readUInt16();
            }
            if (cool) {
                entry.coolSetpoint = this.readUInt16();
            }
            result.push(entry);
        }
        return result;
    }
    writeListThermoTransitions(value) {
        for (const entry of value) {
            this.writeUInt16(entry.transitionTime);
            if (entry.hasOwnProperty('heatSetpoint')) {
                this.writeUInt16(entry.heatSetpoint);
            }
            if (entry.hasOwnProperty('coolSetpoint')) {
                this.writeUInt16(entry.coolSetpoint);
            }
        }
    }
    readGdpFrame(options) {
        // Commisioning
        if (options.payload.commandID === 0xE0) {
            const frame = {
                deviceID: this.readUInt8(),
                options: this.readUInt8(),
                extendedOptions: 0,
                securityKey: Buffer.alloc(16),
                keyMic: 0,
                outgoingCounter: 0,
                applicationInfo: 0,
                manufacturerID: 0,
                modelID: 0,
                numGdpCommands: 0,
                gpdCommandIdList: Buffer.alloc(0),
                numServerClusters: 0,
                numClientClusters: 0,
                gpdServerClusters: Buffer.alloc(0),
                gpdClientClusters: Buffer.alloc(0),
            };
            if (frame.options & 0x80) {
                frame.extendedOptions = this.readUInt8();
            }
            if (frame.extendedOptions & 0x20) {
                frame.securityKey = this.readBuffer(16);
            }
            if (frame.extendedOptions & 0x40) {
                frame.keyMic = this.readUInt32();
            }
            if (frame.extendedOptions & 0x80) {
                frame.outgoingCounter = this.readUInt32();
            }
            if (frame.options & 0x04) {
                frame.applicationInfo = this.readUInt8();
            }
            if (frame.applicationInfo & 0x01) {
                frame.manufacturerID = this.readUInt16();
            }
            if (frame.applicationInfo & 0x02) {
                frame.modelID = this.readUInt16();
            }
            if (frame.applicationInfo & 0x04) {
                frame.numGdpCommands = this.readUInt8();
                frame.gpdCommandIdList = this.readBuffer(frame.numGdpCommands);
            }
            if (frame.applicationInfo & 0x08) {
                const len = this.readUInt8();
                frame.numServerClusters = len & 0xF;
                frame.numClientClusters = (len >> 4) & 0xF;
                frame.gpdServerClusters = this.readBuffer(2 * frame.numServerClusters);
                frame.gpdClientClusters = this.readBuffer(2 * frame.numClientClusters);
            }
            return frame;
            // Channel Request
        }
        else if (options.payload.commandID === 0xE3) {
            const options = this.readUInt8();
            return {
                nextChannel: options & 0xF,
                nextNextChannel: options >> 4
            };
            // Manufacturer-specific Attribute Reporting
        }
        else if (options.payload.commandID == 0xA1) {
            const start = this.position;
            const frame = {
                manufacturerCode: this.readUInt16(),
                clusterID: this.readUInt16(),
                attributes: {},
            };
            const cluster = Utils.getCluster(frame.clusterID, frame.manufacturerCode);
            while (this.position - start < options.payload.payloadSize) {
                const attributeID = this.readUInt16();
                const type = this.readUInt8();
                let attribute = attributeID;
                try {
                    attribute = cluster.getAttribute(attributeID).name;
                }
                catch (_a) {
                    debug.info("Unknown attribute " + attributeID + " in cluster " + cluster.name);
                }
                frame.attributes[attribute] = this.read(definition_1.DataType[type], options);
            }
            return frame;
        }
        else if (this.position != this.buffer.length) {
            return { raw: this.buffer.slice(this.position) };
        }
        else {
            return {};
        }
    }
    writeGdpFrame(value) {
        if (value.commandID == 0xF0) { // Commissioning Reply
            const v = value;
            const panIDPresent = v.options & (1 << 0);
            const gpdSecurityKeyPresent = v.options & (1 << 1);
            const gpdKeyEncryption = v.options & (1 << 2);
            const securityLevel = v.options & (3 << 3) >> 3;
            const hasGPDKeyMIC = gpdKeyEncryption && gpdSecurityKeyPresent;
            const hasFrameCounter = gpdSecurityKeyPresent &&
                gpdKeyEncryption &&
                (securityLevel === 0b10 || securityLevel === 0b11);
            this.writeUInt8(1 +
                (panIDPresent ? 2 : 0) +
                (gpdSecurityKeyPresent ? 16 : 0) +
                (hasGPDKeyMIC ? 4 : 0) +
                (hasFrameCounter ? 4 : 0)); // Length
            this.writeUInt8(v.options);
            if (panIDPresent) {
                this.writeUInt16(v.panID);
            }
            if (gpdSecurityKeyPresent) {
                this.writeBuffer(v.securityKey, 16);
            }
            if (hasGPDKeyMIC) {
                this.writeUInt32(v.keyMic);
            }
            if (hasFrameCounter) {
                this.writeUInt32(v.frameCounter);
            }
        }
        else if (value.commandID == 0xF3) { // Channel configuration
            const v = value;
            this.writeUInt8(1);
            this.writeUInt8(v.operationalChannel & 0xF | ((v.basic ? 1 : 0) << 4));
        }
        else if (value.commandID == 0xF4 ||
            value.commandID == 0xF5 ||
            (value.commandID >= 0xF7 && value.commandID <= 0xFF)) {
            // Other commands sent to GPD
            const v = value;
            this.writeUInt8(v.buffer.length);
            this.writeBuffer(v.buffer, v.buffer.length);
        }
    }
    readListTuyaDataPointValues() {
        const value = [];
        while (this.isMore()) {
            try {
                const dp = this.readUInt8();
                const datatype = this.readUInt8();
                const len_hi = this.readUInt8();
                const len_lo = this.readUInt8();
                const data = this.readBuffer(len_lo + (len_hi << 8));
                value.push({ dp, datatype, data });
            }
            catch (error) {
                break;
            }
        }
        return value;
    }
    writeListTuyaDataPointValues(dpValues) {
        for (const dpValue of dpValues) {
            this.writeUInt8(dpValue.dp);
            this.writeUInt8(dpValue.datatype);
            const dataLen = dpValue.data.length;
            this.writeUInt8((dataLen >> 8) & 0xFF);
            this.writeUInt8(dataLen & 0xFF);
            this.writeBuffer(dpValue.data, dataLen);
        }
    }
    readListMiboxerZones() {
        const value = [];
        const len = this.readUInt8();
        for (let i = 0; i < len; i++) {
            value.push({
                groupId: this.readUInt16(),
                zoneNum: this.readUInt8(),
            });
        }
        return value;
    }
    readBigEndianUInt24() {
        return this.readBuffer(3).readUIntBE(0, 3);
    }
    writeListMiboxerZones(values) {
        this.writeUInt8(values.length);
        for (const value of values) {
            this.writeUInt16(value.groupId);
            this.writeUInt8(value.zoneNum);
        }
    }
    writeBigEndianUInt24(value) {
        const buffer = Buffer.alloc(3);
        buffer.writeUIntLE(value, 0, 3);
        this.writeBuffer(buffer.reverse(), 3);
    }
    readUInt40() {
        const lsb = this.readUInt32();
        const msb = this.readUInt8();
        return [msb, lsb];
    }
    writeUInt40(value) {
        this.writeUInt32(value[1]);
        this.writeUInt8(value[0]);
    }
    readUInt48() {
        const lsb = this.readUInt32();
        const msb = this.readUInt16();
        return [msb, lsb];
    }
    writeUInt48(value) {
        this.writeUInt32(value[1]);
        this.writeUInt16(value[0]);
    }
    readUInt56() {
        const lsb = this.readUInt32();
        const xsb = this.readUInt16();
        const msb = this.readUInt8();
        return [msb, xsb, lsb];
    }
    writeUInt56(value) {
        const temp = Buffer.alloc(8);
        temp.writeUInt32LE(value[1], 0);
        temp.writeUInt32LE(value[0], 4);
        this.writeBuffer(temp.slice(0, 7), 7);
    }
    readUInt64() {
        return this.readIeeeAddr();
    }
    writeUInt64(value) {
        const msb = parseInt(value.slice(2, 10), 16);
        const lsb = parseInt(value.slice(10), 16);
        this.writeUInt32(lsb);
        this.writeUInt32(msb);
    }
    writeStructuredSelector(value) {
        if (value != null) {
            const indexes = value.indexes || [];
            const indicatorType = value.indicatorType || tstype_1.StructuredIndicatorType.WriteWhole;
            const indicator = indexes.length + indicatorType;
            this.writeUInt8(indicator);
            for (const index of indexes) {
                this.writeUInt16(index);
            }
        }
    }
    write(type, value, options) {
        // TODO: write for the following is missing: struct
        type = aliases[type] || type;
        if (type === 'uint40') {
            return this.writeUInt40(value);
        }
        else if (type === 'EXTENSION_FIELD_SETS') {
            return this.writeExtensionFieldSets(value);
        }
        else if (type === 'LIST_ZONEINFO') {
            return this.writeListZoneInfo(value);
        }
        else if (type === 'LIST_THERMO_TRANSITIONS') {
            return this.writeListThermoTransitions(value);
        }
        else if (type === 'LIST_TUYA_DATAPOINT_VALUES') {
            return this.writeListTuyaDataPointValues(value);
        }
        else if (type === 'LIST_MIBOXER_ZONES') {
            return this.writeListMiboxerZones(value);
        }
        else if (type === 'BIG_ENDIAN_UINT24') {
            return this.writeBigEndianUInt24(value);
        }
        else if (type === 'GDP_FRAME') {
            return this.writeGdpFrame(value);
        }
        else if (type === 'uint48') {
            return this.writeUInt48(value);
        }
        else if (type === 'uint56') {
            return this.writeUInt56(value);
        }
        else if (type === 'uint64') {
            return this.writeUInt64(value);
        }
        else if (type === 'charStr') {
            return this.writeCharStr(value);
        }
        else if (type === 'longCharStr') {
            return this.writeLongCharStr(value);
        }
        else if (type === 'octetStr') {
            return this.writeOctetStr(value);
        }
        else if (type === 'array') {
            return this.writeArray(value);
        }
        else if (type === 'USE_DATA_TYPE') {
            return this.writeUseDataType(value, options);
        }
        else if (type == 'STRUCTURED_SELECTOR') {
            return this.writeStructuredSelector(value);
        }
        else {
            // In case the type is undefined, write it as a buffer to easily allow for custom types
            // e.g. for https://github.com/Koenkk/zigbee-herdsman/issues/127
            type = type === undefined ? 'BUFFER' : type;
            // TODO: remove uppercase once dataTypes are snake case
            return super.write(type.toUpperCase(), value, options);
        }
    }
    read(type, options) {
        type = aliases[type] || type;
        if (type === 'USE_DATA_TYPE') {
            return this.readUseDataType(options);
        }
        else if (type === 'EXTENSION_FIELD_SETS') {
            return this.readExtensionFieldSets();
        }
        else if (type === 'LIST_ZONEINFO') {
            return this.readListZoneInfo(options);
        }
        else if (type === 'LIST_THERMO_TRANSITIONS') {
            return this.readListThermoTransitions(options);
        }
        else if (type === 'GDP_FRAME') {
            return this.readGdpFrame(options);
        }
        else if (type === 'LIST_TUYA_DATAPOINT_VALUES') {
            return this.readListTuyaDataPointValues();
        }
        else if (type === 'LIST_MIBOXER_ZONES') {
            return this.readListMiboxerZones();
        }
        else if (type === 'BIG_ENDIAN_UINT24') {
            return this.readBigEndianUInt24();
        }
        else if (type === 'uint40') {
            return this.readUInt40();
        }
        else if (type === 'uint48') {
            return this.readUInt48();
        }
        else if (type === 'uint56') {
            return this.readUInt56();
        }
        else if (type === 'uint64') {
            return this.readUInt64();
        }
        else if (type === 'octetStr') {
            return this.readOctetStr();
        }
        else if (type === 'charStr') {
            return this.readCharStr(options);
        }
        else if (type === 'longCharStr') {
            return this.readLongCharStr();
        }
        else if (type === 'array') {
            return this.readArray();
        }
        else if (type === 'struct') {
            return this.readStruct();
        }
        else {
            // TODO: remove uppercase once dataTypes are snake case
            return super.read(type.toUpperCase(), options);
        }
    }
}
exports.default = BuffaloZcl;
//# sourceMappingURL=buffaloZcl.js.map