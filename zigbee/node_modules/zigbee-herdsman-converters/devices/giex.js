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
Object.defineProperty(exports, "__esModule", { value: true });
const exposes = __importStar(require("../lib/exposes"));
const tuya = __importStar(require("../lib/tuya"));
const legacy = __importStar(require("../lib/legacy"));
const e = exposes.presets;
const { presets: ep, access: ea } = exposes;
const MINUTES_IN_A_DAY = 1440;
const SECONDS_IN_12_HOURS = 43200;
const exportTemplates = {
    giexWaterValve: {
        vendor: 'GiEX',
        description: 'Water irrigation valve',
        onEvent: tuya.onEventSetLocalTime,
        fromZigbee: [legacy.fromZigbee.giexWaterValve],
        toZigbee: [legacy.toZigbee.giexWaterValve],
        exposes: [
            ep.battery(),
            e.binary(legacy.giexWaterValve.state, ea.STATE_SET, 'ON', 'OFF')
                .withDescription('State'),
            e.enum(legacy.giexWaterValve.mode, ea.STATE_SET, ['duration', 'capacity'])
                .withDescription('Irrigation mode'),
            e.numeric(legacy.giexWaterValve.cycleIrrigationNumTimes, ea.STATE_SET)
                .withValueMin(0)
                .withValueMax(100)
                .withDescription('Number of cycle irrigation times, set to 0 for single cycle'),
            e.numeric(legacy.giexWaterValve.irrigationStartTime, ea.STATE)
                .withDescription('Last irrigation start time'),
            e.numeric(legacy.giexWaterValve.irrigationEndTime, ea.STATE)
                .withDescription('Last irrigation end time'),
            e.numeric(legacy.giexWaterValve.lastIrrigationDuration, ea.STATE)
                .withDescription('Last irrigation duration'),
            e.numeric(legacy.giexWaterValve.waterConsumed, ea.STATE)
                .withUnit('L')
                .withDescription('Last irrigation water consumption'),
        ],
    },
};
const definitions = [
    // _TZE200_sh1btabb uses minutes, timezone is GMT+8
    {
        ...exportTemplates.giexWaterValve,
        model: 'QT06_1',
        fingerprint: [
            { modelID: 'TS0601', manufacturerName: '_TZE200_sh1btabb' },
        ],
        exposes: [
            ...exportTemplates.giexWaterValve.exposes,
            e.numeric(legacy.giexWaterValve.irrigationTarget, ea.STATE_SET)
                .withValueMin(0)
                .withValueMax(MINUTES_IN_A_DAY)
                .withUnit('minutes or litres')
                .withDescription('Irrigation target, duration in minutes or capacity in litres (depending on mode)'),
            e.numeric(legacy.giexWaterValve.cycleIrrigationInterval, ea.STATE_SET)
                .withValueMin(0)
                .withValueMax(MINUTES_IN_A_DAY)
                .withUnit('min')
                .withDescription('Cycle irrigation interval'),
        ],
    },
    // _TZE200_a7sghmms uses seconds, timezone is local
    {
        ...exportTemplates.giexWaterValve,
        model: 'QT06_2',
        fingerprint: [
            { modelID: 'TS0601', manufacturerName: '_TZE200_a7sghmms' },
        ],
        exposes: [
            ...exportTemplates.giexWaterValve.exposes,
            e.numeric(legacy.giexWaterValve.irrigationTarget, ea.STATE_SET)
                .withValueMin(0)
                .withValueMax(SECONDS_IN_12_HOURS)
                .withUnit('seconds or litres')
                .withDescription('Irrigation target, duration in seconds or capacity in litres (depending on mode), ' +
                'set to 0 to leave the valve on indefinitely, ' +
                'for safety reasons the target will be forced to a minimum of 10 seconds in duration mode'),
            e.numeric(legacy.giexWaterValve.cycleIrrigationInterval, ea.STATE_SET)
                .withValueMin(0)
                .withValueMax(SECONDS_IN_12_HOURS)
                .withUnit('sec')
                .withDescription('Cycle irrigation interval'),
        ],
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=giex.js.map