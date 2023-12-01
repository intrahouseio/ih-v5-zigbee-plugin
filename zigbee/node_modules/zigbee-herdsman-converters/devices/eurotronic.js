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
const exposes = __importStar(require("../lib/exposes"));
const fromZigbee_1 = __importDefault(require("../converters/fromZigbee"));
const legacy = __importStar(require("../lib/legacy"));
const toZigbee_1 = __importDefault(require("../converters/toZigbee"));
const ota = __importStar(require("../lib/ota"));
const constants = __importStar(require("../lib/constants"));
const reporting = __importStar(require("../lib/reporting"));
const e = exposes.presets;
const definitions = [
    {
        zigbeeModel: ['SPZB0001'],
        model: 'SPZB0001',
        vendor: 'Eurotronic',
        description: 'Spirit Zigbee wireless heater thermostat',
        fromZigbee: [legacy.fz.eurotronic_thermostat, fromZigbee_1.default.battery],
        toZigbee: [toZigbee_1.default.thermostat_occupied_heating_setpoint, toZigbee_1.default.thermostat_unoccupied_heating_setpoint,
            toZigbee_1.default.thermostat_local_temperature_calibration, toZigbee_1.default.eurotronic_thermostat_system_mode, toZigbee_1.default.eurotronic_host_flags,
            toZigbee_1.default.eurotronic_error_status, toZigbee_1.default.thermostat_setpoint_raise_lower, toZigbee_1.default.thermostat_control_sequence_of_operation,
            toZigbee_1.default.thermostat_remote_sensing, toZigbee_1.default.thermostat_local_temperature, toZigbee_1.default.thermostat_running_state,
            toZigbee_1.default.eurotronic_current_heating_setpoint, toZigbee_1.default.eurotronic_trv_mode, toZigbee_1.default.eurotronic_valve_position],
        exposes: [e.battery(), e.climate().withSetpoint('occupied_heating_setpoint', 5, 30, 0.5).withLocalTemperature()
                .withSystemMode(['off', 'auto', 'heat']).withRunningState(['idle', 'heat'])
                .withLocalTemperatureCalibration()
                .withPiHeatingDemand(),
            e.enum('trv_mode', exposes.access.ALL, [1, 2])
                .withDescription('Select between direct control of the valve via the `valve_position` or automatic control of the ' +
                'valve based on the `current_heating_setpoint`. For manual control set the value to 1, for automatic control set the value ' +
                'to 2 (the default). When switched to manual mode the display shows a value from 0 (valve closed) to 100 (valve fully open) ' +
                'and the buttons on the device are disabled.'),
            e.numeric('valve_position', exposes.access.ALL).withValueMin(0).withValueMax(255)
                .withDescription('Directly control the radiator valve when `trv_mode` is set to 1. The values range from 0 (valve ' +
                'closed) to 255 (valve fully open)')],
        ota: ota.zigbeeOTA,
        configure: async (device, coordinatorEndpoint, logger) => {
            const endpoint = device.getEndpoint(1);
            const options = { manufacturerCode: 4151 };
            await reporting.bind(endpoint, coordinatorEndpoint, ['genPowerCfg', 'hvacThermostat']);
            await reporting.thermostatTemperature(endpoint);
            await reporting.thermostatPIHeatingDemand(endpoint);
            await reporting.thermostatOccupiedHeatingSetpoint(endpoint);
            await reporting.thermostatUnoccupiedHeatingSetpoint(endpoint);
            await endpoint.configureReporting('hvacThermostat', [{ attribute: { ID: 0x4003, type: 41 }, minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR, reportableChange: 25 }], options);
            await endpoint.configureReporting('hvacThermostat', [{ attribute: { ID: 0x4008, type: 34 }, minimumReportInterval: 0,
                    maximumReportInterval: constants.repInterval.HOUR, reportableChange: 1 }], options);
        },
    },
];
exports.default = definitions;
module.exports = definitions;
//# sourceMappingURL=eurotronic.js.map