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
exports.fzLegrand = exports.tzLegrand = exports.readInitialBatteryState = exports._067776 = exports.legrandOptions = void 0;
const exposes = __importStar(require("./exposes"));
const utils = __importStar(require("../lib/utils"));
const e = exposes.presets;
const ea = exposes.access;
const shutterCalibrationModes = {
    0: { description: 'classic_nllv', onlyNLLV: true },
    1: { description: 'specific_nllv', onlyNLLV: true },
    2: { description: 'up_down_stop', onlyNLLV: false },
    3: { description: 'temporal', onlyNLLV: false },
    4: { description: 'venetian_bso', onlyNLLV: false },
};
const ledModes = {
    1: 'led_in_dark',
    2: 'led_if_on',
};
const getApplicableCalibrationModes = (isNLLVSwitch) => {
    return Object.fromEntries(Object.entries(shutterCalibrationModes)
        .filter((e) => isNLLVSwitch ? true : e[1].onlyNLLV === false)
        .map((e) => [e[0], e[1].description]));
};
exports.legrandOptions = { manufacturerCode: 0x1021, disableDefaultResponse: true };
exports._067776 = {
    getCover: () => {
        const c = e.cover_position();
        if (c.hasOwnProperty('features')) {
            c.features.push(new exposes.Numeric('tilt', ea.ALL)
                .withValueMin(0).withValueMax(100)
                .withValueStep(25)
                .withPreset('Closed', 0, 'Vertical')
                .withPreset('25 %', 25, '25%')
                .withPreset('50 %', 50, '50%')
                .withPreset('75 %', 75, '75%')
                .withPreset('Open', 100, 'Horizontal')
                .withUnit('%')
                .withDescription('Tilt percentage of that cover'));
        }
        return c;
    },
    getCalibrationModes: (isNLLVSwitch) => {
        const modes = getApplicableCalibrationModes(isNLLVSwitch);
        return e.enum('calibration_mode', ea.ALL, Object.values(modes))
            .withDescription('Defines the calibration mode of the switch. (Caution: Changing modes requires a recalibration of the shutter switch!)');
    },
};
const readInitialBatteryState = async (type, data, device, options) => {
    if (['deviceAnnounce'].includes(type)) {
        const endpoint = device.getEndpoint(1);
        await endpoint.read('genPowerCfg', ['batteryVoltage'], exports.legrandOptions);
    }
};
exports.readInitialBatteryState = readInitialBatteryState;
exports.tzLegrand = {
    auto_mode: {
        key: ['auto_mode'],
        convertSet: async (entity, key, value, meta) => {
            const mode = utils.getFromLookup(value, { 'off': 0x00, 'auto': 0x02, 'on_override': 0x03 });
            const payload = { data: Buffer.from([mode]) };
            await entity.command('manuSpecificLegrandDevices3', 'command0', payload);
            return { state: { 'auto_mode': value } };
        },
    },
    calibration_mode: (isNLLVSwitch) => {
        return {
            key: ['calibration_mode'],
            convertSet: async (entity, key, value, meta) => {
                const applicableModes = getApplicableCalibrationModes(isNLLVSwitch);
                utils.validateValue(value, Object.values(applicableModes));
                const idx = utils.getKey(applicableModes, value);
                await entity.write('closuresWindowCovering', { 'calibrationMode': idx }, exports.legrandOptions);
            },
            convertGet: async (entity, key, meta) => {
                await entity.read('closuresWindowCovering', ['calibrationMode'], exports.legrandOptions);
            },
        };
    },
    led_mode: {
        key: ['led_in_dark', 'led_if_on'],
        convertSet: async (entity, key, value, meta) => {
            utils.validateValue(key, Object.values(ledModes));
            const idx = utils.getKey(ledModes, key);
            const state = value === 'ON' || (value === 'OFF' ? false : !!value);
            const payload = { [idx]: { value: state, type: 16 } };
            await entity.write('manuSpecificLegrandDevices', payload, exports.legrandOptions);
            return { state: { [key]: value } };
        },
        convertGet: async (entity, key, meta) => {
            utils.validateValue(key, Object.values(ledModes));
            const idx = utils.getKey(ledModes, key);
            await entity.read('manuSpecificLegrandDevices', [Number(idx)], exports.legrandOptions);
        },
    },
};
exports.fzLegrand = {
    calibration_mode: (isNLLVSwitch) => {
        return {
            cluster: 'closuresWindowCovering',
            type: ['attributeReport', 'readResponse'],
            convert: (model, msg, publish, options, meta) => {
                const attr = 'calibrationMode';
                if (msg.data.hasOwnProperty(attr)) {
                    const applicableModes = getApplicableCalibrationModes(isNLLVSwitch);
                    const idx = msg.data[attr];
                    utils.validateValue(String(idx), Object.keys(applicableModes));
                    const calMode = applicableModes[idx];
                    return { calibration_mode: calMode };
                }
            },
        };
    },
    cluster_fc01: {
        cluster: 'manuSpecificLegrandDevices',
        type: ['readResponse'],
        convert: (model, msg, publish, options, meta) => {
            const payload = {};
            if (msg.data.hasOwnProperty('0')) {
                const option0 = msg.data['0'];
                if (option0 === 0x0001)
                    payload.device_mode = 'pilot_off';
                else if (option0 === 0x0002)
                    payload.device_mode = 'pilot_on';
                else if (option0 === 0x0003)
                    payload.device_mode = 'switch';
                else if (option0 === 0x0004)
                    payload.device_mode = 'auto';
                else if (option0 === 0x0100)
                    payload.device_mode = 'dimmer_off';
                else if (option0 === 0x0101)
                    payload.device_mode = 'dimmer_on';
                else {
                    meta.logger.warn(`Device_mode ${option0} not recognized, please fix me!`);
                    payload.device_mode = 'unknown';
                }
            }
            if (msg.data.hasOwnProperty('1'))
                payload.led_in_dark = msg.data['1'] === 0x00 ? 'OFF' : 'ON';
            if (msg.data.hasOwnProperty('2'))
                payload.led_if_on = msg.data['2'] === 0x00 ? 'OFF' : 'ON';
            return payload;
        },
    },
};
//# sourceMappingURL=legrand.js.map