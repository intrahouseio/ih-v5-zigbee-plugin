"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fromZigbee_1 = __importDefault(require("../converters/fromZigbee"));
const extend_1 = __importDefault(require("../lib/extend"));
const definitions = [
    {
        fingerprint: [{ modelID: 'TS0001', manufacturerName: '_TZ3000_bezfthwc' }],
        model: 'RDCBC/Z',
        vendor: 'SOHAN Electric',
        description: 'DIN circuit breaker (1 pole / 2 poles)',
        extend: extend_1.default.switch(),
        fromZigbee: [fromZigbee_1.default.on_off, fromZigbee_1.default.ignore_basic_report, fromZigbee_1.default.ignore_time_read],
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=sohan_electric.js.map