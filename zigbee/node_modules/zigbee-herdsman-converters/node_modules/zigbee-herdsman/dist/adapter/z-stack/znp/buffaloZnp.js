"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const buffalo_1 = require("../../../buffalo");
const routingTableStatusLookup = {
    0: 'ACTIVE',
    1: 'DISCOVERY_UNDERWAY',
    2: 'DISCOVERY_FAILED',
    3: 'INACTIVE',
};
class BuffaloZnp extends buffalo_1.Buffalo {
    readListRoutingTable(options) {
        const value = [];
        for (let i = 0; i < options.length; i++) {
            value.push({
                destNwkAddr: this.readUInt16(),
                routeStatus: routingTableStatusLookup[this.readUInt8()],
                nextHopNwkAddr: this.readUInt16(),
            });
        }
        return value;
    }
    readListBindTable(options) {
        const value = [];
        for (let i = 0; i < options.length; i++) {
            const item = {
                srcAddr: this.readIeeeAddr(),
                srcEp: this.readUInt8(),
                clusterId: this.readUInt16(),
                dstAddrMode: this.readUInt8(),
                dstAddr: this.readIeeeAddr(),
            };
            if (item.dstAddrMode === 3) {
                item.dstEp = this.readUInt8();
            }
            value.push(item);
        }
        return value;
    }
    readListNeighborLqi(options) {
        const value = [];
        for (let i = 0; i < options.length; i++) {
            const prefix = {
                extPandId: this.readIeeeAddr(),
                extAddr: this.readIeeeAddr(),
                nwkAddr: this.readUInt16()
            };
            const bitfields = this.readUInt8();
            value.push({
                ...prefix,
                deviceType: bitfields & 0x03,
                rxOnWhenIdle: (bitfields & 0x0C) >> 2,
                relationship: (bitfields & 0x70) >> 4,
                permitJoin: this.readUInt8() & 0x03,
                depth: this.readUInt8(),
                lqi: this.readUInt8()
            });
        }
        return value;
    }
    readListNetwork(options) {
        const value = [];
        for (let i = 0; i < options.length; i++) {
            const neightborPanId = this.readUInt16();
            const logicalChannel = this.readUInt8();
            const value1 = this.readUInt8();
            const value2 = this.readUInt8();
            const permitJoin = this.readUInt8();
            value.push({
                neightborPanId,
                logicalChannel,
                stackProfile: value1 & 0x0F,
                zigbeeVersion: (value1 & 0xF0) >> 4,
                beaconOrder: value2 & 0x0F,
                superFrameOrder: (value2 & 0xF0) >> 4,
                permitJoin
            });
        }
        return value;
    }
    readListAssocDev(options) {
        const value = [];
        const listLength = options.length - options.startIndex;
        for (let i = 0; i < listLength; i++) {
            // There are max 70 bytes in the list (= 35 uint16)
            if (i === 35) {
                break;
            }
            value.push(this.readUInt16());
        }
        return value;
    }
    read(type, options) {
        if (type === 'LIST_ROUTING_TABLE') {
            return this.readListRoutingTable(options);
        }
        else if (type === 'LIST_BIND_TABLE') {
            return this.readListBindTable(options);
        }
        else if (type === 'LIST_NEIGHBOR_LQI') {
            return this.readListNeighborLqi(options);
        }
        else if (type === 'LIST_NETWORK') {
            return this.readListNetwork(options);
        }
        else if (type === 'LIST_ASSOC_DEV') {
            return this.readListAssocDev(options);
        }
        else {
            return super.read(type, options);
        }
    }
}
exports.default = BuffaloZnp;
//# sourceMappingURL=buffaloZnp.js.map