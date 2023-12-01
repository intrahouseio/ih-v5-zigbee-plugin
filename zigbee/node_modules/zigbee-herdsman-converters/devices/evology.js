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
const fromZigbee_1 = __importDefault(require("../converters/fromZigbee"));
const toZigbee_1 = __importDefault(require("../converters/toZigbee"));
const reporting = __importStar(require("../lib/reporting"));
const exposes = __importStar(require("../lib/exposes"));
const e = exposes.presets;
const definitions = [
    {
        zigbeeModel: ['PSE03-V1.1.0'],
        model: 'PSE03-V1.1.0',
        vendor: 'EVOLOGY',
        description: 'Sound and flash siren',
        fromZigbee: [fromZigbee_1.default.ignore_basic_report, fromZigbee_1.default.ias_wd, fromZigbee_1.default.ias_enroll, fromZigbee_1.default.ias_siren],
        toZigbee: [toZigbee_1.default.warning],
        meta: { disableDefaultResponse: true },
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint = device.getEndpoint(1);
            await reporting.bind(endpoint, coordinatorEndpoint, ['genPowerCfg', 'ssIasZone', 'ssIasWd', 'genBasic']);
            await endpoint.read('ssIasZone', ['zoneState', 'iasCieAddr', 'zoneId', 'zoneStatus']);
            await endpoint.read('ssIasWd', ['maxDuration']);
        },
        exposes: [e.warning().removeFeature('strobe_level').removeFeature('strobe').removeFeature('strobe_duty_cycle')],
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=evology.js.map