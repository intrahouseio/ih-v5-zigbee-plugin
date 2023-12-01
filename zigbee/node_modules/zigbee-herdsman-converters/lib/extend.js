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
const exposes = __importStar(require("./exposes"));
const toZigbee_1 = __importDefault(require("../converters/toZigbee"));
const fromZigbee_1 = __importDefault(require("../converters/fromZigbee"));
const light = __importStar(require("./light"));
const e = exposes.presets;
const extend = {
    switch: (options = {}) => {
        options = { disablePowerOnBehavior: false, toZigbee: [], fromZigbee: [], exposes: [], ...options };
        const exposes = [e.switch(), ...options.exposes];
        const fromZigbee = [fromZigbee_1.default.on_off, fromZigbee_1.default.ignore_basic_report, ...options.fromZigbee];
        const toZigbee = [toZigbee_1.default.on_off, ...options.toZigbee];
        if (!options.disablePowerOnBehavior) {
            exposes.push(e.power_on_behavior(['off', 'on', 'toggle', 'previous']));
            fromZigbee.push(fromZigbee_1.default.power_on_behavior);
            toZigbee.push(toZigbee_1.default.power_on_behavior);
        }
        return { exposes, fromZigbee, toZigbee };
    },
    light_onoff_brightness: (options = {}) => {
        options = {
            disableEffect: false, disablePowerOnBehavior: false, disableMoveStep: false, disableTransition: false,
            toZigbee: [], fromZigbee: [], exposes: [], ...options,
        };
        const exposes = [e.light_brightness(), ...(!options.disableEffect ? [e.effect()] : []), ...options.exposes];
        const fromZigbee = [fromZigbee_1.default.on_off, fromZigbee_1.default.brightness, fromZigbee_1.default.level_config, fromZigbee_1.default.ignore_basic_report, ...options.fromZigbee];
        const toZigbee = [toZigbee_1.default.light_onoff_brightness, toZigbee_1.default.ignore_rate, toZigbee_1.default.level_config, ...options.toZigbee,
            ...(!options.disableTransition ? [toZigbee_1.default.ignore_transition] : []),
            ...(!options.disableEffect ? [toZigbee_1.default.effect] : []),
            ...(!options.disableMoveStep ? [toZigbee_1.default.light_brightness_move, toZigbee_1.default.light_brightness_step] : [])];
        if (!options.disablePowerOnBehavior) {
            exposes.push(e.power_on_behavior(['off', 'on', 'toggle', 'previous']));
            fromZigbee.push(fromZigbee_1.default.power_on_behavior);
            toZigbee.push(toZigbee_1.default.power_on_behavior);
        }
        const result = { exposes, fromZigbee, toZigbee };
        if (!options.noConfigure) {
            result.configure = async (device, coordinatorEndpoint, logger) => {
                await light.configure(device, coordinatorEndpoint, logger, true);
            };
        }
        return result;
    },
    light_onoff_brightness_colortemp: (options = {}) => {
        options = {
            disableEffect: false, disableColorTempStartup: false, disablePowerOnBehavior: false,
            toZigbee: [], fromZigbee: [], exposes: [], ...options,
        };
        const exposes = [e.light_brightness_colortemp(options.colorTempRange), ...(!options.disableEffect ? [e.effect()] : []),
            ...options.exposes];
        const toZigbee = [toZigbee_1.default.light_onoff_brightness, toZigbee_1.default.light_colortemp, toZigbee_1.default.ignore_transition, toZigbee_1.default.ignore_rate, toZigbee_1.default.light_brightness_move,
            toZigbee_1.default.light_colortemp_move, toZigbee_1.default.light_brightness_step, toZigbee_1.default.light_colortemp_step, toZigbee_1.default.light_colortemp_startup, toZigbee_1.default.level_config,
            ...options.toZigbee,
            toZigbee_1.default.light_color_options, toZigbee_1.default.light_color_mode, ...(!options.disableEffect ? [toZigbee_1.default.effect] : [])];
        const fromZigbee = [fromZigbee_1.default.color_colortemp, fromZigbee_1.default.on_off, fromZigbee_1.default.brightness, fromZigbee_1.default.level_config, fromZigbee_1.default.ignore_basic_report, ...options.fromZigbee];
        if (options.disableColorTempStartup) {
            exposes[0].removeFeature('color_temp_startup');
            toZigbee.splice(toZigbee.indexOf(toZigbee_1.default.light_colortemp_startup), 1);
        }
        if (!options.disablePowerOnBehavior) {
            exposes.push(e.power_on_behavior(['off', 'on', 'toggle', 'previous']));
            fromZigbee.push(fromZigbee_1.default.power_on_behavior);
            toZigbee.push(toZigbee_1.default.power_on_behavior);
        }
        const result = { exposes, fromZigbee, toZigbee };
        if (!options.noConfigure) {
            result.configure = async (device, coordinatorEndpoint, logger) => {
                await light.configure(device, coordinatorEndpoint, logger, true);
            };
        }
        return result;
    },
    light_onoff_brightness_color: (options = {}) => {
        options = {
            disableEffect: false, supportsHueAndSaturation: false, preferHueAndSaturation: false, disablePowerOnBehavior: false,
            toZigbee: [], fromZigbee: [], exposes: [], ...options,
        };
        const exposes = [(options.supportsHueAndSaturation ? e.light_brightness_color(options.preferHueAndSaturation) : e.light_brightness_colorxy()),
            ...(!options.disableEffect ? [e.effect()] : []), ...options.exposes];
        const fromZigbee = [fromZigbee_1.default.color_colortemp, fromZigbee_1.default.on_off, fromZigbee_1.default.brightness, fromZigbee_1.default.level_config, fromZigbee_1.default.ignore_basic_report, ...options.fromZigbee];
        const toZigbee = [toZigbee_1.default.light_onoff_brightness, toZigbee_1.default.light_color, toZigbee_1.default.ignore_transition, toZigbee_1.default.ignore_rate, toZigbee_1.default.light_brightness_move,
            toZigbee_1.default.light_brightness_step, toZigbee_1.default.level_config, toZigbee_1.default.light_hue_saturation_move, ...options.toZigbee,
            toZigbee_1.default.light_hue_saturation_step, toZigbee_1.default.light_color_options, toZigbee_1.default.light_color_mode, ...(!options.disableEffect ? [toZigbee_1.default.effect] : [])];
        const meta = { supportsHueAndSaturation: options.supportsHueAndSaturation };
        if (!options.disablePowerOnBehavior) {
            exposes.push(e.power_on_behavior(['off', 'on', 'toggle', 'previous']));
            fromZigbee.push(fromZigbee_1.default.power_on_behavior);
            toZigbee.push(toZigbee_1.default.power_on_behavior);
        }
        const result = { exposes, fromZigbee, toZigbee, meta };
        if (!options.noConfigure) {
            result.configure = async (device, coordinatorEndpoint, logger) => {
                await light.configure(device, coordinatorEndpoint, logger, false);
            };
        }
        return result;
    },
    light_onoff_brightness_colortemp_color: (options = {}) => {
        options = {
            disableEffect: false, supportsHueAndSaturation: false, disableColorTempStartup: false, preferHueAndSaturation: false,
            disablePowerOnBehavior: false, toZigbee: [], fromZigbee: [], exposes: [], ...options,
        };
        const exposes = [
            (options.supportsHueAndSaturation ? e.light_brightness_colortemp_color(options.colorTempRange, options.preferHueAndSaturation) :
                e.light_brightness_colortemp_colorxy(options.colorTempRange)), ...(!options.disableEffect ? [e.effect()] : []),
            ...options.exposes,
        ];
        const fromZigbee = [fromZigbee_1.default.color_colortemp, fromZigbee_1.default.on_off, fromZigbee_1.default.brightness, fromZigbee_1.default.level_config, fromZigbee_1.default.ignore_basic_report, ...options.fromZigbee];
        const toZigbee = [
            toZigbee_1.default.light_onoff_brightness, toZigbee_1.default.light_color_colortemp, toZigbee_1.default.ignore_transition, toZigbee_1.default.ignore_rate, toZigbee_1.default.light_brightness_move,
            toZigbee_1.default.light_colortemp_move, toZigbee_1.default.light_brightness_step, toZigbee_1.default.light_colortemp_step, toZigbee_1.default.light_hue_saturation_move,
            toZigbee_1.default.light_hue_saturation_step, toZigbee_1.default.light_colortemp_startup, toZigbee_1.default.level_config, toZigbee_1.default.light_color_options,
            toZigbee_1.default.light_color_mode, ...(!options.disableEffect ? [toZigbee_1.default.effect] : []), ...options.toZigbee
        ];
        const meta = { supportsHueAndSaturation: options.supportsHueAndSaturation };
        if (options.disableColorTempStartup) {
            exposes[0].removeFeature('color_temp_startup');
            toZigbee.splice(toZigbee.indexOf(toZigbee_1.default.light_colortemp_startup), 1);
        }
        if (!options.disablePowerOnBehavior) {
            exposes.push(e.power_on_behavior(['off', 'on', 'toggle', 'previous']));
            fromZigbee.push(fromZigbee_1.default.power_on_behavior);
            toZigbee.push(toZigbee_1.default.power_on_behavior);
        }
        const result = { exposes, fromZigbee, toZigbee, meta };
        if (!options.noConfigure) {
            result.configure = async (device, coordinatorEndpoint, logger) => {
                await light.configure(device, coordinatorEndpoint, logger, true);
            };
        }
        return result;
    },
};
exports.default = extend;
module.exports = extend;
//# sourceMappingURL=extend.js.map