"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const toZigbee_1 = __importDefault(require("../converters/toZigbee"));
const extend_1 = __importDefault(require("../lib/extend"));
const extendData = extend_1.default.light_onoff_brightness_colortemp_color({ colorTempRange: [250, 454] });
const definitions = [
    {
        zigbeeModel: ['ZB-CL01'],
        model: 'ZB-CL01',
        vendor: 'KURVIA',
        description: 'GU10 GRBWC built from AliExpress',
        extend: extendData,
        toZigbee: [toZigbee_1.default.on_off, ...extendData.toZigbee],
        meta: { applyRedFix: true, supportsEnhancedHue: false },
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=kurvia.js.map