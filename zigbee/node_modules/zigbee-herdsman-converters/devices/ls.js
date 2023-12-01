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
const extend_1 = __importDefault(require("../lib/extend"));
const exposes = __importStar(require("../lib/exposes"));
const e = exposes.presets;
const definitions = [
    {
        zigbeeModel: ['Emotion'],
        model: 'A319463',
        vendor: 'LS Deutschland GmbH',
        description: 'Home base',
        fromZigbee: extend_1.default.light_onoff_brightness_colortemp_color({ colorTempRange: [153, 454] }).fromZigbee,
        toZigbee: extend_1.default.light_onoff_brightness_colortemp_color({ colorTempRange: [153, 454] }).toZigbee,
        configure: extend_1.default.light_onoff_brightness_colortemp_color({ colorTempRange: [153, 454] }).configure,
        exposes: (device, options) => {
            if (!device)
                return [e.light_brightness_colortemp_colorxy([153, 454]), e.linkquality()];
            return [e.linkquality(), ...device.endpoints.filter((ep) => ep.ID !== 242).map((ep) => {
                    return e.light_brightness_colortemp_colorxy([153, 454]).withEndpoint(`l${ep.ID}`);
                })];
        },
        meta: { multiEndpoint: true },
        endpoint: (device) => {
            return Object.fromEntries(device.endpoints.filter((ep) => ep.ID !== 242).map((ep) => [`l${ep.ID}`, ep.ID]));
        },
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=ls.js.map