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
const exposes = __importStar(require("../lib/exposes"));
const tuya = __importStar(require("../lib/tuya"));
const legacy = __importStar(require("../lib/legacy"));
const e = exposes.presets;
const ea = exposes.access;
const definitions = [
    {
        fingerprint: tuya.fingerprint('TS0601', ['_TZE200_arge1ptm', '_TZE200_anv5ujhv']),
        model: 'QT-05M',
        vendor: 'QOTO',
        description: 'Solar powered garden watering timer',
        fromZigbee: [fromZigbee_1.default.ignore_basic_report, fromZigbee_1.default.ignore_tuya_set_time, fromZigbee_1.default.ignore_onoff_report, legacy.fromZigbee.watering_timer],
        toZigbee: [legacy.tz.valve_state, legacy.tz.shutdown_timer, legacy.tz.valve_state_auto_shutdown],
        exposes: [
            e.numeric('water_flow', ea.STATE).withUnit('%').withValueMin(0).withDescription('Current water flow in %.'),
            e.numeric('last_watering_duration', ea.STATE).withUnit('sec').withValueMin(0)
                .withDescription('Last watering duration in seconds.'),
            e.numeric('remaining_watering_time', ea.STATE).withUnit('sec').withValueMin(0)
                .withDescription('Remaning watering time (for auto shutdown). Updates every minute, and every 10s in the last minute.'),
            e.numeric('valve_state', ea.STATE_SET).withValueMin(0).withValueMax(100).withValueStep(5).withUnit('%')
                .withDescription('Set valve to %.'),
            e.numeric('shutdown_timer', ea.STATE_SET).withValueMin(0).withValueMax(14400).withUnit('sec')
                .withDescription('Auto shutdown in seconds.'),
            e.numeric('valve_state_auto_shutdown', ea.STATE_SET).withValueMin(0).withValueMax(100).withValueStep(5).withUnit('%')
                .withDescription('Set valve to % with auto shutdown.'),
            e.battery(),
        ],
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=qoto.js.map